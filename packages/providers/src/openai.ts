import OpenAI from 'openai';
import type {
  Provider,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4096;

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseURL?: string;
}

export class OpenAIProvider implements Provider {
  name = 'openai';
  private client: OpenAI;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const openaiMessages = this.prepareMessages(messages, options);

    const response = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: openaiMessages,
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
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const openaiMessages = this.prepareMessages(messages, options);

    try {
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        messages: openaiMessages,
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
    options?: CompletionOptions
  ): OpenAI.ChatCompletionMessageParam[] {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (options?.systemPrompt) {
      openaiMessages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    // Convert messages
    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return openaiMessages;
  }
}
