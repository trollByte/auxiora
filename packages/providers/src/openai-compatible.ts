import OpenAI from 'openai';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MAX_TOKENS = 4096;

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  name?: string;
}

export class OpenAICompatibleProvider implements Provider {
  name: string;
  metadata: ProviderMetadata;
  private client: OpenAI;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.name || 'openai-compatible';
    this.defaultModel = options.model;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

    this.client = new OpenAI({
      apiKey: options.apiKey || 'not-needed',
      baseURL: options.baseUrl,
    });

    this.metadata = {
      name: this.name,
      displayName: options.name ? `${options.name} (OpenAI-compatible)` : 'OpenAI-compatible',
      models: {
        [this.defaultModel]: {
          maxContextTokens: 128000,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          supportsImageGen: false,
          costPer1kInput: 0,
          costPer1kOutput: 0,
          strengths: ['code', 'reasoning'],
          isLocal: true,
        },
      },
      isAvailable: async () => {
        try {
          await this.client.models.list();
          return true;
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
    const openaiMessages = this.prepareMessages(messages, options);

    const response = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: openaiMessages,
      temperature: options?.temperature,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content || '';

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      model: response.model,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const openaiMessages = this.prepareMessages(messages, options);

    try {
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        messages: openaiMessages,
        temperature: options?.temperature,
        stream: true,
        stream_options: { include_usage: true },
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
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
  ): OpenAI.ChatCompletionMessageParam[] {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      openaiMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const msg of messages) {
      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    return openaiMessages;
  }
}
