import { createHmac } from 'node:crypto';
import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface ZaloAdapterConfig {
  oaAccessToken: string;
  oaSecretKey: string;
  allowedUserIds?: string[];
}

interface ZaloWebhookEvent {
  app_id: string;
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  event_name: string;
  message?: {
    msg_id: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: {
        url?: string;
        thumbnail?: string;
        id?: string;
        size?: number;
        name?: string;
        type?: string;
      };
    }>;
    quote_msg_id?: string;
  };
  timestamp: string;
}

interface ZaloSendResponse {
  error: number;
  message: string;
  data?: {
    message_id: string;
  };
}

interface ZaloUserProfileResponse {
  error: number;
  message: string;
  data?: {
    display_name: string;
    user_id: string;
    avatar?: string;
  };
}

const ZALO_OA_API_BASE = 'https://openapi.zalo.me/v3.0/oa';
const MAX_MESSAGE_LENGTH = 2000;

export class ZaloAdapter implements ChannelAdapter {
  readonly type = 'zalo' as const;
  readonly name = 'Zalo';

  private config: ZaloAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private userNameCache: Map<string, string> = new Map();

  constructor(config: ZaloAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // Verify credentials by fetching OA info
    const response = await fetch(`${ZALO_OA_API_BASE}/getoa`, {
      headers: {
        access_token: this.config.oaAccessToken,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to verify Zalo credentials: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { error: number; message: string };
    if (result.error !== 0) {
      throw new Error(`Zalo API error: ${result.message}`);
    }

    this.connected = true;

    audit('channel.connected', { channelType: 'zalo' });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.userNameCache.clear();
    audit('channel.disconnected', { channelType: 'zalo' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Verify the webhook signature from Zalo.
   * Returns true if the signature is valid.
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    const hmac = createHmac('sha256', this.config.oaSecretKey);
    hmac.update(body);
    const expected = hmac.digest('hex');
    return expected === signature;
  }

  /**
   * Handle incoming webhook from Zalo OA.
   * Call this from your HTTP server when receiving POST to your webhook URL.
   */
  async handleWebhook(event: ZaloWebhookEvent): Promise<void> {
    if (event.event_name !== 'user_send_text' && event.event_name !== 'user_send_image') {
      return;
    }

    if (!event.message) return;

    // Check allowed users
    const senderId = event.sender.id;
    if (
      this.config.allowedUserIds?.length &&
      !this.config.allowedUserIds.includes(senderId)
    ) {
      audit('message.filtered', {
        channelType: 'zalo',
        senderId,
        reason: 'user_not_allowed',
      });
      return;
    }

    const senderName = await this.getUserName(senderId);
    const inbound = this.toInboundMessage(event, senderName);

    audit('message.received', {
      channelType: 'zalo',
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

  private async getUserName(userId: string): Promise<string | undefined> {
    const cached = this.userNameCache.get(userId);
    if (cached) return cached;

    try {
      const response = await fetch(
        `${ZALO_OA_API_BASE}/getprofile?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`,
        {
          headers: {
            access_token: this.config.oaAccessToken,
          },
        },
      );

      if (response.ok) {
        const result = (await response.json()) as ZaloUserProfileResponse;
        if (result.data?.display_name) {
          this.userNameCache.set(userId, result.data.display_name);
          return result.data.display_name;
        }
      }
    } catch {
      // Silently fail - name is optional
    }

    return undefined;
  }

  private toInboundMessage(
    event: ZaloWebhookEvent,
    senderName?: string,
  ): InboundMessage {
    const message = event.message!;
    const content = message.text || '';

    return {
      id: message.msg_id,
      channelType: 'zalo',
      channelId: event.sender.id,
      senderId: event.sender.id,
      senderName,
      content,
      timestamp: parseInt(event.timestamp, 10),
      replyToId: message.quote_msg_id,
      attachments: message.attachments?.map((a) => ({
        type: a.type === 'image'
          ? ('image' as const)
          : a.type === 'audio'
            ? ('audio' as const)
            : a.type === 'video'
              ? ('video' as const)
              : ('file' as const),
        url: a.payload.url || a.payload.thumbnail,
        mimeType: a.payload.type,
        filename: a.payload.name,
        size: a.payload.size,
      })),
      raw: event,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chunks = this.chunkMessage(message.content);
      let lastMessageId: string | undefined;

      for (const chunk of chunks) {
        const body: Record<string, unknown> = {
          recipient: { user_id: channelId },
          message: { text: chunk },
        };

        if (message.replyToId) {
          body.quote_message_id = message.replyToId;
        }

        const response = await fetch(`${ZALO_OA_API_BASE}/message/cs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: this.config.oaAccessToken,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`Zalo API error ${response.status}: ${errorText}`);
        }

        const result = (await response.json()) as ZaloSendResponse;
        if (result.error !== 0) {
          throw new Error(`Zalo send error: ${result.message}`);
        }

        lastMessageId = result.data?.message_id;
      }

      audit('message.sent', {
        channelType: 'zalo',
        channelId,
        messageId: lastMessageId,
      });

      return { success: true, messageId: lastMessageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'zalo',
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
