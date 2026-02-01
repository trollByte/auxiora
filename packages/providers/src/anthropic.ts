import Anthropic from '@anthropic-ai/sdk';
import type {
  Provider,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';
import {
  resolveAnthropicApiKey,
  isSetupToken,
  readClaudeCliCredentials,
  getValidAccessToken,
} from './claude-oauth.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicProviderOptions {
  apiKey?: string;
  oauthToken?: string;
  model?: string;
  maxTokens?: number;
  /** Whether to read credentials from Claude CLI (~/.claude/.credentials.json) */
  useCliCredentials?: boolean;
}

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private authMode: 'api-key' | 'setup-token' | 'oauth';
  private oauthToken?: string;
  private useCliCredentials: boolean;

  /**
   * Create an Anthropic provider.
   *
   * Authentication modes:
   * 1. Setup token (sk-ant-oat01-*) - OAuth token, uses authToken parameter
   * 2. OAuth access token - Uses authToken parameter
   * 3. Claude CLI credentials - Read from ~/.claude/.credentials.json
   * 4. Regular API key (sk-ant-api03-*) - Standard API key
   */
  constructor(options: AnthropicProviderOptions) {
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.defaultMaxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.oauthToken = options.oauthToken;
    this.useCliCredentials = options.useCliCredentials ?? true;

    // Determine auth mode and initialize client
    if (options.oauthToken) {
      if (isSetupToken(options.oauthToken)) {
        // Setup tokens (sk-ant-oat01-*) use authToken, not apiKey
        this.authMode = 'setup-token';
        this.client = this.createOAuthClient(options.oauthToken);
      } else {
        // Other OAuth tokens (access tokens)
        this.authMode = 'oauth';
        this.client = this.createOAuthClient(options.oauthToken);
      }
    } else if (options.apiKey) {
      this.authMode = 'api-key';
      this.client = new Anthropic({ apiKey: options.apiKey });
    } else if (options.useCliCredentials !== false) {
      // Try Claude CLI credentials
      const cliCreds = readClaudeCliCredentials();
      if (cliCreds) {
        this.authMode = cliCreds.type === 'oauth' ? 'oauth' : 'setup-token';
        this.client = this.createOAuthClient(cliCreds.accessToken);
      } else {
        throw new Error(
          'No credentials found. Provide apiKey, oauthToken, or authenticate with `claude setup-token`.'
        );
      }
    } else {
      throw new Error('Either apiKey or oauthToken must be provided');
    }
  }

  /**
   * Create an Anthropic client configured for OAuth tokens.
   * OAuth tokens require authToken parameter and specific headers.
   */
  private createOAuthClient(token: string): Anthropic {
    return new Anthropic({
      apiKey: '', // Empty, not null (SDK typing)
      authToken: token,
      defaultHeaders: {
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
        'user-agent': 'auxiora/1.0.0 (external, cli)',
        'x-app': 'cli',
      },
    });
  }

  /**
   * Create provider asynchronously with token refresh support.
   */
  static async create(options: AnthropicProviderOptions): Promise<AnthropicProvider> {
    const resolved = await resolveAnthropicApiKey({
      apiKey: options.apiKey,
      oauthToken: options.oauthToken,
      useCliCredentials: options.useCliCredentials,
    });

    return new AnthropicProvider({
      ...options,
      apiKey: resolved.apiKey,
      oauthToken: undefined, // Already resolved
      useCliCredentials: false, // Already resolved
    });
  }

  /**
   * Refresh credentials if using OAuth and tokens are expired.
   */
  private async ensureValidCredentials(): Promise<void> {
    if (this.authMode !== 'oauth') {
      return;
    }

    // Check Claude CLI credentials for refresh
    const cliCreds = readClaudeCliCredentials();
    if (cliCreds && cliCreds.type === 'oauth') {
      const token = await getValidAccessToken(cliCreds);
      // Recreate client with new token using OAuth config
      this.client = this.createOAuthClient(token);
    }
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    // Refresh credentials if needed
    await this.ensureValidCredentials();

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
    // Refresh credentials if needed
    await this.ensureValidCredentials();

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
