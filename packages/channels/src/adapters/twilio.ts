import Twilio from 'twilio';
import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';
import { chunkMarkdown } from '../chunk.js';

export interface TwilioAdapterConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;          // Your Twilio phone number for SMS
  whatsappNumber?: string;      // WhatsApp-enabled number (format: whatsapp:+1234567890)
  webhookUrl?: string;          // For incoming messages
  allowedNumbers?: string[];
}

export interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

const MAX_SMS_LENGTH = 1600;     // SMS segment limit
const MAX_WHATSAPP_LENGTH = 4096;

export class TwilioAdapter implements ChannelAdapter {
  readonly type = 'twilio' as const;
  readonly name = 'Twilio';

  private client: Twilio.Twilio;
  private config: TwilioAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;

  constructor(config: TwilioAdapterConfig) {
    this.config = config;
    this.client = Twilio(config.accountSid, config.authToken);
  }

  async connect(): Promise<void> {
    // Verify credentials by fetching account info
    try {
      await this.client.api.accounts(this.config.accountSid).fetch();
      this.connected = true;
      audit('channel.connected', { channelType: 'twilio' });
    } catch (error) {
      throw new Error(`Failed to connect to Twilio: ${error instanceof Error ? error.message : error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    audit('channel.disconnected', { channelType: 'twilio' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Handle incoming webhook from Twilio
   * Call this from your HTTP server when receiving POST to your webhook URL
   */
  async handleWebhook(body: TwilioWebhookBody): Promise<string | null> {
    const isWhatsApp = body.From.startsWith('whatsapp:');

    // Check allowed numbers (strip whatsapp: prefix for matching)
    const senderNumber = isWhatsApp ? body.From.replace('whatsapp:', '') : body.From;
    if (this.config.allowedNumbers?.length && !this.config.allowedNumbers.includes(senderNumber)) {
      audit('message.filtered', { channelType: 'twilio', senderId: body.From, reason: 'number_not_allowed' });
      return null;
    }

    const inbound: InboundMessage = {
      id: body.MessageSid,
      channelType: 'twilio',
      channelId: isWhatsApp ? 'whatsapp' : 'sms',
      senderId: body.From,
      content: body.Body,
      timestamp: Date.now(),
      attachments: body.NumMedia && parseInt(body.NumMedia, 10) > 0
        ? [{
            type: body.MediaContentType0?.startsWith('image/') ? 'image' : 'file',
            url: body.MediaUrl0,
            mimeType: body.MediaContentType0,
          }]
        : undefined,
      raw: body,
    };

    audit('message.received', {
      channelType: 'twilio',
      senderId: inbound.senderId,
      channelId: inbound.channelId,
      isWhatsApp,
    });

    if (this.messageHandler) {
      try {
        await this.messageHandler(inbound);
      } catch (error) {
        this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Return null to indicate no TwiML response needed
    // Or return TwiML XML string if you want to respond immediately
    return null;
  }

  /**
   * Send message to a phone number
   * @param channelId Phone number in E.164 format (+1234567890) or whatsapp:+1234567890
   */
  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const isWhatsApp = channelId.startsWith('whatsapp:');
      const fromNumber = isWhatsApp
        ? this.config.whatsappNumber || `whatsapp:${this.config.phoneNumber}`
        : this.config.phoneNumber;

      if (!fromNumber) {
        return { success: false, error: 'No phone number configured for this channel type' };
      }

      const maxLength = isWhatsApp ? MAX_WHATSAPP_LENGTH : MAX_SMS_LENGTH;
      const chunks = chunkMarkdown(message.content, maxLength);
      let lastMessageSid: string | undefined;

      for (const chunk of chunks) {
        const sent = await this.client.messages.create({
          from: fromNumber,
          to: channelId,
          body: chunk,
        });
        lastMessageSid = sent.sid;
      }

      audit('message.sent', {
        channelType: 'twilio',
        channelId,
        messageId: lastMessageSid,
        isWhatsApp,
      });

      return { success: true, messageId: lastMessageSid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'twilio',
        action: 'send',
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send SMS to a phone number
   */
  async sendSMS(to: string, message: string): Promise<SendResult> {
    // Ensure proper format
    const phoneNumber = to.startsWith('+') ? to : `+${to}`;
    return this.send(phoneNumber, { content: message });
  }

  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(to: string, message: string): Promise<SendResult> {
    // Ensure proper format
    const phoneNumber = to.replace('whatsapp:', '');
    const whatsappTo = `whatsapp:${phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`}`;
    return this.send(whatsappTo, { content: message });
  }

  /**
   * Validate Twilio webhook signature
   */
  validateWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean {
    return Twilio.validateRequest(
      this.config.authToken,
      signature,
      url,
      params
    );
  }

  /**
   * Generate TwiML response for immediate reply
   */
  static generateTwiML(message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${this.escapeXml(message)}</Message>
</Response>`;
  }

  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
