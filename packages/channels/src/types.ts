export type ChannelType = 'discord' | 'telegram' | 'slack' | 'twilio' | 'webchat' | 'matrix' | 'signal' | 'email' | 'teams' | 'whatsapp';

export interface InboundMessage {
  id: string;
  channelType: ChannelType;
  channelId: string;         // Server/chat ID
  senderId: string;          // User ID
  senderName?: string;       // Display name
  content: string;
  timestamp: number;
  replyToId?: string;        // If replying to a message
  attachments?: Attachment[];
  raw?: unknown;             // Original platform message
}

export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
  size?: number;
}

export interface OutboundMessage {
  content: string;
  replyToId?: string;
  attachments?: Attachment[];
  formatting?: {
    markdown?: boolean;
    html?: boolean;
  };
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  readonly name: string;
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Messaging
  send(channelId: string, message: OutboundMessage): Promise<SendResult>;
  
  // Events
  onMessage(handler: (message: InboundMessage) => Promise<void>): void;
  onError(handler: (error: Error) => void): void;
}

export interface ChannelConfig {
  discord?: {
    token: string;
    mentionOnly?: boolean;
    allowedGuilds?: string[];
  };
  telegram?: {
    token: string;
    webhookUrl?: string;
    allowedChats?: string[];
  };
  slack?: {
    botToken: string;
    appToken: string;
    signingSecret?: string;
  };
  twilio?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;        // Your Twilio phone number
    webhookUrl?: string;        // For incoming messages
    whatsappNumber?: string;    // WhatsApp-enabled number
  };
}
