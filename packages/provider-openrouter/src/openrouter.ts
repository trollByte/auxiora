import OpenAI from 'openai';
import type {
  OpenRouterConfig,
  Provider,
  ProviderMetadata,
  ModelCapabilities,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ToolDefinition,
} from './types.js';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

export class OpenRouterProvider implements Provider {
  name = 'openrouter';
  metadata: ProviderMetadata;
  readonly defaultModel: string;
  private client: OpenAI;
  private defaultMaxTokens: number;

  constructor(options: OpenRouterConfig) {
    this.defaultModel = options.model ?? DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://auxiora.dev',
        'X-Title': options.appName ?? 'Auxiora',
      },
    });

    this.metadata = {
      name: 'openrouter',
      displayName: 'OpenRouter',
      models: {
        [this.defaultModel]: {
          maxContextTokens: 200000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          supportsImageGen: false,
          costPer1kInput: 0.003,
          costPer1kOutput: 0.015,
          strengths: ['reasoning', 'code'],
          isLocal: false,
        },
      },
      isAvailable: async () => true,
    };
  }

  updateModels(models: Record<string, ModelCapabilities>): void {
    this.metadata.models = { ...this.metadata.models, ...models };
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
    const openaiMessages = this.prepareMessages(messages, options);
    const model = options?.model || this.defaultModel;

    const createParams: OpenAI.ChatCompletionCreateParams = {
      model,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: openaiMessages,
    };

    if (options?.tools && options.tools.length > 0) {
      createParams.tools = this.transformTools(options.tools);
    }

    const response = await this.client.chat.completions.create(createParams);
    const choice = response.choices[0];
    const message = choice?.message;
    const content = message?.content || '';

    const toolCalls = message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return {
        content,
        toolUse: toolCalls.map(tc => ({
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

  async *stream(messages: ChatMessage[], options?: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown> {
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

      if (options?.tools && options.tools.length > 0) {
        createParams.tools = this.transformTools(options.tools);
      }

      const stream = await this.client.chat.completions.create(createParams);

      let inputTokens = 0;
      let outputTokens = 0;
      const toolCallAccumulators = new Map<number, { id: string; name: string; arguments: string }>();

      for await (const chunk of stream as AsyncIterable<OpenAI.ChatCompletionChunk>) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield { type: 'text', content: delta.content };
        }

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
          if (choice.finish_reason === 'tool_calls' && toolCallAccumulators.size > 0) {
            for (const [, acc] of toolCallAccumulators) {
              yield {
                type: 'tool_use',
                toolUse: { id: acc.id, name: acc.name, input: JSON.parse(acc.arguments || '{}') },
              };
            }
          }
          yield {
            type: 'done',
            finishReason: choice.finish_reason || 'stop',
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
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema as OpenAI.FunctionParameters,
      },
    }));
  }

  private prepareMessages(messages: ChatMessage[], options?: CompletionOptions): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) {
      result.push({ role: 'system', content: options.systemPrompt });
    }
    for (const msg of messages) {
      result.push({ role: msg.role, content: msg.content });
    }
    return result;
  }
}
