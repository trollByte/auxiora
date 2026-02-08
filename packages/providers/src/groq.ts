import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_MAX_TOKENS = 4096;
const BASE_URL = 'https://api.groq.com/openai/v1';

export interface GroqProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

interface GroqChatMessage {
  role: string;
  content: string;
}

interface GroqChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface GroqUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface GroqChatResponse {
  choices: GroqChoice[];
  usage: GroqUsage;
  model: string;
}

interface GroqStreamDelta {
  content?: string;
}

interface GroqStreamChoice {
  delta: GroqStreamDelta;
  finish_reason: string | null;
}

interface GroqStreamChunk {
  choices: GroqStreamChoice[];
  usage?: GroqUsage;
}

export class GroqProvider implements Provider {
  name = 'groq';
  metadata: ProviderMetadata = {
    name: 'groq',
    displayName: 'Groq',
    models: {
      'llama-3.3-70b-versatile': {
        maxContextTokens: 128000,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00059,
        costPer1kOutput: 0.00079,
        strengths: ['fast', 'reasoning', 'code'],
        isLocal: false,
      },
      'llama-3.1-8b-instant': {
        maxContextTokens: 131072,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00005,
        costPer1kOutput: 0.00008,
        strengths: ['fast', 'low-cost'],
        isLocal: false,
      },
      'mixtral-8x7b-32768': {
        maxContextTokens: 32768,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00024,
        costPer1kOutput: 0.00024,
        strengths: ['fast', 'code', 'multilingual'],
        isLocal: false,
      },
      'gemma2-9b-it': {
        maxContextTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0002,
        costPer1kOutput: 0.0002,
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
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: GroqProviderOptions) {
    this.apiKey = options.apiKey;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const groqMessages = this.prepareMessages(messages, options);

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        messages: groqMessages,
        temperature: options?.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GroqChatResponse;
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
    const groqMessages = this.prepareMessages(messages, options);

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
          messages: groqMessages,
          temperature: options?.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
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

          const chunk = JSON.parse(data) as GroqStreamChunk;

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
  ): GroqChatMessage[] {
    const groqMessages: GroqChatMessage[] = [];

    if (options?.systemPrompt) {
      groqMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of messages) {
      groqMessages.push({ role: msg.role, content: msg.content });
    }

    return groqMessages;
  }
}
