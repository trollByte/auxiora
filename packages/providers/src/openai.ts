import OpenAI from 'openai';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ToolDefinition,
} from './types.js';
import { getOpenAIReasoningEffort, isOpenAIReasoningModel } from './thinking-levels.js';

const DEFAULT_MODEL = 'gpt-5.2';
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
      'gpt-5.2': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.012,
        strengths: ['reasoning', 'code', 'vision', 'creative', 'agentic'],
        isLocal: false,
      },
      'gpt-5.2-pro': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.01,
        costPer1kOutput: 0.04,
        strengths: ['reasoning', 'code', 'precision', 'agentic'],
        isLocal: false,
      },
      'gpt-5': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
        strengths: ['reasoning', 'code', 'agentic'],
        isLocal: false,
      },
      'gpt-5-mini': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0004,
        costPer1kOutput: 0.0016,
        strengths: ['fast', 'code', 'cost-efficient'],
        isLocal: false,
      },
      'gpt-5-nano': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0001,
        costPer1kOutput: 0.0004,
        strengths: ['fast', 'cost-efficient'],
        isLocal: false,
      },
      'gpt-4.1': {
        maxContextTokens: 1048576,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.008,
        strengths: ['code', 'instruction-following', 'long-context'],
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
  readonly defaultModel: string;
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

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      createParams.tools = this.transformTools(options.tools);
    }

    // Add reasoning_effort for o-series models
    if (options?.thinkingLevel && isOpenAIReasoningModel(model)) {
      const effort = getOpenAIReasoningEffort(options.thinkingLevel);
      if (effort) {
        (createParams as any).reasoning_effort = effort;
      }
    }

    const response = await this.client.chat.completions.create(createParams);

    const choice = response.choices[0];
    const message = choice?.message;
    const content = message?.content || '';

    // Handle tool calls in the response
    const toolCalls = message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return {
        content,
        toolUse: toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        })),
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        model: response.model,
        finishReason: 'tool_use',
      };
    }

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

      // Add tools if provided
      if (options?.tools && options.tools.length > 0) {
        createParams.tools = this.transformTools(options.tools);
      }

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

      // Track streaming tool calls: index -> { id, name, arguments }
      const toolCallAccumulators = new Map<number, { id: string; name: string; arguments: string }>();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield { type: 'text', content: delta.content };
        }

        // Handle streaming tool_calls deltas
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallAccumulators.has(idx)) {
              toolCallAccumulators.set(idx, { id: '', name: '', arguments: '' });
            }
            const acc = toolCallAccumulators.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }

        if (choice?.finish_reason) {
          // Yield accumulated tool calls before done
          if (choice.finish_reason === 'tool_calls' && toolCallAccumulators.size > 0) {
            for (const [, acc] of toolCallAccumulators) {
              yield {
                type: 'tool_use',
                toolUse: {
                  id: acc.id,
                  name: acc.name,
                  input: JSON.parse(acc.arguments || '{}'),
                },
              };
            }
          }

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

  private transformTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema as OpenAI.FunctionParameters,
      },
    }));
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
