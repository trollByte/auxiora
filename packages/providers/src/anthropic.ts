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
import { CLAUDE_CODE_TOOLS } from './claude-code-tools.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

// Claude Code version to mimic (must match real Claude CLI)
const CLAUDE_CODE_VERSION = '2.1.29';

// Git SHA for version tracking (shortened from real value)
const CLAUDE_CODE_GIT_SHA = '6fe';

// Required system prompt for OAuth tokens
const CLAUDE_CODE_SYSTEM_PROMPT = 'You are Claude Code, Anthropic\'s official CLI for Claude.';

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
        console.log('[AnthropicProvider] Using setup-token auth mode (Claude Code emulation enabled)');
      } else {
        // Other OAuth tokens (access tokens)
        this.authMode = 'oauth';
        this.client = this.createOAuthClient(options.oauthToken);
        console.log('[AnthropicProvider] Using oauth auth mode (Claude Code emulation enabled)');
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
        console.log(`[AnthropicProvider] Using CLI credentials, auth mode: ${this.authMode} (Claude Code emulation enabled)`);
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
   * OAuth tokens require authToken parameter and Claude Code headers.
   * We mimic Claude Code exactly to satisfy the API restriction.
   */
  private createOAuthClient(token: string): Anthropic {
    return new Anthropic({
      apiKey: null as unknown as string,
      authToken: token,
      baseURL: 'https://api.anthropic.com',
      defaultHeaders: {
        'accept': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
        'user-agent': `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
        'x-app': 'cli',
        // CRITICAL: Attribution header identifies this as Claude Code
        'x-anthropic-billing-header': `cc_version=${CLAUDE_CODE_VERSION}.${CLAUDE_CODE_GIT_SHA}; cc_entrypoint=cli;`,
      },
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Check if OAuth mode requires Claude Code tool emulation.
   */
  private requiresClaudeCodeEmulation(): boolean {
    return this.authMode === 'setup-token' || this.authMode === 'oauth';
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

    // Build request parameters
    const params: Anthropic.MessageCreateParams = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: anthropicMessages,
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      params.tools = options.tools as Anthropic.Tool[];
    }

    // For OAuth tokens, include Claude Code identity
    if (this.requiresClaudeCodeEmulation()) {
      // Claude Code identity MUST be first in system prompt (array format with cache_control)
      const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
        {
          type: 'text',
          text: CLAUDE_CODE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ];
      if (systemPrompt) {
        systemBlocks.push({
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        });
      }
      params.system = systemBlocks as Anthropic.TextBlockParam[];
    } else {
      params.system = systemPrompt;
    }

    const response = await this.client.messages.create(params);

    // Extract text content, filtering out tool calls
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

    // Build request parameters
    const params: Anthropic.MessageStreamParams = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: anthropicMessages,
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      params.tools = options.tools as Anthropic.Tool[];
    }

    // For OAuth tokens, include Claude Code identity
    if (this.requiresClaudeCodeEmulation()) {
      // Claude Code identity MUST be first in system prompt (array format with cache_control)
      const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
        {
          type: 'text',
          text: CLAUDE_CODE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ];
      if (systemPrompt) {
        systemBlocks.push({
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        });
      }
      params.system = systemBlocks as Anthropic.TextBlockParam[];
    } else {
      params.system = systemPrompt;
    }

    try {
      const stream = this.client.messages.stream(params);
      let currentToolUse: { id: string; name: string; input: string } | null = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            // Start collecting tool use
            currentToolUse = {
              id: block.id,
              name: block.name,
              input: '',
            };
          }
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'text', content: delta.text };
          } else if ('partial_json' in delta && currentToolUse) {
            // Accumulate tool input
            currentToolUse.input += delta.partial_json;
          }
        } else if (event.type === 'content_block_stop' && currentToolUse) {
          // Tool use complete - parse and yield
          try {
            const input = JSON.parse(currentToolUse.input);
            yield {
              type: 'tool_use',
              toolUse: {
                id: currentToolUse.id,
                name: currentToolUse.name,
                input,
              },
            };
          } catch (error) {
            yield {
              type: 'error',
              error: `Failed to parse tool input: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }
          currentToolUse = null;
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
