// Types
export type {
  ChannelType,
  ChannelAdapter,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
  Attachment,
} from './types.js';

// Adapters
export {
  DiscordAdapter,
  type DiscordAdapterConfig,
} from './adapters/discord.js';

export {
  TelegramAdapter,
  type TelegramAdapterConfig,
} from './adapters/telegram.js';

export {
  SlackAdapter,
  type SlackAdapterConfig,
} from './adapters/slack.js';

export {
  TwilioAdapter,
  type TwilioAdapterConfig,
  type TwilioWebhookBody,
} from './adapters/twilio.js';

// Manager
export {
  ChannelManager,
  type ChannelManagerConfig,
} from './manager.js';
