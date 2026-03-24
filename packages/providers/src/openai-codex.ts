/**
 * OpenAI Codex provider — uses ChatGPT subscription OAuth instead of API keys.
 *
 * Routes requests to chatgpt.com/backend-api/codex/responses using an OAuth
 * access token obtained via the Codex PKCE flow. This is the same endpoint the
 * Codex CLI uses. It accepts the Responses API format, not Chat Completions.
 *
 * ChatGPT Plus/Pro subscribers can use their subscription for inference
 * without separate API billing.
 */

import { getLogger } from '@auxiora/logger';
import { getOpenAIReasoningEffort, isOpenAIReasoningModel } from './thinking-levels.js';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ToolDefinition,
} from './types.js';

const logger = getLogger('providers:openai-codex');

// Two endpoints share the same OAuth token:
// 1. Codex Responses API — for code-focused models (gpt-5.x-codex-*)
// 2. ChatGPT Conversation API — for general chat models (gpt-5.x, o3, o4-mini, etc.)
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CHATGPT_CONVERSATION_URL = 'https://chatgpt.com/backend-api/conversation';
const CHATGPT_MODELS_URL = 'https://chatgpt.com/backend-api/models';
const DEFAULT_MODEL = 'gpt-5.4';
const DEFAULT_MAX_TOKENS = 16384;

/** Models that should be routed to the Codex responses endpoint. */
function isCodexModel(model: string): boolean {
  return model.includes('codex');
}

export interface OpenAICodexProviderOptions {
  /** OAuth access token from the Codex PKCE flow */
  accessToken: string;
  /** ChatGPT account ID extracted from the JWT */
  accountId?: string;
  model?: string;
  maxTokens?: number;
  /** Callback to refresh the OAuth token when expired. Returns new access token. */
  onTokenRefresh?: () => Promise<string | null>;
  /** When the current token expires (epoch ms). Used for proactive refresh. */
  tokenExpiresAt?: number;
}

export class OpenAICodexProvider implements Provider {
  name = 'openai-codex';
  metadata: ProviderMetadata = {
    name: 'openai-codex',
    displayName: 'OpenAI (ChatGPT Subscription)',
    models: {
      'gpt-5.4': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['reasoning', 'code', 'vision', 'creative', 'agentic', 'multilingual'],
        isLocal: false,
      },
      'gpt-5.4-mini': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['fast', 'reasoning', 'code', 'cost-efficient'],
        isLocal: false,
      },
      'gpt-5.3-codex': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['code', 'agentic', 'reasoning'],
        isLocal: false,
      },
      'gpt-5.2-codex': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['code', 'agentic', 'reasoning'],
        isLocal: false,
      },
      'gpt-5.2': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['reasoning', 'code', 'vision', 'creative', 'agentic'],
        isLocal: false,
      },
      'gpt-5.1-codex-max': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['code', 'agentic', 'reasoning', 'precision'],
        isLocal: false,
      },
      'gpt-5.1-codex-mini': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['fast', 'code', 'agentic', 'cost-efficient'],
        isLocal: false,
      },
      // ChatGPT conversation models (routed via /backend-api/conversation)
      'o3': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: false,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['reasoning', 'math', 'code', 'analysis'],
        isLocal: false,
      },
      'o4-mini': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: false,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['fast', 'reasoning', 'cost-efficient'],
        isLocal: false,
      },
    },
    isAvailable: async () => {
      return !!this.accessToken;
    },
  };

  private accessToken: string;
  private accountId?: string;
  readonly defaultModel: string;
  private defaultMaxTokens: number;
  private onTokenRefresh?: () => Promise<string | null>;
  private tokenExpiresAt?: number;
  private refreshing = false;

  constructor(options: OpenAICodexProviderOptions) {
    this.accessToken = options.accessToken;
    this.accountId = options.accountId;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.onTokenRefresh = options.onTokenRefresh;
    this.tokenExpiresAt = options.tokenExpiresAt;
  }

  setAccessToken(accessToken: string, expiresAt?: number): void {
    this.accessToken = accessToken;
    if (expiresAt) {
      this.tokenExpiresAt = expiresAt;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'responses=experimental',
    };
    if (this.accountId) {
      headers['chatgpt-account-id'] = this.accountId;
    }
    return headers;
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.onTokenRefresh || !this.tokenExpiresAt) return;
    if (this.refreshing) return;

    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() < this.tokenExpiresAt - fiveMinutes) return;

    this.refreshing = true;
    try {
      logger.info('Proactively refreshing OpenAI Codex OAuth token...');
      const newToken = await this.onTokenRefresh();
      if (newToken) {
        this.accessToken = newToken;
        logger.info('OpenAI Codex OAuth token refreshed successfully');
      }
    } catch (err) {
      logger.warn(`Failed to refresh OpenAI Codex token: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.refreshing = false;
    }
  }

  /**
   * Convert our chat messages to the Responses API "input" format.
   */
  private buildResponsesInput(messages: ChatMessage[]): any[] {
    const input: any[] = [];

    for (const msg of messages) {
      input.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    return input;
  }

  /**
   * Convert our tool definitions to the Responses API format.
   */
  private buildResponsesTools(tools: ToolDefinition[]): any[] {
    return tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    }));
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    await this.ensureValidToken();
    const model = options?.model || this.defaultModel;
    // All models go through the Codex responses endpoint.
    // The conversation endpoint is blocked by Cloudflare.
    return this.completeViaCodex(messages, model, options);
  }

  private async completeViaCodex(
    messages: ChatMessage[],
    model: string,
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const input = this.buildResponsesInput(messages);
    const body: any = {
      model,
      input,
      instructions: options?.systemPrompt || 'You are a helpful assistant.',
      store: false,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.buildResponsesTools(options.tools);
    }

    if (options?.thinkingLevel && isOpenAIReasoningModel(model)) {
      const effort = getOpenAIReasoningEffort(options.thinkingLevel);
      if (effort) {
        body.reasoning = { effort };
      }
    }

    const response = await fetch(CODEX_RESPONSES_URL, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${text}`);
    }

    const data = await response.json() as any;
    return this.parseResponsesResult(data);
  }

  private async completeViaConversation(
    messages: ChatMessage[],
    model: string,
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const convMessages = this.buildConversationMessages(messages, options);
    const body = this.buildConversationBody(convMessages, model);

    const response = await fetch(CHATGPT_CONVERSATION_URL, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Accept': 'text/event-stream',
        'Oai-Language': 'en-US',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${text}`);
    }

    // Collect the full streamed response (conversation API is always streaming)
    const text = await response.text();
    return this.parseConversationFullResponse(text, model);
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    await this.ensureValidToken();
    const model = options?.model || this.defaultModel;

    // All models go through the Codex responses endpoint.
    yield* this.streamViaCodex(messages, model, options);
  }

  private async *streamViaCodex(
    messages: ChatMessage[],
    model: string,
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const input = this.buildResponsesInput(messages);
    const body: any = {
      model,
      input,
      instructions: options?.systemPrompt || 'You are a helpful assistant.',
      store: false,
      stream: true,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.buildResponsesTools(options.tools);
    }

    if (options?.thinkingLevel && isOpenAIReasoningModel(model)) {
      const effort = getOpenAIReasoningEffort(options.thinkingLevel);
      if (effort) {
        body.reasoning = { effort };
      }
    }

    try {
      const response = await fetch(CODEX_RESPONSES_URL, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        yield { type: 'error', error: `${response.status} ${text}` };
        return;
      }

      if (!response.body) {
        yield { type: 'error', error: 'No response body for streaming' };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield {
              type: 'done',
              finishReason: 'stop',
              usage: { inputTokens, outputTokens },
            };
            return;
          }

          try {
            const event = JSON.parse(data);

            // Handle different Responses API streaming events
            if (event.type === 'response.output_text.delta') {
              yield { type: 'text', content: event.delta || '' };
            } else if (event.type === 'response.function_call_arguments.done') {
              yield {
                type: 'tool_use',
                toolUse: {
                  id: event.item_id || event.call_id || '',
                  name: event.name || '',
                  input: JSON.parse(event.arguments || '{}'),
                },
              };
            } else if (event.type === 'response.completed' || event.type === 'response.done') {
              const resp = event.response || event;
              if (resp.usage) {
                inputTokens = resp.usage.input_tokens || 0;
                outputTokens = resp.usage.output_tokens || 0;
              }
              yield {
                type: 'done',
                finishReason: resp.status === 'completed' ? 'stop' : (resp.status || 'stop'),
                usage: { inputTokens, outputTokens },
              };
              return;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // If we exit the loop without a done event
      yield {
        type: 'done',
        finishReason: 'stop',
        usage: { inputTokens, outputTokens },
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse a non-streaming Responses API result into our CompletionResult format.
   */
  private parseResponsesResult(data: any): CompletionResult {
    const output = data.output || [];
    let content = '';
    const toolCalls: { id: string; name: string; input: any }[] = [];

    for (const item of output) {
      if (item.type === 'message') {
        for (const part of (item.content || [])) {
          if (part.type === 'output_text') {
            content += part.text || '';
          }
        }
      } else if (item.type === 'function_call') {
        toolCalls.push({
          id: item.call_id || item.id || '',
          name: item.name || '',
          input: JSON.parse(item.arguments || '{}'),
        });
      }
    }

    const usage = data.usage || {};
    const result: CompletionResult = {
      content,
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
      },
      model: data.model || this.defaultModel,
      finishReason: data.status === 'completed' ? 'stop' : (data.status || 'unknown'),
    };

    if (toolCalls.length > 0) {
      result.toolUse = toolCalls;
      result.finishReason = 'tool_use';
    }

    return result;
  }

  // ── ChatGPT Conversation API helpers ──────────────────────────────

  /**
   * Build a ChatGPT conversation message array.
   * The conversation API uses { id, author: { role }, content: { content_type, parts } }.
   */
  private buildConversationMessages(messages: ChatMessage[], options?: CompletionOptions): any[] {
    const result: any[] = [];

    // Inject system prompt as the first user-context message
    if (options?.systemPrompt) {
      result.push({
        id: crypto.randomUUID(),
        author: { role: 'system' },
        content: { content_type: 'text', parts: [options.systemPrompt] },
        metadata: {},
      });
    }

    for (const msg of messages) {
      result.push({
        id: crypto.randomUUID(),
        author: { role: msg.role === 'assistant' ? 'assistant' : 'user' },
        content: { content_type: 'text', parts: [msg.content] },
        metadata: {},
      });
    }

    return result;
  }

  /**
   * Build the full conversation API request body.
   */
  private buildConversationBody(messages: any[], model: string): any {
    return {
      action: 'next',
      messages,
      model,
      parent_message_id: crypto.randomUUID(),
      conversation_mode: { kind: 'primary_assistant' },
      force_use_sse: true,
      history_and_training_disabled: true,
      supported_encodings: ['sse'],
      supports_buffering: true,
    };
  }

  /**
   * Stream via the ChatGPT conversation endpoint.
   * The conversation API returns accumulated text in content.parts[0], not deltas.
   */
  private async *streamViaConversation(
    messages: ChatMessage[],
    model: string,
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const convMessages = this.buildConversationMessages(messages, options);
    const body = this.buildConversationBody(convMessages, model);

    try {
      const response = await fetch(CHATGPT_CONVERSATION_URL, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Accept': 'text/event-stream',
          'Oai-Language': 'en-US',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        yield { type: 'error', error: `${response.status} ${text}` };
        return;
      }

      if (!response.body) {
        yield { type: 'error', error: 'No response body for streaming' };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let previousText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield { type: 'done', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 } };
            return;
          }

          try {
            const event = JSON.parse(data);
            const msg = event.message;
            if (!msg || msg.author?.role !== 'assistant') continue;

            const parts = msg.content?.parts;
            if (!parts || parts.length === 0) continue;

            const currentText = typeof parts[0] === 'string' ? parts[0] : '';
            // Conversation API sends accumulated text, so diff to get the delta
            if (currentText.length > previousText.length) {
              const delta = currentText.slice(previousText.length);
              yield { type: 'text', content: delta };
              previousText = currentText;
            }

            if (msg.status === 'finished_successfully' && msg.end_turn) {
              yield { type: 'done', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 } };
              return;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      yield { type: 'done', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 } };
    } catch (error) {
      yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Parse a full conversation API SSE response (for non-streaming complete()).
   */
  private parseConversationFullResponse(sseText: string, model: string): CompletionResult {
    let finalText = '';
    const lines = sseText.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const event = JSON.parse(data);
        const msg = event.message;
        if (!msg || msg.author?.role !== 'assistant') continue;
        const parts = msg.content?.parts;
        if (parts && parts.length > 0 && typeof parts[0] === 'string') {
          finalText = parts[0]; // accumulated, so last one wins
        }
      } catch {
        // skip
      }
    }

    return {
      content: finalText,
      usage: { inputTokens: 0, outputTokens: 0 },
      model,
      finishReason: 'stop',
    };
  }
}
