import Anthropic from '@anthropic-ai/sdk';
import type {
  Provider,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const { systemPrompt, anthropicMessages } = this.prepareMessages(messages, options);

    const response = await this.client.messages.create({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason || 'unknown',
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { systemPrompt, anthropicMessages } = this.prepareMessages(messages, options);

    try {
      const stream = this.client.messages.stream({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'text', content: delta.text };
          }
        } else if (event.type === 'message_stop') {
          const finalMessage = await stream.finalMessage();
          yield {
            type: 'done',
            usage: {
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
            },
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
  ): {
    systemPrompt: string | undefined;
    anthropicMessages: Anthropic.MessageParam[];
  } {
    let systemPrompt = options?.systemPrompt;
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Anthropic uses system as a separate parameter
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content}` : msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Ensure message alternation (Anthropic requirement)
    const fixed = this.fixMessageAlternation(anthropicMessages);

    return { systemPrompt, anthropicMessages: fixed };
  }

  private fixMessageAlternation(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    if (messages.length === 0) return messages;

    const fixed: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      const lastRole = fixed.length > 0 ? fixed[fixed.length - 1].role : null;

      if (lastRole === msg.role) {
        // Merge consecutive messages of same role
        const last = fixed[fixed.length - 1];
        if (typeof last.content === 'string' && typeof msg.content === 'string') {
          last.content = `${last.content}\n\n${msg.content}`;
        }
      } else {
        fixed.push({ ...msg });
      }
    }

    // Ensure first message is from user
    if (fixed.length > 0 && fixed[0].role !== 'user') {
      fixed.unshift({ role: 'user', content: '(Starting conversation)' });
    }

    return fixed;
  }
}
