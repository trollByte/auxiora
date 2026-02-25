import { Bot, Context } from 'grammy';
import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';
import { chunkMarkdown } from '../chunk.js';

export interface TelegramAdapterConfig {
  token: string;
  webhookUrl?: string;
  allowedChats?: string[];
}

const MAX_MESSAGE_LENGTH = 4096;

export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram' as const;
  readonly name = 'Telegram';

  private bot: Bot;
  private config: TelegramAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;

  constructor(config: TelegramAdapterConfig) {
    this.config = config;
    this.bot = new Bot(config.token);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.bot.on('message:text', async (ctx: Context) => {
      const message = ctx.message;
      if (!message || !message.text) return;

      // Check chat allowlist
      if (
        this.config.allowedChats?.length &&
        !this.config.allowedChats.includes(String(message.chat.id))
      ) {
        return;
      }

      const inbound = this.toInboundMessage(ctx);

      audit('message.received', {
        channelType: 'telegram',
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

    this.bot.catch((error) => {
      audit('channel.error', { channelType: 'telegram', error: error.message });
      this.errorHandler?.(error);
    });
  }

  private toInboundMessage(ctx: Context): InboundMessage {
    const message = ctx.message!;
    const from = message.from!;

    return {
      id: String(message.message_id),
      channelType: 'telegram',
      channelId: String(message.chat.id),
      senderId: String(from.id),
      senderName: from.first_name + (from.last_name ? ` ${from.last_name}` : ''),
      content: message.text || '',
      timestamp: message.date * 1000,
      replyToId: message.reply_to_message
        ? String(message.reply_to_message.message_id)
        : undefined,
      raw: message,
      groupContext: message.chat.type === 'group' || message.chat.type === 'supergroup'
        ? {
            isGroup: true,
            groupName: 'title' in message.chat ? (message.chat as { title?: string }).title : undefined,
          }
        : undefined,
    };
  }

  async connect(): Promise<void> {
    if (!this.config.token) {
      audit('channel.skipped', { channelType: 'telegram', reason: 'missing token' });
      return;
    }
    if (this.config.webhookUrl) {
      await this.bot.api.setWebhook(this.config.webhookUrl);
    } else {
      // Start polling
      this.bot.start({
        onStart: () => {
          audit('channel.connected', { channelType: 'telegram' });
          this.connected = true;
        },
      });
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.bot.stop();
    this.connected = false;
    audit('channel.disconnected', { channelType: 'telegram' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chatId = parseInt(channelId, 10);

      // Chunk long messages
      const chunks = chunkMarkdown(message.content, MAX_MESSAGE_LENGTH);
      let lastMessageId: number | undefined;

      for (const chunk of chunks) {
        const sent = await this.bot.api.sendMessage(chatId, chunk, {
          parse_mode: message.formatting?.markdown ? 'MarkdownV2' : undefined,
          reply_parameters: message.replyToId
            ? { message_id: parseInt(message.replyToId, 10) }
            : undefined,
        });
        lastMessageId = sent.message_id;
      }

      audit('message.sent', {
        channelType: 'telegram',
        channelId,
        messageId: lastMessageId,
      });

      return { success: true, messageId: String(lastMessageId) };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'telegram',
        action: 'send',
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  async editMessage(channelId: string, messageId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chatId = Number(channelId);
      await this.bot.api.editMessageText(chatId, Number(messageId), message.content);
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Edit failed' };
    }
  }

  async startTyping(channelId: string): Promise<() => void> {
    const chatId = parseInt(channelId, 10);
    // Send immediately, then repeat every 4s (Telegram typing expires after ~5s)
    let stopped = false;
    this.bot.api.sendChatAction(chatId, 'typing').catch((e: Error) => {
      audit('channel.error', { channelType: 'telegram', action: 'typing', error: e.message });
    });
    const interval = setInterval(() => {
      if (stopped) return;
      this.bot.api.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }

  // Webhook handler for serverless deployments
  async handleWebhook(body: unknown): Promise<void> {
    await this.bot.handleUpdate(body as Parameters<typeof this.bot.handleUpdate>[0]);
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
