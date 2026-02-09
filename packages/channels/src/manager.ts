import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from './types.js';
import { DiscordAdapter, type DiscordAdapterConfig } from './adapters/discord.js';
import { TelegramAdapter, type TelegramAdapterConfig } from './adapters/telegram.js';
import { SlackAdapter, type SlackAdapterConfig } from './adapters/slack.js';
import { TwilioAdapter, type TwilioAdapterConfig } from './adapters/twilio.js';

export interface ChannelManagerConfig {
  discord?: DiscordAdapterConfig;
  telegram?: TelegramAdapterConfig;
  slack?: SlackAdapterConfig;
  twilio?: TwilioAdapterConfig;
}

export class ChannelManager {
  private adapters: Map<ChannelType, ChannelAdapter> = new Map();
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error, channelType: ChannelType) => void;

  constructor(config: ChannelManagerConfig) {
    // Initialize configured adapters
    if (config.discord?.token) {
      this.adapters.set('discord', new DiscordAdapter(config.discord));
    }

    if (config.telegram?.token) {
      this.adapters.set('telegram', new TelegramAdapter(config.telegram));
    }

    if (config.slack?.botToken && config.slack?.appToken) {
      this.adapters.set('slack', new SlackAdapter(config.slack));
    }

    if (config.twilio?.accountSid && config.twilio?.authToken) {
      this.adapters.set('twilio', new TwilioAdapter(config.twilio));
    }
  }

  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([type, adapter]) => {
        try {
          // Set up message handler
          adapter.onMessage(async (message) => {
            if (this.messageHandler) {
              await this.messageHandler(message);
            }
          });

          // Set up error handler
          adapter.onError((error) => {
            if (this.errorHandler) {
              this.errorHandler(error, type);
            }
          });

          await adapter.connect();
          console.log(`Connected to ${adapter.name}`);
        } catch (error) {
          console.error(`Failed to connect to ${adapter.name}:`, error);
          throw error;
        }
      })
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`${failures.length} channel(s) failed to connect`);
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.adapters.values()).map((adapter) => adapter.disconnect())
    );
  }

  async connect(type: ChannelType): Promise<void> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Channel not configured: ${type}`);
    }

    adapter.onMessage(async (message) => {
      if (this.messageHandler) {
        await this.messageHandler(message);
      }
    });

    adapter.onError((error) => {
      if (this.errorHandler) {
        this.errorHandler(error, type);
      }
    });

    await adapter.connect();
  }

  async disconnect(type: ChannelType): Promise<void> {
    const adapter = this.adapters.get(type);
    if (adapter) {
      await adapter.disconnect();
    }
  }

  async send(
    channelType: ChannelType,
    channelId: string,
    message: OutboundMessage
  ): Promise<SendResult> {
    const adapter = this.adapters.get(channelType);
    if (!adapter) {
      return { success: false, error: `Channel not configured: ${channelType}` };
    }

    if (!adapter.isConnected()) {
      return { success: false, error: `Channel not connected: ${channelType}` };
    }

    return adapter.send(channelId, message);
  }

  async startTyping(channelType: ChannelType, channelId: string): Promise<() => void> {
    const adapter = this.adapters.get(channelType);
    if (!adapter?.startTyping || !adapter.isConnected()) {
      return () => {};
    }
    return adapter.startTyping(channelId);
  }

  getAdapter<T extends ChannelAdapter>(type: ChannelType): T | undefined {
    return this.adapters.get(type) as T | undefined;
  }

  getConnectedChannels(): ChannelType[] {
    return Array.from(this.adapters.entries())
      .filter(([_, adapter]) => adapter.isConnected())
      .map(([type]) => type);
  }

  getConfiguredChannels(): ChannelType[] {
    return Array.from(this.adapters.keys());
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error, channelType: ChannelType) => void): void {
    this.errorHandler = handler;
  }
}
