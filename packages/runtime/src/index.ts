import { Gateway, type ClientConnection, type WsMessage } from '@auxiora/gateway';
import { SessionManager, type Message } from '@auxiora/sessions';
import { ProviderFactory, type StreamChunk, readClaudeCliCredentials, isSetupToken } from '@auxiora/providers';
import { ChannelManager, type InboundMessage } from '@auxiora/channels';
import { loadConfig, type Config, type AgentIdentity } from '@auxiora/config';
import { Vault } from '@auxiora/vault';
import { audit } from '@auxiora/audit';
import {
  getWorkspacePath,
  getSoulPath,
  getAgentsPath,
  getIdentityPath,
  getUserPath,
  getBehaviorsPath,
  getWebhooksPath,
  getScreenshotsDir,
} from '@auxiora/core';
import {
  toolRegistry,
  toolExecutor,
  initializeToolExecutor,
  setBrowserManager,
  setWebhookManager,
  setBehaviorManager,
  type ExecutionContext,
} from '@auxiora/tools';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BehaviorManager } from '@auxiora/behaviors';
import { BrowserManager } from '@auxiora/browser';
import { VoiceManager } from '@auxiora/voice';
import { WhisperSTT } from '@auxiora/stt';
import { OpenAITTS } from '@auxiora/tts';
import { WebhookManager } from '@auxiora/webhooks';
import { createDashboardRouter } from '@auxiora/dashboard';
import { PluginLoader } from '@auxiora/plugins';
import { MemoryStore, MemoryRetriever } from '@auxiora/memory';
import { setMemoryStore } from '@auxiora/tools';
import { getAuditLogger } from '@auxiora/audit';
import { Router } from 'express';
import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';

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
  private browserManager?: BrowserManager;
  private voiceManager?: VoiceManager;
  private webhookManager?: WebhookManager;
  private pluginLoader?: PluginLoader;
  private memoryStore?: MemoryStore;
  private memoryRetriever?: MemoryRetriever;

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
      setBehaviorManager(this.behaviors);
    }

    // Initialize browser system
    this.browserManager = new BrowserManager({
      config: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        navigationTimeout: 30_000,
        actionTimeout: 10_000,
        maxConcurrentPages: 10,
        screenshotDir: getScreenshotsDir(),
      },
    });
    setBrowserManager(this.browserManager);

    // Initialize voice system (if enabled and OpenAI key available)
    if (this.config.voice?.enabled) {
      let openaiKeyForVoice: string | undefined;
      try {
        openaiKeyForVoice = this.vault.get('OPENAI_API_KEY');
      } catch {
        // Vault locked
      }

      if (openaiKeyForVoice) {
        this.voiceManager = new VoiceManager({
          sttProvider: new WhisperSTT({ apiKey: openaiKeyForVoice }),
          ttsProvider: new OpenAITTS({
            apiKey: openaiKeyForVoice,
            defaultVoice: this.config.voice.defaultVoice,
          }),
          config: {
            enabled: true,
            defaultVoice: this.config.voice.defaultVoice,
            language: this.config.voice.language,
            maxAudioDuration: this.config.voice.maxAudioDuration,
            sampleRate: this.config.voice.sampleRate,
          },
        });
        this.gateway.onVoiceMessage(this.handleVoiceMessage.bind(this));
        console.log('Voice mode enabled');
      } else {
        console.warn('Voice mode enabled in config but no OPENAI_API_KEY found in vault');
      }
    }

    // Initialize webhook system (if enabled)
    if (this.config.webhooks?.enabled) {
      this.webhookManager = new WebhookManager({
        storePath: getWebhooksPath(),
        config: {
          enabled: true,
          basePath: this.config.webhooks.basePath,
          signatureHeader: this.config.webhooks.signatureHeader,
          maxPayloadSize: this.config.webhooks.maxPayloadSize,
        },
      });

      setWebhookManager(this.webhookManager);

      // Wire behavior trigger
      if (this.behaviors) {
        this.webhookManager.setBehaviorTrigger(async (behaviorId: string, payload: string) => {
          return this.behaviors!.executeNow(behaviorId);
        });
      }

      // Mount webhook routes
      const webhookRouter = this.createWebhookRouter();
      this.gateway.mountRouter(this.config.webhooks.basePath, webhookRouter);
      console.log('Webhook listeners enabled');
    }

    // Initialize dashboard (if enabled)
    if (this.config.dashboard?.enabled) {
      const { router } = createDashboardRouter({
        deps: {
          vault: this.vault,
          behaviors: this.behaviors,
          webhooks: this.webhookManager,
          getConnections: () => this.gateway.getConnections(),
          getAuditEntries: async (limit?: number) => {
            const auditLogger = getAuditLogger();
            return auditLogger.getEntries(limit);
          },
          getPlugins: () => this.pluginLoader?.listPlugins() ?? [],
          getMemories: async () => this.memoryStore?.getAll() ?? [],
        },
        config: {
          enabled: true,
          sessionTtlMs: this.config.dashboard.sessionTtlMs,
        },
        verifyPassword: (input: string) => {
          const stored = this.vault.get('DASHBOARD_PASSWORD');
          if (!stored) return false;
          const a = Buffer.from(stored, 'utf-8');
          const b = Buffer.from(input, 'utf-8');
          if (a.length !== b.length) return false;
          return crypto.timingSafeEqual(a, b);
        },
      });

      this.gateway.mountRouter('/api/v1/dashboard', router);

      // Serve static SPA files
      const dashboardUiPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../dashboard/dist-ui'
      );
      this.gateway.mountRouter('/dashboard', express.static(dashboardUiPath) as any);

      // SPA catch-all: serve index.html for client-side routing
      const dashboardIndexPath = path.join(dashboardUiPath, 'index.html');
      const spaRouter = Router();
      spaRouter.get('*', (_req: Request, res: Response) => {
        res.sendFile(dashboardIndexPath);
      });
      this.gateway.mountRouter('/dashboard', spaRouter as any);

      console.log('Dashboard enabled at /dashboard');
    }

    // Initialize plugin system (if enabled)
    if (this.config.plugins?.enabled !== false) {
      const pluginsDir = this.config.plugins?.dir || undefined;
      this.pluginLoader = new PluginLoader(pluginsDir);
      const loaded = await this.pluginLoader.loadAll();
      const successful = loaded.filter(p => p.status === 'loaded');
      if (loaded.length > 0) {
        console.log(`Plugins: ${successful.length} loaded, ${loaded.length - successful.length} failed`);
      }
    }

    // Initialize memory system (if enabled)
    if (this.config.memory?.enabled !== false) {
      this.memoryStore = new MemoryStore({
        maxEntries: this.config.memory?.maxEntries,
      });
      this.memoryRetriever = new MemoryRetriever();
      setMemoryStore(this.memoryStore);
      console.log('Memory system enabled');
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

  private buildIdentityPreamble(agent: AgentIdentity): string {
    const lines: string[] = ['# Agent Identity'];
    lines.push(`You are ${agent.name} (${agent.pronouns}).`);

    lines.push('');
    lines.push('## Personality');
    lines.push(
      `Warmth: ${agent.tone.warmth}/1.0 | Directness: ${agent.tone.directness}/1.0 | Humor: ${agent.tone.humor}/1.0 | Formality: ${agent.tone.formality}/1.0`,
    );
    lines.push(`Error handling style: ${agent.errorStyle}`);

    if (agent.expertise.length > 0) {
      lines.push('');
      lines.push('## Expertise');
      for (const area of agent.expertise) {
        lines.push(`- ${area}`);
      }
    }

    const phrases = Object.entries(agent.catchphrases).filter(([, v]) => v);
    if (phrases.length > 0) {
      lines.push('');
      lines.push('## Catchphrases');
      for (const [key, value] of phrases) {
        lines.push(`- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
      }
    }

    const hasJokeBoundaries = agent.boundaries.neverJokeAbout.length > 0;
    const hasAdviseBoundaries = agent.boundaries.neverAdviseOn.length > 0;
    if (hasJokeBoundaries || hasAdviseBoundaries) {
      lines.push('');
      lines.push('## Boundaries');
      if (hasJokeBoundaries) {
        lines.push(`Never joke about: ${agent.boundaries.neverJokeAbout.join(', ')}`);
      }
      if (hasAdviseBoundaries) {
        lines.push(`Never advise on: ${agent.boundaries.neverAdviseOn.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  private async loadPersonality(): Promise<void> {
    const parts: string[] = [];

    // Build identity preamble from config
    const agent = this.config.agent;
    parts.push(this.buildIdentityPreamble(agent));

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

    if (parts.length > 1) {
      // Has content beyond the identity preamble
      this.systemPrompt = parts.join('\n\n---\n\n');
    } else {
      // Only identity preamble, no personality files — use enriched default
      this.systemPrompt = `You are ${agent.name}, a helpful AI assistant. Be concise, accurate, and friendly.`;
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

      // Inject relevant memories into system prompt
      let enrichedPrompt = this.systemPrompt;
      if (this.memoryRetriever && this.memoryStore) {
        const memories = await this.memoryStore.getAll();
        const memorySection = this.memoryRetriever.retrieve(memories, content);
        if (memorySection) {
          enrichedPrompt = this.systemPrompt + memorySection;
        }
      }

      // Stream response with tools
      const provider = this.providers.getPrimaryProvider();
      let fullResponse = '';
      let usage = { inputTokens: 0, outputTokens: 0 };
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      for await (const chunk of provider.stream(chatMessages, {
        systemPrompt: enrichedPrompt,
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

      // Extract memories from conversation (if auto-extract enabled)
      if (this.config.memory?.autoExtract !== false && this.memoryStore && this.providers && fullResponse && content.length > 20) {
        this.extractMemories(content, fullResponse).catch(err => {
          console.warn('Memory extraction failed:', err instanceof Error ? err.message : err);
        });
      }

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

  private async handleVoiceMessage(
    client: ClientConnection,
    type: string,
    payload: unknown,
    audioBuffer?: Buffer
  ): Promise<void> {
    if (!this.voiceManager) {
      this.sendToClient(client, {
        type: 'voice_error',
        payload: { message: 'Voice mode not available' },
      });
      return;
    }

    try {
      if (type === 'voice_start') {
        const opts = payload as { voice?: string; language?: string } | undefined;
        this.voiceManager.startSession(client.id, {
          voice: opts?.voice,
          language: opts?.language,
        });
        this.sendToClient(client, { type: 'voice_ready' });
        return;
      }

      if (type === 'voice_cancel') {
        this.voiceManager.endSession(client.id);
        return;
      }

      if (type === 'voice_end' && audioBuffer) {
        // Feed audio into voice manager buffer then transcribe
        this.voiceManager.addAudioFrame(client.id, audioBuffer);
        const transcription = await this.voiceManager.transcribe(client.id);

        this.sendToClient(client, {
          type: 'voice_transcript',
          payload: { text: transcription.text, final: true },
        });

        audit('voice.transcribed', {
          clientId: client.id,
          duration: transcription.duration,
          language: transcription.language,
          textLength: transcription.text.length,
        });

        // Feed transcribed text into AI pipeline
        if (!this.providers) {
          this.sendToClient(client, {
            type: 'voice_error',
            payload: { message: 'AI providers not configured' },
          });
          this.voiceManager.endSession(client.id);
          return;
        }

        const session = await this.sessions.getOrCreate(client.id, {
          channelType: client.channelType,
          clientId: client.id,
          senderId: client.senderId,
        });

        await this.sessions.addMessage(session.id, 'user', transcription.text);

        const contextMessages = this.sessions.getContextMessages(session.id);
        const chatMessages = contextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const provider = this.providers.getPrimaryProvider();
        const result = await provider.complete(chatMessages, {
          systemPrompt: this.systemPrompt,
        });

        await this.sessions.addMessage(session.id, 'assistant', result.content, {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
        });

        // Send text response
        this.sendToClient(client, {
          type: 'voice_text',
          payload: { content: result.content },
        });

        // Stream TTS audio
        for await (const chunk of this.voiceManager.synthesize(client.id, result.content)) {
          this.gateway.sendBinary(client, chunk);
        }

        audit('voice.synthesized', {
          clientId: client.id,
          textLength: result.content.length,
          voice: this.config.voice?.defaultVoice ?? 'alloy',
        });

        this.sendToClient(client, { type: 'voice_end' });
        this.voiceManager.endSession(client.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.sendToClient(client, {
        type: 'voice_error',
        payload: { message: errorMessage },
      });
      this.voiceManager.endSession(client.id);
    }
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

      // Inject relevant memories into system prompt
      let enrichedPrompt = this.systemPrompt;
      if (this.memoryRetriever && this.memoryStore) {
        const memories = await this.memoryStore.getAll();
        const memorySection = this.memoryRetriever.retrieve(memories, inbound.content);
        if (memorySection) {
          enrichedPrompt = this.systemPrompt + memorySection;
        }
      }

      // Get completion (non-streaming for channels)
      const provider = this.providers.getPrimaryProvider();
      const result = await provider.complete(chatMessages, {
        systemPrompt: enrichedPrompt,
        tools: tools.length > 0 ? tools : undefined,
      });

      // Save assistant message
      await this.sessions.addMessage(session.id, 'assistant', result.content, {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      });

      // Extract memories from conversation (if auto-extract enabled)
      if (this.config.memory?.autoExtract !== false && this.memoryStore && this.providers && result.content && inbound.content.length > 20) {
        this.extractMemories(inbound.content, result.content).catch(err => {
          console.warn('Memory extraction failed:', err instanceof Error ? err.message : err);
        });
      }

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

  private async extractMemories(userMessage: string, assistantResponse: string): Promise<void> {
    if (!this.memoryStore || !this.providers) return;

    const extractionPrompt = `You are a fact extraction system. Given a conversation exchange, extract new facts about the user. Return a JSON array of objects with "content" (the fact) and "category" ("preference", "fact", or "context") fields. Return an empty array [] if there are no new facts worth remembering. Only extract concrete, specific facts — not vague observations.

User said: "${userMessage}"
Assistant said: "${assistantResponse}"

Respond with ONLY a JSON array, no other text.`;

    try {
      const provider = this.providers.getPrimaryProvider();
      const result = await provider.complete(
        [{ role: 'user', content: extractionPrompt }],
        { maxTokens: 200 }
      );

      const parsed = JSON.parse(result.content);
      if (!Array.isArray(parsed)) return;

      let count = 0;
      for (const fact of parsed) {
        if (fact.content && typeof fact.content === 'string') {
          await this.memoryStore.add(
            fact.content,
            fact.category || 'fact',
            'extracted'
          );
          count++;
        }
      }

      if (count > 0) {
        void audit('memory.extracted', { count });
      }
    } catch {
      // Extraction is best-effort — don't crash on parse errors
    }
  }

  private createWebhookRouter(): Router {
    const router = Router();

    // Generic webhooks
    router.post('/custom/:name', async (req: Request, res: Response) => {
      if (!this.webhookManager) {
        res.status(503).json({ error: 'Webhooks not available' });
        return;
      }

      // Collect raw body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const body = Buffer.concat(chunks);

      const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      const result = await this.webhookManager.handleGenericWebhook(
        name,
        body,
        req.headers as Record<string, string>,
      );

      res.status(result.status).json({
        accepted: result.accepted,
        ...(result.error && !result.accepted ? { error: result.error } : {}),
      });
    });

    // Channel webhooks — Twilio
    router.post('/twilio', async (req: Request, res: Response) => {
      if (!this.channels) {
        res.status(503).json({ error: 'Channels not available' });
        return;
      }

      const adapter = this.channels.getAdapter('twilio');
      if (!adapter) {
        res.status(503).json({ error: 'Twilio not configured' });
        return;
      }

      const twilioAdapter = adapter as any;
      await twilioAdapter.handleWebhook(req.body);
      res.status(200).type('text/xml').send('<Response></Response>');
    });

    // Channel webhooks — Telegram
    router.post('/telegram', async (req: Request, res: Response) => {
      if (!this.channels) {
        res.status(503).json({ error: 'Channels not available' });
        return;
      }

      const adapter = this.channels.getAdapter('telegram');
      if (!adapter) {
        res.status(503).json({ error: 'Telegram not configured' });
        return;
      }

      const telegramAdapter = adapter as any;
      await telegramAdapter.handleWebhook(req.body);
      res.sendStatus(200);
    });

    return router;
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

    console.log(`\n${this.getAgentName()} is ready!`);
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
    if (this.browserManager) {
      await this.browserManager.shutdown();
    }
    if (this.voiceManager) {
      await this.voiceManager.shutdown();
    }
    if (this.pluginLoader) {
      await this.pluginLoader.shutdownAll();
    }
    this.sessions.destroy();
    this.vault.lock();
    this.running = false;
  }

  getConfig(): Config {
    return this.config;
  }

  getAgentName(): string {
    return this.config.agent?.name ?? 'Auxiora';
  }
}

export async function startAuxiora(options: AuxioraOptions = {}): Promise<Auxiora> {
  const auxiora = new Auxiora();
  await auxiora.initialize(options);
  await auxiora.start();
  return auxiora;
}
