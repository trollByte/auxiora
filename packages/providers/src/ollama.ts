import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3';
const DEFAULT_MAX_TOKENS = 4096;

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

interface OllamaChatMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

export class OllamaProvider implements Provider {
  name = 'ollama';
  metadata: ProviderMetadata;
  private baseUrl: string;
  readonly defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: OllamaProviderOptions) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

    this.metadata = {
      name: 'ollama',
      displayName: 'Ollama (Local)',
      models: {
        [this.defaultModel]: {
          maxContextTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true,
          supportsImageGen: false,
          costPer1kInput: 0,
          costPer1kOutput: 0,
          strengths: ['fast', 'private'],
          isLocal: true,
        },
      },
      isAvailable: async () => {
        try {
          const response = await fetch(`${this.baseUrl}/api/tags`);
          return response.ok;
        } catch {
          return false;
        }
      },
    };
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const ollamaMessages = this.prepareMessages(messages, options);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
        options: {
          num_predict: options?.maxTokens || this.defaultMaxTokens,
          temperature: options?.temperature,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OllamaChatResponse;

    return {
      content: data.message.content,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      model,
      finishReason: data.done ? 'stop' : 'unknown',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model || this.defaultModel;
    const ollamaMessages = this.prepareMessages(messages, options);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: true,
          options: {
            num_predict: options?.maxTokens || this.defaultMaxTokens,
            temperature: options?.temperature,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as OllamaChatResponse;

          if (chunk.message?.content) {
            yield { type: 'text', content: chunk.message.content };
          }

          if (chunk.done) {
            yield {
              type: 'done',
              usage: {
                inputTokens: chunk.prompt_eval_count ?? 0,
                outputTokens: chunk.eval_count ?? 0,
              },
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
  ): OllamaChatMessage[] {
    const ollamaMessages: OllamaChatMessage[] = [];

    if (options?.systemPrompt) {
      ollamaMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of messages) {
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }

    return ollamaMessages;
  }
}
