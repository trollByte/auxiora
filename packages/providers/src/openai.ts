import OpenAI from 'openai';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';
import { getOpenAIReasoningEffort, isOpenAIReasoningModel } from './thinking-levels.js';

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
  metadata: ProviderMetadata = {
    name: 'openai',
    displayName: 'OpenAI GPT',
    models: {
      'gpt-4o': {
        maxContextTokens: 128000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
        strengths: ['reasoning', 'code', 'vision', 'creative'],
        isLocal: false,
      },
      'gpt-4o-mini': {
        maxContextTokens: 128000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        strengths: ['fast', 'code'],
        isLocal: false,
      },
      'o1': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.015,
        costPer1kOutput: 0.06,
        strengths: ['reasoning', 'code', 'long-context'],
        isLocal: false,
      },
    },
    isAvailable: async () => {
      try {
        return this.client !== undefined;
      } catch {
        return false;
      }
    },
  };
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

    const model = options?.model || this.defaultModel;
    const createParams: OpenAI.ChatCompletionCreateParams = {
      model,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: openaiMessages,
    };

    // Add reasoning_effort for o-series models
    if (options?.thinkingLevel && isOpenAIReasoningModel(model)) {
      const effort = getOpenAIReasoningEffort(options.thinkingLevel);
      if (effort) {
        (createParams as any).reasoning_effort = effort;
      }
    }

    const response = await this.client.chat.completions.create(createParams);

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
      const model = options?.model || this.defaultModel;
      const createParams: OpenAI.ChatCompletionCreateParams = {
        model,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true },
      };

      // Add reasoning_effort for o-series models
      if (options?.thinkingLevel && isOpenAIReasoningModel(model)) {
        const effort = getOpenAIReasoningEffort(options.thinkingLevel);
        if (effort) {
          (createParams as any).reasoning_effort = effort;
        }
      }

      const stream = await this.client.chat.completions.create(createParams);

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
