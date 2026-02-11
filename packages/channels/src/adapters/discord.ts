import {
  Client,
  GatewayIntentBits,
  Partials,
  Message as DiscordMessage,
  ChannelType as DiscordChannelType,
} from 'discord.js';
import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface DiscordAdapterConfig {
  token: string;
  mentionOnly?: boolean;
  allowedGuilds?: string[];
}

const MAX_MESSAGE_LENGTH = 2000;

export class DiscordAdapter implements ChannelAdapter {
  readonly type = 'discord' as const;
  readonly name = 'Discord';

  private client: Client;
  private config: DiscordAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;

  constructor(config: DiscordAdapterConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('clientReady', () => {
      audit('channel.connected', {
        channelType: 'discord',
        username: this.client.user?.tag,
      });
      this.connected = true;
    });

    this.client.on('messageCreate', async (message: DiscordMessage) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Check guild allowlist
      if (
        message.guild &&
        this.config.allowedGuilds?.length &&
        !this.config.allowedGuilds.includes(message.guild.id)
      ) {
        return;
      }

      // Check mention requirement for guild messages
      if (
        this.config.mentionOnly &&
        message.guild &&
        !message.mentions.has(this.client.user!.id)
      ) {
        return;
      }

      // Convert to inbound message
      const inbound = this.toInboundMessage(message);

      audit('message.received', {
        channelType: 'discord',
        senderId: inbound.senderId,
        channelId: inbound.channelId,
      });

      if (this.messageHandler) {
        try {
          await this.messageHandler(inbound);
        } catch (error) {
          this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });

    this.client.on('error', (error) => {
      audit('channel.error', { channelType: 'discord', error: error.message });
      this.errorHandler?.(error);
    });

    this.client.on('disconnect', () => {
      this.connected = false;
      audit('channel.disconnected', { channelType: 'discord' });
    });
  }

  private toInboundMessage(message: DiscordMessage): InboundMessage {
    // Strip bot mention from content
    let content = message.content;
    if (this.client.user) {
      content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    }

    return {
      id: message.id,
      channelType: 'discord',
      channelId: message.channel.id,
      senderId: message.author.id,
      senderName: message.author.displayName || message.author.username,
      content,
      timestamp: message.createdTimestamp,
      replyToId: message.reference?.messageId,
      attachments: message.attachments.map((a) => ({
        type: a.contentType?.startsWith('image/')
          ? 'image'
          : a.contentType?.startsWith('audio/')
            ? 'audio'
            : a.contentType?.startsWith('video/')
              ? 'video'
              : 'file',
        url: a.url,
        mimeType: a.contentType || undefined,
        filename: a.name,
        size: a.size,
      })),
      raw: message,
    };
  }

  async connect(): Promise<void> {
    await this.client.login(this.config.token);
  }

  async disconnect(): Promise<void> {
    this.client.destroy();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        return { success: false, error: 'Channel not found or not text-based' };
      }

      // Chunk long messages
      const chunks = this.chunkMessage(message.content);
      let lastMessageId: string | undefined;

      for (const chunk of chunks) {
        const sent = await channel.send({
          content: chunk,
          reply: message.replyToId
            ? { messageReference: message.replyToId }
            : undefined,
        });
        lastMessageId = sent.id;
      }

      audit('message.sent', {
        channelType: 'discord',
        channelId,
        messageId: lastMessageId,
      });

      return { success: true, messageId: lastMessageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'discord',
        action: 'send',
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  private chunkMessage(content: string): string[] {
    if (content.length <= MAX_MESSAGE_LENGTH) {
      return [content];
    }

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point
      let breakPoint = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
      if (breakPoint === -1 || breakPoint < MAX_MESSAGE_LENGTH / 2) {
        breakPoint = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
      }
      if (breakPoint === -1 || breakPoint < MAX_MESSAGE_LENGTH / 2) {
        breakPoint = MAX_MESSAGE_LENGTH;
      }

      chunks.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint).trimStart();
    }

    return chunks;
  }

  async startTyping(channelId: string): Promise<() => void> {
    // Use cache (populated by messageCreate) to avoid extra API call
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased() || !('sendTyping' in channel)) {
      return () => {};
    }
    // Send immediately, then repeat every 8s (Discord typing expires after ~10s)
    let stopped = false;
    channel.sendTyping().catch((e: Error) => {
      audit('channel.error', { channelType: 'discord', action: 'typing', error: e.message });
    });
    const interval = setInterval(() => {
      if (stopped) return;
      channel.sendTyping().catch(() => {});
    }, 8000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
