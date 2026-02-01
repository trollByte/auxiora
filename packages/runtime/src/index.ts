import { Gateway, type ClientConnection, type WsMessage } from '@auxiora/gateway';
import { SessionManager, type Message } from '@auxiora/sessions';
import { ProviderFactory, type StreamChunk } from '@auxiora/providers';
import { loadConfig, type Config } from '@auxiora/config';
import { Vault } from '@auxiora/vault';
import { audit } from '@auxiora/audit';
import {
  getWorkspacePath,
  getSoulPath,
  getAgentsPath,
  getIdentityPath,
  getUserPath,
} from '@auxiora/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface AuxioraOptions {
  config?: Config;
  vaultPassword?: string;
}

export class Auxiora {
  private config!: Config;
  private gateway!: Gateway;
  private sessions!: SessionManager;
  private providers!: ProviderFactory;
  private vault!: Vault;
  private systemPrompt: string = '';
  private running = false;

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

    // Load personality files
    await this.loadPersonality();

    // Initialize gateway
    this.gateway = new Gateway({ config: this.config });
    this.gateway.onMessage(this.handleMessage.bind(this));
  }

  private async initializeProviders(): Promise<void> {
    let anthropicKey: string | undefined;
    let openaiKey: string | undefined;

    try {
      anthropicKey = this.vault.get('ANTHROPIC_API_KEY');
      openaiKey = this.vault.get('OPENAI_API_KEY');
    } catch {
      // Vault is locked
      console.warn('Vault is locked. AI providers not initialized.');
      console.warn('To use AI: auxiora vault add ANTHROPIC_API_KEY');
      return;
    }

    if (!anthropicKey && !openaiKey) {
      console.warn('No API keys found in vault. Add with: auxiora vault add ANTHROPIC_API_KEY');
      return;
    }

    this.providers = new ProviderFactory({
      primary: this.config.provider.primary,
      fallback: this.config.provider.fallback,
      config: {
        anthropic: anthropicKey
          ? {
              apiKey: anthropicKey,
              model: this.config.provider.anthropic.model,
              maxTokens: this.config.provider.anthropic.maxTokens,
            }
          : undefined,
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
      // Stream response
      const provider = this.providers.getPrimaryProvider();
      let fullResponse = '';
      let usage = { inputTokens: 0, outputTokens: 0 };

      for await (const chunk of provider.stream(chatMessages, {
        systemPrompt: this.systemPrompt,
      })) {
        if (chunk.type === 'text' && chunk.content) {
          fullResponse += chunk.content;
          this.sendToClient(client, {
            type: 'chunk',
            id: requestId,
            payload: { content: chunk.content },
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

      // Send done signal
      this.sendToClient(client, {
        type: 'done',
        id: requestId,
        payload: { usage },
      });

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

  private sendToClient(client: ClientConnection, message: object): void {
    if (client.ws.readyState === 1) {
      // WebSocket.OPEN
      client.ws.send(JSON.stringify(message));
    }
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.gateway.start();
    this.running = true;

    console.log(`\nAuxiora is ready!`);
    console.log(`Open http://${this.config.gateway.host}:${this.config.gateway.port} in your browser\n`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    await this.gateway.stop();
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
