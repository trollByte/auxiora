import { Gateway, type ClientConnection, type WsMessage } from '@auxiora/gateway';
import { SessionManager, type Message } from '@auxiora/sessions';
import { ProviderFactory, type StreamChunk, readClaudeCliCredentials, isSetupToken } from '@auxiora/providers';
import { ChannelManager, type InboundMessage } from '@auxiora/channels';
import { loadConfig, type Config } from '@auxiora/config';
import { Vault } from '@auxiora/vault';
import { audit } from '@auxiora/audit';
import {
  getWorkspacePath,
  getSoulPath,
  getAgentsPath,
  getIdentityPath,
  getUserPath,
  getBehaviorsPath,
} from '@auxiora/core';
import {
  toolRegistry,
  toolExecutor,
  initializeToolExecutor,
  type ExecutionContext,
} from '@auxiora/tools';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BehaviorManager } from '@auxiora/behaviors';

export interface AuxioraOptions {
  config?: Config;
  vaultPassword?: string;
}

export class Auxiora {
  private config!: Config;
  private gateway!: Gateway;
  private sessions!: SessionManager;
  private providers!: ProviderFactory;
  private channels?: ChannelManager;
  private vault!: Vault;
  private systemPrompt: string = '';
  private running = false;
  private behaviors?: BehaviorManager;

  async initialize(options: AuxioraOptions = {}): Promise<void> {
    // Load config
    this.config = options.config || (await loadConfig());

    // Initialize vault (optional)
    this.vault = new Vault();
    if (options.vaultPassword) {
      try {
        await this.vault.unlock(options.vaultPassword);
      } catch (error) {
        console.warn('Failed to unlock vault:', error instanceof Error ? error.message : error);
      }
    }

    // Initialize tool system with approval callback
    initializeToolExecutor(async (toolName: string, params: any, context: ExecutionContext) => {
      // For now, auto-approve all tools in non-interactive mode
      // In future, could send approval request to client via WebSocket
      console.log(`[Tools] Auto-approving ${toolName} with params:`, params);
      return true;
    });

    // Initialize sessions
    this.sessions = new SessionManager({
      maxContextTokens: this.config.session.maxContextTokens,
      ttlMinutes: this.config.session.ttlMinutes,
      autoSave: this.config.session.autoSave,
      compactionEnabled: this.config.session.compactionEnabled,
    });
    await this.sessions.initialize();

    // Initialize providers (if vault is unlocked and has keys)
    await this.initializeProviders();

    // Initialize channels (if configured and vault is unlocked)
    await this.initializeChannels();

    // Load personality files
    await this.loadPersonality();

    // Initialize gateway
    this.gateway = new Gateway({ config: this.config });
    this.gateway.onMessage(this.handleMessage.bind(this));

    // Initialize behavior system
    if (this.providers) {
      this.behaviors = new BehaviorManager({
        storePath: getBehaviorsPath(),
        executorDeps: {
          getProvider: () => this.providers.getPrimaryProvider() as any,
          sendToChannel: async (channelType: string, channelId: string, message: { content: string }) => {
            if (this.channels) {
              return this.channels.send(channelType as any, channelId, message);
            }
            return { success: false, error: 'Channel not available for proactive delivery' };
          },
          getSystemPrompt: () => this.systemPrompt,
        },
        auditFn: (event: string, details: Record<string, unknown>) => {
          audit(event as any, details);
        },
      });
      await this.behaviors.start();
    }
  }

  private async initializeProviders(): Promise<void> {
    let anthropicKey: string | undefined;
    let anthropicOAuthToken: string | undefined;
    let openaiKey: string | undefined;
    let vaultLocked = false;

    try {
      anthropicKey = this.vault.get('ANTHROPIC_API_KEY');
      anthropicOAuthToken = this.vault.get('ANTHROPIC_OAUTH_TOKEN');
      openaiKey = this.vault.get('OPENAI_API_KEY');

      // Check if ANTHROPIC_API_KEY is actually an OAuth token (sk-ant-oat01-*)
      // This handles users who stored their OAuth token in the wrong vault key
      if (anthropicKey && isSetupToken(anthropicKey)) {
        anthropicOAuthToken = anthropicKey;
        anthropicKey = undefined;
      }
    } catch {
      vaultLocked = true;
    }

    // Check for Claude CLI credentials as fallback
    const cliCreds = readClaudeCliCredentials();
    const hasCliCredentials = cliCreds !== null;

    const hasAnthropic = anthropicKey || anthropicOAuthToken || hasCliCredentials;
    if (!hasAnthropic && !openaiKey) {
      if (vaultLocked) {
        console.warn('Vault is locked. AI providers not initialized.');
        console.warn('To use AI: auxiora vault add ANTHROPIC_API_KEY');
      } else {
        console.warn('No API keys found in vault. Add with: auxiora vault add ANTHROPIC_API_KEY');
        console.warn('Or for Claude Pro/Max OAuth: auxiora vault add ANTHROPIC_OAUTH_TOKEN');
        console.warn('Or authenticate with: claude setup-token');
      }
      return;
    }

    // Build Anthropic config - prefer vault credentials, fall back to CLI
    let anthropicConfig: {
      apiKey?: string;
      oauthToken?: string;
      useCliCredentials?: boolean;
      model: string;
      maxTokens: number;
    } | undefined;

    if (anthropicOAuthToken) {
      const tokenPrefix = anthropicOAuthToken.substring(0, 15);
      console.log(`Using Anthropic OAuth token from vault (${tokenPrefix}...)`);
      anthropicConfig = {
        oauthToken: anthropicOAuthToken,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    } else if (anthropicKey) {
      console.log('Using Anthropic API key from vault');
      anthropicConfig = {
        apiKey: anthropicKey,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    } else if (hasCliCredentials) {
      console.log('Using Claude CLI credentials (~/.claude/.credentials.json)');
      anthropicConfig = {
        useCliCredentials: true,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    }

    this.providers = new ProviderFactory({
      primary: this.config.provider.primary,
      fallback: this.config.provider.fallback,
      config: {
        anthropic: anthropicConfig,
        openai: openaiKey
          ? {
              apiKey: openaiKey,
              model: this.config.provider.openai.model,
              maxTokens: this.config.provider.openai.maxTokens,
            }
          : undefined,
      },
    });
  }

  private async initializeChannels(): Promise<void> {
    // Get channel tokens from vault
    let discordToken: string | undefined;
    let telegramToken: string | undefined;
    let slackBotToken: string | undefined;
    let slackAppToken: string | undefined;
    let twilioAccountSid: string | undefined;
    let twilioAuthToken: string | undefined;
    let twilioPhoneNumber: string | undefined;

    try {
      discordToken = this.vault.get('DISCORD_BOT_TOKEN');
      telegramToken = this.vault.get('TELEGRAM_BOT_TOKEN');
      slackBotToken = this.vault.get('SLACK_BOT_TOKEN');
      slackAppToken = this.vault.get('SLACK_APP_TOKEN');
      twilioAccountSid = this.vault.get('TWILIO_ACCOUNT_SID');
      twilioAuthToken = this.vault.get('TWILIO_AUTH_TOKEN');
      twilioPhoneNumber = this.vault.get('TWILIO_PHONE_NUMBER');
    } catch {
      // Vault is locked
      return;
    }

    const hasAnyChannel =
      (this.config.channels.discord.enabled && discordToken) ||
      (this.config.channels.telegram.enabled && telegramToken) ||
      (this.config.channels.slack.enabled && slackBotToken && slackAppToken) ||
      (this.config.channels.twilio.enabled && twilioAccountSid && twilioAuthToken);

    if (!hasAnyChannel) {
      return;
    }

    this.channels = new ChannelManager({
      discord:
        this.config.channels.discord.enabled && discordToken
          ? {
              token: discordToken,
              mentionOnly: this.config.channels.discord.mentionOnly,
            }
          : undefined,
      telegram:
        this.config.channels.telegram.enabled && telegramToken
          ? {
              token: telegramToken,
            }
          : undefined,
      slack:
        this.config.channels.slack.enabled && slackBotToken && slackAppToken
          ? {
              botToken: slackBotToken,
              appToken: slackAppToken,
            }
          : undefined,
      twilio:
        this.config.channels.twilio.enabled && twilioAccountSid && twilioAuthToken && twilioPhoneNumber
          ? {
              accountSid: twilioAccountSid,
              authToken: twilioAuthToken,
              phoneNumber: twilioPhoneNumber,
            }
          : undefined,
    });

    // Set up channel message handler
    this.channels.onMessage(this.handleChannelMessage.bind(this));
    this.channels.onError((error, channelType) => {
      console.error(`Channel error (${channelType}):`, error.message);
    });
  }

  private async loadPersonality(): Promise<void> {
    const parts: string[] = [];

    // Load SOUL.md
    try {
      const soul = await fs.readFile(getSoulPath(), 'utf-8');
      parts.push(soul);
    } catch {
      // No SOUL.md
    }

    // Load AGENTS.md
    try {
      const agents = await fs.readFile(getAgentsPath(), 'utf-8');
      parts.push(agents);
    } catch {
      // No AGENTS.md
    }

    // Load IDENTITY.md
    try {
      const identity = await fs.readFile(getIdentityPath(), 'utf-8');
      parts.push(identity);
    } catch {
      // No IDENTITY.md
    }

    // Load USER.md
    try {
      const user = await fs.readFile(getUserPath(), 'utf-8');
      parts.push(`\n## About the User\n${user}`);
    } catch {
      // No USER.md
    }

    if (parts.length > 0) {
      this.systemPrompt = parts.join('\n\n---\n\n');
    } else {
      // Default personality
      this.systemPrompt = `You are Auxiora, a helpful AI assistant. Be concise, accurate, and friendly.`;
    }
  }

  private async handleMessage(client: ClientConnection, message: WsMessage): Promise<void> {
    const { id: requestId, payload } = message;
    const content = (payload as { content?: string } | undefined)?.content;

    if (!content || typeof content !== 'string') {
      this.sendToClient(client, {
        type: 'error',
        id: requestId,
        payload: { message: 'Missing message content' },
      });
      return;
    }

    // Handle commands
    if (content.startsWith('/')) {
      await this.handleCommand(client, content, requestId);
      return;
    }

    // Get or create session
    const session = await this.sessions.getOrCreate(client.id, {
      channelType: client.channelType,
      clientId: client.id,
      senderId: client.senderId,
    });

    // Add user message
    await this.sessions.addMessage(session.id, 'user', content);

    // Check if providers are available
    if (!this.providers) {
      this.sendToClient(client, {
        type: 'message',
        id: requestId,
        payload: {
          role: 'assistant',
          content:
            'I need API keys to respond. Please add them:\n\n```\nauxiora vault add ANTHROPIC_API_KEY\n```',
        },
      });
      return;
    }

    // Get context messages
    const contextMessages = this.sessions.getContextMessages(session.id);
    const chatMessages = contextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // Get tool definitions from registry
      const tools = toolRegistry.toProviderFormat();

      // Stream response with tools
      const provider = this.providers.getPrimaryProvider();
      let fullResponse = '';
      let usage = { inputTokens: 0, outputTokens: 0 };
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      for await (const chunk of provider.stream(chatMessages, {
        systemPrompt: this.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      })) {
        if (chunk.type === 'text' && chunk.content) {
          fullResponse += chunk.content;
          this.sendToClient(client, {
            type: 'chunk',
            id: requestId,
            payload: { content: chunk.content },
          });
        } else if (chunk.type === 'tool_use' && chunk.toolUse) {
          // Collect tool uses for execution
          toolUses.push(chunk.toolUse);
          this.sendToClient(client, {
            type: 'tool_use',
            id: requestId,
            payload: { tool: chunk.toolUse.name, params: chunk.toolUse.input },
          });
        } else if (chunk.type === 'done') {
          usage = chunk.usage || usage;
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error);
        }
      }

      // Save assistant message
      await this.sessions.addMessage(session.id, 'assistant', fullResponse, {
        input: usage.inputTokens,
        output: usage.outputTokens,
      });

      // Execute tools if any were called
      if (toolUses.length > 0) {
        await this.handleToolExecution(client, session.id, toolUses, requestId);
      } else {
        // No tools used - send done signal
        this.sendToClient(client, {
          type: 'done',
          id: requestId,
          payload: { usage },
        });
      }

      audit('message.sent', {
        sessionId: session.id,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      audit('channel.error', { sessionId: session.id, error: errorMessage });

      this.sendToClient(client, {
        type: 'error',
        id: requestId,
        payload: { message: `Error: ${errorMessage}` },
      });
    }
  }

  private async handleCommand(
    client: ClientConnection,
    command: string,
    requestId?: string
  ): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'status': {
        const activeSessions = this.sessions.getActiveSessions();
        const providers = this.providers?.listAvailable() || [];
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: `**Status**\n- Sessions: ${activeSessions.length} active\n- Providers: ${providers.join(', ') || 'none configured'}\n- Uptime: ${Math.floor(process.uptime())}s`,
          },
        });
        break;
      }

      case 'new':
      case 'reset': {
        const session = await this.sessions.getOrCreate(client.id, {
          channelType: client.channelType,
          clientId: client.id,
        });
        await this.sessions.clear(session.id);
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: 'Session cleared. Starting fresh!',
          },
        });
        break;
      }

      case 'help': {
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: `**Commands**\n- /status - Show system status\n- /new - Start a new session\n- /reset - Clear current session\n- /help - Show this help`,
          },
        });
        break;
      }

      default: {
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: `Unknown command: ${cmd}. Try /help`,
          },
        });
      }
    }
  }

  private async handleToolExecution(
    client: ClientConnection,
    sessionId: string,
    toolUses: Array<{ id: string; name: string; input: any }>,
    requestId?: string
  ): Promise<void> {
    // Create execution context
    const context: ExecutionContext = {
      sessionId,
      workingDirectory: getWorkspacePath(),
      timeout: 30000,
    };

    // Execute each tool
    const toolResults = [];
    for (const toolUse of toolUses) {
      try {
        const result = await toolExecutor.execute(toolUse.name, toolUse.input, context);

        // Send tool result to client
        this.sendToClient(client, {
          type: 'tool_result',
          id: requestId,
          payload: {
            tool: toolUse.name,
            success: result.success,
            output: result.output,
            error: result.error,
          },
        });

        // Store result for sending back to AI
        toolResults.push({
          tool_use_id: toolUse.id,
          content: result.success
            ? (result.output || 'Tool executed successfully')
            : `Error: ${result.error || 'Unknown error'}`,
          is_error: !result.success,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.sendToClient(client, {
          type: 'tool_result',
          id: requestId,
          payload: {
            tool: toolUse.name,
            success: false,
            error: errorMessage,
          },
        });

        toolResults.push({
          tool_use_id: toolUse.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        });
      }
    }

    // Add tool results to session as a system message (for context)
    const toolResultsSummary = toolResults.map(r =>
      `Tool ${r.tool_use_id}: ${r.is_error ? 'ERROR' : 'SUCCESS'}\n${r.content}`
    ).join('\n\n');
    await this.sessions.addMessage(sessionId, 'user', `[Tool Results]\n${toolResultsSummary}`);

    // Continue conversation with tool results
    // In a full implementation, we would send tool results back to the AI
    // and let it process them. For now, we just send a done signal.
    this.sendToClient(client, {
      type: 'done',
      id: requestId,
      payload: { toolResults },
    });
  }

  private sendToClient(client: ClientConnection, message: object): void {
    if (client.ws.readyState === 1) {
      // WebSocket.OPEN
      client.ws.send(JSON.stringify(message));
    }
  }

  private async handleChannelMessage(inbound: InboundMessage): Promise<void> {
    // Get or create session for this sender
    const session = await this.sessions.getOrCreate(
      `${inbound.channelType}:${inbound.senderId}`,
      {
        channelType: inbound.channelType,
        senderId: inbound.senderId,
      }
    );

    // Handle commands
    if (inbound.content.startsWith('/')) {
      const response = await this.handleChannelCommand(inbound.content, session.id);
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: response,
          replyToId: inbound.id,
        });
      }
      return;
    }

    // Add user message
    await this.sessions.addMessage(session.id, 'user', inbound.content);

    // Check if providers are available
    if (!this.providers) {
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: 'I need API keys to respond. Please configure them in the vault.',
          replyToId: inbound.id,
        });
      }
      return;
    }

    // Get context messages
    const contextMessages = this.sessions.getContextMessages(session.id);
    const chatMessages = contextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // Get tool definitions from registry
      const tools = toolRegistry.toProviderFormat();

      // Get completion (non-streaming for channels)
      const provider = this.providers.getPrimaryProvider();
      const result = await provider.complete(chatMessages, {
        systemPrompt: this.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      });

      // Save assistant message
      await this.sessions.addMessage(session.id, 'assistant', result.content, {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      });

      // Send response
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: result.content,
          replyToId: inbound.id,
        });
      }

      audit('message.sent', {
        channelType: inbound.channelType,
        sessionId: session.id,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      audit('channel.error', { sessionId: session.id, error: errorMessage });

      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: `Error: ${errorMessage}`,
          replyToId: inbound.id,
        });
      }
    }
  }

  private async handleChannelCommand(command: string, sessionId: string): Promise<string> {
    const [cmd] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'status': {
        const activeSessions = this.sessions.getActiveSessions();
        const providers = this.providers?.listAvailable() || [];
        const channels = this.channels?.getConnectedChannels() || [];
        return `**Status**\n- Sessions: ${activeSessions.length} active\n- Providers: ${providers.join(', ') || 'none'}\n- Channels: ${channels.join(', ') || 'webchat only'}`;
      }

      case 'new':
      case 'reset': {
        await this.sessions.clear(sessionId);
        return 'Session cleared. Starting fresh!';
      }

      case 'help': {
        return `**Commands**\n- /status - Show system status\n- /new - Start a new session\n- /reset - Clear current session\n- /help - Show this help`;
      }

      default:
        return `Unknown command: ${cmd}. Try /help`;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.gateway.start();

    // Connect channels if configured
    if (this.channels) {
      try {
        await this.channels.connectAll();
        const connected = this.channels.getConnectedChannels();
        if (connected.length > 0) {
          console.log(`Connected channels: ${connected.join(', ')}`);
        }
      } catch (error) {
        console.warn('Some channels failed to connect:', error);
      }
    }

    this.running = true;

    console.log(`\nAuxiora is ready!`);
    console.log(`Open http://${this.config.gateway.host}:${this.config.gateway.port} in your browser\n`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    if (this.channels) {
      await this.channels.disconnectAll();
    }
    await this.gateway.stop();
    if (this.behaviors) {
      await this.behaviors.stop();
    }
    this.sessions.destroy();
    this.vault.lock();
    this.running = false;
  }

  getConfig(): Config {
    return this.config;
  }
}

export async function startAuxiora(options: AuxioraOptions = {}): Promise<Auxiora> {
  const auxiora = new Auxiora();
  await auxiora.initialize(options);
  await auxiora.start();
  return auxiora;
}
