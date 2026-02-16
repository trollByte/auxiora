import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_MAX_TOKENS = 4096;
const BASE_URL = 'https://api.deepseek.com';

export interface DeepSeekProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

interface DeepSeekChatMessage {
  role: string;
  content: string;
}

interface DeepSeekChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface DeepSeekChatResponse {
  choices: DeepSeekChoice[];
  usage: DeepSeekUsage;
  model: string;
}

interface DeepSeekStreamDelta {
  content?: string;
}

interface DeepSeekStreamChoice {
  delta: DeepSeekStreamDelta;
  finish_reason: string | null;
}

interface DeepSeekStreamChunk {
  choices: DeepSeekStreamChoice[];
  usage?: DeepSeekUsage;
}

export class DeepSeekProvider implements Provider {
  name = 'deepseek';
  metadata: ProviderMetadata = {
    name: 'deepseek',
    displayName: 'DeepSeek',
    models: {
      'deepseek-chat': {
        maxContextTokens: 64000,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00014,
        costPer1kOutput: 0.00028,
        strengths: ['reasoning', 'code', 'low-cost'],
        isLocal: false,
      },
      'deepseek-reasoner': {
        maxContextTokens: 64000,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00055,
        costPer1kOutput: 0.0022,
        strengths: ['reasoning', 'code', 'math'],
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

  constructor(options: DeepSeekProviderOptions) {
    this.apiKey = options.apiKey;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const dsMessages = this.prepareMessages(messages, options);

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        messages: dsMessages,
        temperature: options?.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DeepSeekChatResponse;
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
    const dsMessages = this.prepareMessages(messages, options);

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
          messages: dsMessages,
          temperature: options?.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
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

          const chunk = JSON.parse(data) as DeepSeekStreamChunk;

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
  ): DeepSeekChatMessage[] {
    const dsMessages: DeepSeekChatMessage[] = [];

    if (options?.systemPrompt) {
      dsMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of messages) {
      dsMessages.push({ role: msg.role, content: msg.content });
    }

    return dsMessages;
  }
}
