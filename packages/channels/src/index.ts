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

export {
  MatrixAdapter,
  type MatrixAdapterConfig,
} from './adapters/matrix.js';

export {
  SignalAdapter,
  type SignalAdapterConfig,
} from './adapters/signal.js';

export {
  EmailAdapter,
  type EmailAdapterConfig,
} from './adapters/email.js';

export {
  TeamsAdapter,
  type TeamsAdapterConfig,
} from './adapters/teams.js';

export {
  WhatsAppAdapter,
  type WhatsAppAdapterConfig,
} from './adapters/whatsapp.js';

// Manager
export {
  ChannelManager,
  type ChannelManagerConfig,
} from './manager.js';
