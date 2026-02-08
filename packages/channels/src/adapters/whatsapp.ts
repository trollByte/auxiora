import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface WhatsAppAdapterConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
}

interface WhatsAppWebhookBody {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppIncomingMessage>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  document?: {
    id: string;
    mime_type: string;
    filename?: string;
    sha256: string;
    caption?: string;
  };
  audio?: {
    id: string;
    mime_type: string;
  };
  video?: {
    id: string;
    mime_type: string;
  };
  context?: {
    from: string;
    id: string;
  };
}

interface WhatsAppSendResponse {
  messaging_product: string;
  contacts: Array<{ wa_id: string }>;
  messages: Array<{ id: string }>;
}

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const MAX_MESSAGE_LENGTH = 4096;

export class WhatsAppAdapter implements ChannelAdapter {
  readonly type = 'whatsapp' as const;
  readonly name = 'WhatsApp';

  private config: WhatsAppAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;

  constructor(config: WhatsAppAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // Verify credentials by checking the phone number ID
    const response = await fetch(
      `${GRAPH_API_BASE}/${this.config.phoneNumberId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to verify WhatsApp credentials: ${response.status} ${response.statusText}`);
    }

    this.connected = true;

    audit('channel.connected', {
      channelType: 'whatsapp',
      phoneNumberId: this.config.phoneNumberId,
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    audit('channel.disconnected', { channelType: 'whatsapp' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Verify webhook subscription from Meta.
   * Returns the challenge string if the verify token matches.
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.config.verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Handle incoming webhook from WhatsApp Business API.
   * Call this from your HTTP server when receiving POST to your webhook URL.
   */
  async handleWebhook(body: WhatsAppWebhookBody): Promise<void> {
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const messages = change.value.messages;
        if (!messages) continue;

        const contacts = change.value.contacts;

        for (const msg of messages) {
          const contact = contacts?.find((c) => c.wa_id === msg.from);
          await this.handleMessage(msg, contact);
        }
      }
    }
  }

  private async handleMessage(
    msg: WhatsAppIncomingMessage,
    contact?: { profile: { name: string }; wa_id: string },
  ): Promise<void> {
    // Only process text messages for now
    if (msg.type !== 'text' && msg.type !== 'image' && msg.type !== 'document') return;

    const inbound = this.toInboundMessage(msg, contact);

    audit('message.received', {
      channelType: 'whatsapp',
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
  }

  private toInboundMessage(
    msg: WhatsAppIncomingMessage,
    contact?: { profile: { name: string }; wa_id: string },
  ): InboundMessage {
    let content = '';
    const attachments: InboundMessage['attachments'] = [];

    switch (msg.type) {
      case 'text':
        content = msg.text?.body || '';
        break;
      case 'image':
        content = msg.image?.caption || '';
        attachments.push({
          type: 'image',
          mimeType: msg.image?.mime_type,
        });
        break;
      case 'document':
        content = msg.document?.caption || '';
        attachments.push({
          type: 'file',
          mimeType: msg.document?.mime_type,
          filename: msg.document?.filename,
        });
        break;
      case 'audio':
        attachments.push({
          type: 'audio',
          mimeType: msg.audio?.mime_type,
        });
        break;
      case 'video':
        attachments.push({
          type: 'video',
          mimeType: msg.video?.mime_type,
        });
        break;
    }

    return {
      id: msg.id,
      channelType: 'whatsapp',
      channelId: msg.from,
      senderId: msg.from,
      senderName: contact?.profile.name,
      content,
      timestamp: parseInt(msg.timestamp, 10) * 1000,
      replyToId: msg.context?.id,
      attachments: attachments.length > 0 ? attachments : undefined,
      raw: msg,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chunks = this.chunkMessage(message.content);
      let lastMessageId: string | undefined;

      for (const chunk of chunks) {
        const body: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: channelId,
          type: 'text',
          text: { body: chunk },
        };

        if (message.replyToId) {
          body.context = { message_id: message.replyToId };
        }

        const response = await fetch(
          `${GRAPH_API_BASE}/${this.config.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.config.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
        }

        const result = await response.json() as WhatsAppSendResponse;
        lastMessageId = result.messages?.[0]?.id;
      }

      audit('message.sent', {
        channelType: 'whatsapp',
        channelId,
        messageId: lastMessageId,
      });

      return { success: true, messageId: lastMessageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'whatsapp',
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
