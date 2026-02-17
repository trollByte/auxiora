import { audit } from '@auxiora/audit';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('channels');
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
import { EmailAdapter, type EmailAdapterConfig } from './adapters/email.js';
import { MatrixAdapter, type MatrixAdapterConfig } from './adapters/matrix.js';
import { SignalAdapter, type SignalAdapterConfig } from './adapters/signal.js';
import { TeamsAdapter, type TeamsAdapterConfig } from './adapters/teams.js';
import { WhatsAppAdapter, type WhatsAppAdapterConfig } from './adapters/whatsapp.js';
import { GoogleChatAdapter, type GoogleChatAdapterConfig } from './adapters/googlechat.js';
import { BlueBubblesAdapter, type BlueBubblesAdapterConfig } from './adapters/bluebubbles.js';
import { ZaloAdapter, type ZaloAdapterConfig } from './adapters/zalo.js';
import { isDuplicate } from './inbound-dedup.js';

export interface ChannelManagerConfig {
  discord?: DiscordAdapterConfig;
  telegram?: TelegramAdapterConfig;
  slack?: SlackAdapterConfig;
  twilio?: TwilioAdapterConfig;
  email?: EmailAdapterConfig;
  matrix?: MatrixAdapterConfig;
  signal?: SignalAdapterConfig;
  teams?: TeamsAdapterConfig;
  whatsapp?: WhatsAppAdapterConfig;
  googlechat?: GoogleChatAdapterConfig;
  bluebubbles?: BlueBubblesAdapterConfig;
  zalo?: ZaloAdapterConfig;
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

    if (config.googlechat?.serviceAccountKey) {
      this.adapters.set('googlechat', new GoogleChatAdapter(config.googlechat));
    }

    if (config.bluebubbles?.serverUrl && config.bluebubbles?.password) {
      this.adapters.set('bluebubbles', new BlueBubblesAdapter(config.bluebubbles));
    }

    if (config.email?.imapHost && config.email?.smtpHost && config.email?.email && config.email?.password) {
      this.adapters.set('email', new EmailAdapter(config.email));
    }

    if (config.matrix?.homeserverUrl && config.matrix?.accessToken) {
      this.adapters.set('matrix', new MatrixAdapter(config.matrix));
    }

    if (config.signal?.signalCliEndpoint && config.signal?.phoneNumber) {
      this.adapters.set('signal', new SignalAdapter(config.signal));
    }

    if (config.teams?.microsoftAppId && config.teams?.microsoftAppPassword) {
      this.adapters.set('teams', new TeamsAdapter(config.teams));
    }

    if (config.whatsapp?.phoneNumberId && config.whatsapp?.accessToken && config.whatsapp?.verifyToken) {
      this.adapters.set('whatsapp', new WhatsAppAdapter(config.whatsapp));
    }

    if (config.zalo?.oaAccessToken && config.zalo?.oaSecretKey) {
      this.adapters.set('zalo', new ZaloAdapter(config.zalo));
    }
  }

  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([type, adapter]) => {
        try {
          // Set up message handler
          adapter.onMessage(async (message) => {
            if (isDuplicate(message.channelType, message.channelId, message.id)) {
              logger.debug(`Duplicate inbound dropped: ${message.channelType}:${message.id}`);
              return;
            }
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
          logger.info(`Connected to ${adapter.name}`);
        } catch (error) {
          logger.error(`Failed to connect to ${adapter.name}`, { error: error instanceof Error ? error : new Error(String(error)) });
          throw error;
        }
      })
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn(`${failures.length} channel(s) failed to connect`);
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

  getDefaultChannelId(channelType: ChannelType): string | undefined {
    return this.adapters.get(channelType)?.getDefaultChannelId?.();
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
