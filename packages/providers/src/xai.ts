import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'grok-2';
const DEFAULT_MAX_TOKENS = 4096;
const BASE_URL = 'https://api.x.ai/v1';

export interface XAIProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

interface XAIChatMessage {
  role: string;
  content: string;
}

interface XAIChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface XAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface XAIChatResponse {
  choices: XAIChoice[];
  usage: XAIUsage;
  model: string;
}

interface XAIStreamDelta {
  content?: string;
}

interface XAIStreamChoice {
  delta: XAIStreamDelta;
  finish_reason: string | null;
}

interface XAIStreamChunk {
  choices: XAIStreamChoice[];
  usage?: XAIUsage;
}

export class XAIProvider implements Provider {
  name = 'xai';
  metadata: ProviderMetadata = {
    name: 'xai',
    displayName: 'xAI Grok',
    models: {
      'grok-2': {
        maxContextTokens: 131072,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.01,
        strengths: ['reasoning', 'code', 'creative'],
        isLocal: false,
      },
      'grok-2-mini': {
        maxContextTokens: 131072,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0002,
        costPer1kOutput: 0.001,
        strengths: ['fast', 'low-cost'],
        isLocal: false,
      },
    },
    isAvailable: async () => {
      try {
        const response = await fetch(`${BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };

  private apiKey: string;
  readonly defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: XAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  setActiveKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const xaiMessages = this.prepareMessages(messages, options);

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        messages: xaiMessages,
        temperature: options?.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as XAIChatResponse;
    const choice = data.choices[0];

    return {
      content: choice?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      model: data.model,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model || this.defaultModel;
    const xaiMessages = this.prepareMessages(messages, options);

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: options?.maxTokens || this.defaultMaxTokens,
          messages: xaiMessages,
          temperature: options?.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok) {
        throw new Error(`xAI API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

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
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          const chunk = JSON.parse(data) as XAIStreamChunk;

          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            yield { type: 'text', content: delta.content };
          }

          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens || 0;
            outputTokens = chunk.usage.completion_tokens || 0;
          }

          if (chunk.choices[0]?.finish_reason) {
            yield {
              type: 'done',
              finishReason: chunk.choices[0].finish_reason,
              usage: { inputTokens, outputTokens },
            };
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private prepareMessages(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): XAIChatMessage[] {
    const xaiMessages: XAIChatMessage[] = [];

    if (options?.systemPrompt) {
      xaiMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of messages) {
      xaiMessages.push({ role: msg.role, content: msg.content });
    }

    return xaiMessages;
  }
}
