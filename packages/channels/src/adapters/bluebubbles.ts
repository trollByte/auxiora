import { audit } from '@auxiora/audit';
import { chunkMarkdown } from '../chunk.js';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface BlueBubblesAdapterConfig {
  serverUrl: string;
  password: string;
  allowedAddresses?: string[];
}

interface BlueBubblesMessage {
  guid: string;
  text: string;
  handle?: {
    address: string;
    service: string;
    uncanonicalizedId?: string;
  };
  chats?: Array<{
    guid: string;
    chatIdentifier: string;
    displayName?: string;
    participants?: Array<{
      address: string;
    }>;
  }>;
  dateCreated: number;
  isFromMe: boolean;
  threadOriginatorGuid?: string;
  attachments?: Array<{
    guid: string;
    mimeType: string;
    transferName: string;
    totalBytes: number;
  }>;
}

interface BlueBubblesWebhookEvent {
  type: string;
  data: BlueBubblesMessage;
}

interface BlueBubblesSendResponse {
  status: number;
  message: string;
  data?: BlueBubblesMessage;
}

const MAX_MESSAGE_LENGTH = 20000;

export class BlueBubblesAdapter implements ChannelAdapter {
  readonly type = 'bluebubbles' as const;
  readonly name = 'BlueBubbles (iMessage)';

  private config: BlueBubblesAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;

  constructor(config: BlueBubblesAdapterConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.serverUrl.replace(/\/+$/, '');
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set('password', this.config.password);

    const response = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `BlueBubbles API error ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  async connect(): Promise<void> {
    // Verify connection by fetching server info
    await this.apiRequest<{ status: number; message: string }>('GET', '/api/v1/server/info');
    this.connected = true;

    audit('channel.connected', {
      channelType: 'bluebubbles',
      serverUrl: this.baseUrl,
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    audit('channel.disconnected', { channelType: 'bluebubbles' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Handle incoming webhook from BlueBubbles server.
   * Configure your BlueBubbles server to send webhooks to your endpoint.
   */
  async handleWebhook(event: BlueBubblesWebhookEvent): Promise<void> {
    if (event.type !== 'new-message') return;

    const msg = event.data;

    // Ignore own messages
    if (msg.isFromMe) return;

    // Must have text content
    if (!msg.text) return;

    // Check allowed addresses
    const senderAddress = msg.handle?.address;
    if (
      senderAddress &&
      this.config.allowedAddresses?.length &&
      !this.config.allowedAddresses.includes(senderAddress)
    ) {
      audit('message.filtered', {
        channelType: 'bluebubbles',
        senderId: senderAddress,
        reason: 'address_not_allowed',
      });
      return;
    }

    const inbound = this.toInboundMessage(msg);

    audit('message.received', {
      channelType: 'bluebubbles',
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

  private toInboundMessage(msg: BlueBubblesMessage): InboundMessage {
    const chatGuid = msg.chats?.[0]?.guid || msg.handle?.address || 'unknown';

    return {
      id: msg.guid,
      channelType: 'bluebubbles',
      channelId: chatGuid,
      senderId: msg.handle?.address || 'unknown',
      senderName: msg.handle?.uncanonicalizedId || msg.handle?.address,
      content: msg.text,
      timestamp: msg.dateCreated,
      replyToId: msg.threadOriginatorGuid,
      attachments: msg.attachments?.map((a) => ({
        type: a.mimeType.startsWith('image/')
          ? ('image' as const)
          : a.mimeType.startsWith('audio/')
            ? ('audio' as const)
            : a.mimeType.startsWith('video/')
              ? ('video' as const)
              : ('file' as const),
        mimeType: a.mimeType,
        filename: a.transferName,
        size: a.totalBytes,
      })),
      raw: msg,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chunks = chunkMarkdown(message.content, MAX_MESSAGE_LENGTH);
      let lastGuid: string | undefined;

      for (const chunk of chunks) {
        const body: Record<string, unknown> = {
          chatGuid: channelId,
          message: chunk,
          method: 'private-api',
        };

        if (message.replyToId) {
          body.selectedMessageGuid = message.replyToId;
        }

        const result = await this.apiRequest<BlueBubblesSendResponse>(
          'POST',
          '/api/v1/message/text',
          body,
        );

        if (result.status !== 200) {
          throw new Error(`BlueBubbles send error: ${result.message}`);
        }

        lastGuid = result.data?.guid;
      }

      audit('message.sent', {
        channelType: 'bluebubbles',
        channelId,
        messageId: lastGuid,
      });

      return { success: true, messageId: lastGuid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'bluebubbles',
        action: 'send',
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  async startTyping(channelId: string): Promise<() => void> {
    // BlueBubbles supports typing indicators via the private API
    this.apiRequest('POST', '/api/v1/chat/typing', {
      chatGuid: channelId,
      status: 'typing',
    }).catch((e: Error) => {
      audit('channel.error', {
        channelType: 'bluebubbles',
        action: 'typing',
        error: e.message,
      });
    });

    return () => {
      this.apiRequest('POST', '/api/v1/chat/typing', {
        chatGuid: channelId,
        status: 'idle',
      }).catch(() => {});
    };
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
