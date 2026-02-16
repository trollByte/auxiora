import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'command-r-plus';
const DEFAULT_MAX_TOKENS = 4096;
const BASE_URL = 'https://api.cohere.com/v2';

export interface CohereProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

interface CohereChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CohereUsage {
  billed_units?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  tokens?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface CohereChatResponse {
  message: {
    role: string;
    content: Array<{ type: string; text: string }>;
  };
  finish_reason: string;
  usage: CohereUsage;
}

interface CohereStreamEvent {
  type: string;
  delta?: {
    message?: {
      content?: {
        text?: string;
      };
    };
  };
  usage?: CohereUsage;
}

export class CohereProvider implements Provider {
  name = 'cohere';
  metadata: ProviderMetadata = {
    name: 'cohere',
    displayName: 'Cohere',
    models: {
      'command-r-plus': {
        maxContextTokens: 128000,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
        strengths: ['reasoning', 'rag', 'multilingual'],
        isLocal: false,
      },
      'command-r': {
        maxContextTokens: 128000,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        strengths: ['fast', 'rag', 'multilingual'],
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

  constructor(options: CohereProviderOptions) {
    this.apiKey = options.apiKey;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const cohereMessages = this.prepareMessages(messages, options);

    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: cohereMessages,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as CohereChatResponse;
    const text = data.message?.content?.[0]?.text || '';
    const usage = data.usage;

    return {
      content: text,
      usage: {
        inputTokens: usage?.tokens?.input_tokens ?? usage?.billed_units?.input_tokens ?? 0,
        outputTokens: usage?.tokens?.output_tokens ?? usage?.billed_units?.output_tokens ?? 0,
      },
      model,
      finishReason: data.finish_reason || 'unknown',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model || this.defaultModel;
    const cohereMessages = this.prepareMessages(messages, options);

    try {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: cohereMessages,
          max_tokens: options?.maxTokens || this.defaultMaxTokens,
          temperature: options?.temperature,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
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

          const event = JSON.parse(data) as CohereStreamEvent;

          if (event.type === 'content-delta' && event.delta?.message?.content?.text) {
            yield { type: 'text', content: event.delta.message.content.text };
          }

          if (event.usage) {
            inputTokens = event.usage.tokens?.input_tokens ?? event.usage.billed_units?.input_tokens ?? 0;
            outputTokens = event.usage.tokens?.output_tokens ?? event.usage.billed_units?.output_tokens ?? 0;
          }

          if (event.type === 'message-end') {
            yield {
              type: 'done',
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
  ): CohereChatMessage[] {
    const cohereMessages: CohereChatMessage[] = [];

    if (options?.systemPrompt) {
      cohereMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of messages) {
      cohereMessages.push({ role: msg.role, content: msg.content });
    }

    return cohereMessages;
  }
}
