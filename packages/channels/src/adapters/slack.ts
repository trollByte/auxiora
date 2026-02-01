import { App, LogLevel } from '@slack/bolt';
import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface SlackAdapterConfig {
  botToken: string;
  appToken: string;
  signingSecret?: string;
}

const MAX_MESSAGE_LENGTH = 40000;

export class SlackAdapter implements ChannelAdapter {
  readonly type = 'slack' as const;
  readonly name = 'Slack';

  private app: App;
  private config: SlackAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private botUserId?: string;

  constructor(config: SlackAdapterConfig) {
    this.config = config;
    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Listen to all messages
    this.app.message(async ({ message, say, client }) => {
      // Type guard for regular messages
      if (!('user' in message) || !('text' in message)) return;
      if (message.subtype) return; // Ignore edited, deleted, etc.

      // Get bot user ID if we don't have it
      if (!this.botUserId) {
        const auth = await client.auth.test();
        this.botUserId = auth.user_id;
      }

      // Ignore bot's own messages
      if (message.user === this.botUserId) return;

      const inbound = this.toInboundMessage(message);

      audit('message.received', {
        channelType: 'slack',
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

    // Handle mentions specifically
    this.app.event('app_mention', async ({ event, client }) => {
      // Get bot user ID if we don't have it
      if (!this.botUserId) {
        const auth = await client.auth.test();
        this.botUserId = auth.user_id;
      }

      // Strip bot mention from text
      let content = event.text || '';
      if (this.botUserId) {
        content = content.replace(new RegExp(`<@${this.botUserId}>`, 'g'), '').trim();
      }

      const inbound: InboundMessage = {
        id: event.ts,
        channelType: 'slack',
        channelId: event.channel || '',
        senderId: event.user || '',
        content,
        timestamp: parseFloat(event.ts) * 1000,
        replyToId: event.thread_ts,
        raw: event,
      };

      audit('message.received', {
        channelType: 'slack',
        senderId: inbound.senderId,
        channelId: inbound.channelId,
        isMention: true,
      });

      if (this.messageHandler) {
        try {
          await this.messageHandler(inbound);
        } catch (error) {
          this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });

    this.app.error(async (error) => {
      audit('channel.error', { channelType: 'slack', error: error.message });
      this.errorHandler?.(error);
    });
  }

  private toInboundMessage(message: {
    ts: string;
    channel?: string;
    user?: string;
    text?: string;
    thread_ts?: string;
  }): InboundMessage {
    return {
      id: message.ts,
      channelType: 'slack',
      channelId: message.channel || '',
      senderId: message.user || '',
      content: message.text || '',
      timestamp: parseFloat(message.ts) * 1000,
      replyToId: message.thread_ts,
      raw: message,
    };
  }

  async connect(): Promise<void> {
    await this.app.start();
    this.connected = true;
    audit('channel.connected', { channelType: 'slack' });
  }

  async disconnect(): Promise<void> {
    await this.app.stop();
    this.connected = false;
    audit('channel.disconnected', { channelType: 'slack' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      // Chunk long messages
      const chunks = this.chunkMessage(message.content);
      let lastTs: string | undefined;

      for (const chunk of chunks) {
        const result = await this.app.client.chat.postMessage({
          channel: channelId,
          text: chunk,
          thread_ts: message.replyToId,
          mrkdwn: message.formatting?.markdown !== false,
        });
        lastTs = result.ts;
      }

      audit('message.sent', {
        channelType: 'slack',
        channelId,
        messageId: lastTs,
      });

      return { success: true, messageId: lastTs };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'slack',
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

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
