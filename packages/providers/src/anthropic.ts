import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('providers:anthropic');
import type {
  Provider,
  ProviderMetadata,
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
import { getAnthropicThinkingBudget } from './thinking-levels.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

// Fallback version if detection fails (keep in sync with real Claude Code)
const CLAUDE_CODE_VERSION_FALLBACK = '2.1.41';

// Salt for attribution SHA computation (from Claude Code binary)
const ATTRIBUTION_SALT = '59cf53e54c78';

// Required system prompt for OAuth tokens
const CLAUDE_CODE_SYSTEM_PROMPT = 'You are Claude Code, Anthropic\'s official CLI for Claude.';

/**
 * Detect the installed Claude Code version from the CLI.
 * Falls back to hardcoded version if detection fails.
 */
function detectClaudeCodeVersion(): string {
  try {
    const output = execFileSync('claude', ['--version'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // Output format: "2.1.41 (Claude Code)" — extract version number
    const match = output.match(/^(\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Claude CLI not installed or not accessible
  }
  return CLAUDE_CODE_VERSION_FALLBACK;
}

/**
 * Compute the attribution SHA matching Claude Code's algorithm.
 * Uses chars at positions 4, 7, 20 from the first user message + salt + version.
 */
function computeAttributionSha(firstUserMessage: string, version: string): string {
  const chars = [4, 7, 20].map(i => firstUserMessage[i] || '0').join('');
  return createHash('sha256')
    .update(`${ATTRIBUTION_SALT}${chars}${version}`)
    .digest('hex')
    .slice(0, 3);
}

// Cache the detected version
let cachedVersion: string | undefined;

export interface AnthropicProviderOptions {
  apiKey?: string;
  oauthToken?: string;
  model?: string;
  maxTokens?: number;
  /** Whether to read credentials from Claude CLI (~/.claude/.credentials.json) */
  useCliCredentials?: boolean;
  /** Callback to refresh the OAuth token when expired. Returns new access token. */
  onTokenRefresh?: () => Promise<string | null>;
  /** When the current OAuth token expires (epoch ms). Used for proactive refresh. */
  tokenExpiresAt?: number;
}

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  metadata: ProviderMetadata = {
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    models: {
      'claude-opus-4-6': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
        strengths: ['reasoning', 'code', 'long-context', 'creative'],
        isLocal: false,
      },
      'claude-sonnet-4-5-20250929': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        strengths: ['reasoning', 'code', 'long-context', 'creative'],
        isLocal: false,
      },
      'claude-opus-4-20250514': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
        strengths: ['reasoning', 'code', 'long-context', 'creative'],
        isLocal: false,
      },
      'claude-sonnet-4-20250514': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        strengths: ['reasoning', 'code', 'long-context', 'creative'],
        isLocal: false,
      },
      'claude-haiku-4-5-20251001': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0008,
        costPer1kOutput: 0.004,
        strengths: ['fast', 'code', 'vision'],
        isLocal: false,
      },
      'claude-3-opus-20240229': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
        strengths: ['reasoning', 'creative'],
        isLocal: false,
      },
      'claude-3-5-haiku-20241022': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.0008,
        costPer1kOutput: 0.004,
        strengths: ['fast', 'code'],
        isLocal: false,
      },
    },
    isAvailable: async () => {
      try {
        // Check if we have valid credentials
        return this.client !== undefined;
      } catch {
        return false;
      }
    },
  };
  private client: Anthropic;
  readonly defaultModel: string;
  private defaultMaxTokens: number;
  private authMode: 'api-key' | 'setup-token' | 'oauth';
  private oauthToken?: string;
  private useCliCredentials: boolean;
  private onTokenRefresh?: () => Promise<string | null>;
  private tokenExpiresAt?: number;

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
    this.onTokenRefresh = options.onTokenRefresh;
    this.tokenExpiresAt = options.tokenExpiresAt;

    // Determine auth mode and initialize client
    if (options.oauthToken) {
      if (isSetupToken(options.oauthToken)) {
        // Setup tokens (sk-ant-oat01-*) use authToken, not apiKey
        this.authMode = 'setup-token';
        this.client = this.createOAuthClient(options.oauthToken);
        logger.info('Using setup-token auth mode (Claude Code emulation enabled)');
      } else {
        // Other OAuth tokens (access tokens)
        this.authMode = 'oauth';
        this.client = this.createOAuthClient(options.oauthToken);
        logger.info('Using oauth auth mode (Claude Code emulation enabled)');
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
        logger.info(`Using CLI credentials, auth mode: ${this.authMode} (Claude Code emulation enabled)`);
      } else {
        throw new Error(
          'No credentials found. Provide apiKey, oauthToken, or authenticate with `claude setup-token`.'
        );
      }
    } else {
      throw new Error('Either apiKey or oauthToken must be provided');
    }
  }

  setActiveKey(apiKey: string): void {
    this.authMode = 'api-key';
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Get the Claude Code version (detected or cached).
   */
  private getVersion(): string {
    if (!cachedVersion) {
      cachedVersion = detectClaudeCodeVersion();
      logger.info(`Detected Claude Code version: ${cachedVersion}`);
    }
    return cachedVersion;
  }

  /**
   * Create an Anthropic client configured for OAuth tokens.
   * OAuth tokens require authToken parameter and Claude Code headers.
   * We mimic Claude Code exactly to satisfy the API restriction.
   */
  private createOAuthClient(token: string): Anthropic {
    const version = this.getVersion();
    return new Anthropic({
      apiKey: null as unknown as string,
      authToken: token,
      baseURL: 'https://api.anthropic.com',
      defaultHeaders: {
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05',
        'user-agent': `claude-code/${version}`,
      },
    });
  }

  /**
   * Build the attribution billing header for a specific request.
   * The SHA is computed per-request from the first user message content.
   */
  private buildBillingHeader(messages: Anthropic.MessageParam[]): string {
    const version = this.getVersion();
    // Extract first user message text for SHA computation
    let firstUserText = '';
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          firstUserText = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textBlock = msg.content.find(b => b.type === 'text');
          if (textBlock && 'text' in textBlock) {
            firstUserText = textBlock.text;
          }
        }
        break;
      }
    }
    const sha = computeAttributionSha(firstUserText, version);
    const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT ?? 'cli';
    return `cc_version=${version}.${sha}; cc_entrypoint=${entrypoint}; cch=00000;`;
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
   * Check if the current OAuth token is near expiry (within 5 minutes).
   */
  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) return false;
    return Date.now() >= this.tokenExpiresAt - 5 * 60 * 1000;
  }

  /**
   * Refresh credentials if using OAuth/setup-token and tokens are expired or expiring soon.
   * Both 'oauth' and 'setup-token' modes use OAuth tokens that expire.
   */
  private async ensureValidCredentials(): Promise<void> {
    // API keys don't expire
    if (this.authMode === 'api-key') return;

    // If we know the expiry time and it's not close, skip refresh
    if (this.tokenExpiresAt && !this.isTokenExpiringSoon()) return;

    // Try Claude CLI credentials for refresh (host environment)
    const cliCreds = readClaudeCliCredentials();
    if (cliCreds && cliCreds.type === 'oauth') {
      try {
        const token = await getValidAccessToken(cliCreds);
        this.client = this.createOAuthClient(token);
        this.tokenExpiresAt = cliCreds.expiresAt;
        return;
      } catch (err) {
        logger.warn('CLI credential refresh failed, trying vault callback', { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }

    // Fallback: use vault-based refresh callback (e.g. in Docker)
    if (this.onTokenRefresh) {
      const newToken = await this.onTokenRefresh();
      if (newToken) {
        this.client = this.createOAuthClient(newToken);
        // Token was just refreshed; assume ~1 hour validity
        this.tokenExpiresAt = Date.now() + 3600 * 1000;
        logger.info('OAuth token refreshed via callback');
      }
    }
  }

  /**
   * Refresh the token after a 401 error and return true if successful.
   */
  private async handleAuthError(): Promise<boolean> {
    if (this.authMode === 'api-key') return false;

    logger.warn('Got 401 from API, attempting token refresh');

    // Force refresh by clearing expiry so ensureValidCredentials doesn't skip
    this.tokenExpiresAt = 0;

    try {
      await this.ensureValidCredentials();
      return true;
    } catch (err) {
      logger.error('Token refresh after 401 failed', { error: err instanceof Error ? err : new Error(String(err)) });
      return false;
    }
  }

  /**
   * Check if an error is a 401 authentication error.
   */
  private isAuthError(error: unknown): boolean {
    if (error instanceof Anthropic.AuthenticationError) return true;
    if (error instanceof Error && error.message.includes('401')) return true;
    return false;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    // Refresh credentials if needed
    await this.ensureValidCredentials();

    try {
      return await this.doComplete(messages, options);
    } catch (error) {
      // On 401, refresh token and retry once
      if (this.isAuthError(error) && await this.handleAuthError()) {
        return await this.doComplete(messages, options);
      }
      throw error;
    }
  }

  private async doComplete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const { systemPrompt, anthropicMessages } = this.prepareMessages(messages, options);

    // Build request parameters
    const params: Anthropic.MessageCreateParams = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: anthropicMessages,
    };

    // Add thinking budget if requested
    const thinkingBudget = options?.thinkingLevel
      ? getAnthropicThinkingBudget(options.thinkingLevel)
      : undefined;
    if (thinkingBudget) {
      (params as any).thinking = { type: 'enabled', budget_tokens: thinkingBudget };
    }

    // For OAuth tokens, include Claude Code emulation (tools + system prompt)
    if (this.requiresClaudeCodeEmulation()) {
      // Claude Code tools MUST be included for the API to accept OAuth tokens
      const callerTools = (options?.tools ?? []) as Anthropic.Tool[];
      params.tools = [...(CLAUDE_CODE_TOOLS as unknown as Anthropic.Tool[]), ...callerTools];

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
      if (options?.tools && options.tools.length > 0) {
        params.tools = options.tools as Anthropic.Tool[];
      }
      params.system = systemPrompt;
    }

    // Set per-request billing header for OAuth mode
    const requestOptions = this.requiresClaudeCodeEmulation()
      ? { headers: { 'x-anthropic-billing-header': this.buildBillingHeader(anthropicMessages) } }
      : undefined;

    const response = await this.client.messages.create(params, requestOptions);

    // Extract text content, filtering out tool calls for Claude Code tools
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

    try {
      yield* this.doStream(messages, options);
    } catch (error) {
      // On 401 before any chunks were yielded, refresh and retry
      if (this.isAuthError(error) && await this.handleAuthError()) {
        yield* this.doStream(messages, options);
      } else {
        yield {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  }

  private async *doStream(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { systemPrompt, anthropicMessages } = this.prepareMessages(messages, options);

    // Build request parameters
    const params: Anthropic.MessageStreamParams = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: anthropicMessages,
    };

    // Add thinking budget if requested
    const thinkingBudget = options?.thinkingLevel
      ? getAnthropicThinkingBudget(options.thinkingLevel)
      : undefined;
    if (thinkingBudget) {
      (params as any).thinking = { type: 'enabled', budget_tokens: thinkingBudget };
    }

    // For OAuth tokens, include Claude Code emulation (tools + system prompt)
    if (this.requiresClaudeCodeEmulation()) {
      const callerTools = (options?.tools ?? []) as Anthropic.Tool[];
      params.tools = [...(CLAUDE_CODE_TOOLS as unknown as Anthropic.Tool[]), ...callerTools];

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
      if (options?.tools && options.tools.length > 0) {
        params.tools = options.tools as Anthropic.Tool[];
      }
      params.system = systemPrompt;
    }

    // Track Claude Code tool names to filter them from output (unless passthrough enabled)
    const filterCCTools = !options?.passThroughAllTools;
    const ccToolNames = new Set(CLAUDE_CODE_TOOLS.map(t => t.name));

    // Set per-request billing header for OAuth mode
    const requestOptions = this.requiresClaudeCodeEmulation()
      ? { headers: { 'x-anthropic-billing-header': this.buildBillingHeader(anthropicMessages) } }
      : undefined;

    const stream = this.client.messages.stream(params, requestOptions);
    let currentToolUse: { id: string; name: string; input: string } | null = null;
    let inThinkingBlock = false;

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
          inThinkingBlock = false;
        } else if ((block as any).type === 'thinking') {
          inThinkingBlock = true;
        } else {
          inThinkingBlock = false;
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          yield { type: 'text', content: delta.text };
        } else if ((delta as any).thinking && inThinkingBlock) {
          yield { type: 'thinking', content: (delta as any).thinking };
        } else if ('partial_json' in delta && currentToolUse) {
          // Accumulate tool input
          currentToolUse.input += delta.partial_json;
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        // Skip Claude Code emulation tools unless passthrough is enabled
        if (filterCCTools && ccToolNames.has(currentToolUse.name)) {
          currentToolUse = null;
        } else {
          // Tool use complete - parse and yield
          try {
            const input = currentToolUse.input ? JSON.parse(currentToolUse.input) : {};
            yield {
              type: 'tool_use',
              toolUse: {
                id: currentToolUse.id,
                name: currentToolUse.name,
                input,
              },
            };
          } catch {
            // Log but don't propagate as a stream error — skip this tool call
            yield {
              type: 'tool_use',
              toolUse: {
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: {},
              },
            };
          }
          currentToolUse = null;
        }
      } else if (event.type === 'message_stop') {
        const finalMessage = await stream.finalMessage();
        yield {
          type: 'done',
          finishReason: finalMessage.stop_reason || 'end_turn',
          usage: {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
          },
        };
      }
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
      } else if (msg.content) {
        // Skip messages with empty content — Anthropic API rejects them
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
