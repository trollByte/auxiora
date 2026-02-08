import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface TeamsAdapterConfig {
  microsoftAppId: string;
  microsoftAppPassword: string;
}

interface TeamsActivity {
  type: string;
  id: string;
  timestamp: string;
  channelId: string;
  from: {
    id: string;
    name?: string;
    aadObjectId?: string;
  };
  conversation: {
    id: string;
    conversationType?: string;
    tenantId?: string;
    isGroup?: boolean;
  };
  recipient?: {
    id: string;
    name?: string;
  };
  text?: string;
  serviceUrl: string;
  channelData?: Record<string, unknown>;
  replyToId?: string;
  attachments?: Array<{
    contentType: string;
    contentUrl?: string;
    name?: string;
    content?: unknown;
  }>;
}

interface TeamsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TeamsSendResponse {
  id: string;
}

const MAX_MESSAGE_LENGTH = 28000;
const TOKEN_URL = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';

export class TeamsAdapter implements ChannelAdapter {
  readonly type = 'teams' as const;
  readonly name = 'Microsoft Teams';

  private config: TeamsAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private accessToken?: string;
  private tokenExpiry = 0;

  constructor(config: TeamsAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // Verify credentials by obtaining a token
    await this.getAccessToken();
    this.connected = true;

    audit('channel.connected', {
      channelType: 'teams',
      appId: this.config.microsoftAppId,
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.accessToken = undefined;
    this.tokenExpiry = 0;
    audit('channel.disconnected', { channelType: 'teams' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.microsoftAppId,
      client_secret: this.config.microsoftAppPassword,
      scope: 'https://api.botframework.com/.default',
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to obtain Teams token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as TeamsTokenResponse;
    this.accessToken = data.access_token;
    // Expire 5 minutes early to avoid edge cases
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    return this.accessToken;
  }

  /**
   * Handle incoming webhook from Microsoft Bot Framework.
   * Call this from your HTTP server when receiving POST to /api/messages.
   */
  async handleWebhook(activity: TeamsActivity): Promise<void> {
    if (activity.type !== 'message') return;
    if (!activity.text) return;

    const inbound = this.toInboundMessage(activity);

    audit('message.received', {
      channelType: 'teams',
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

  private toInboundMessage(activity: TeamsActivity): InboundMessage {
    // Strip bot mention from content
    let content = activity.text || '';
    if (activity.recipient?.name) {
      content = content.replace(
        new RegExp(`<at>${activity.recipient.name}</at>`, 'gi'),
        '',
      ).trim();
    }

    return {
      id: activity.id,
      channelType: 'teams',
      channelId: activity.conversation.id,
      senderId: activity.from.id,
      senderName: activity.from.name,
      content,
      timestamp: new Date(activity.timestamp).getTime(),
      replyToId: activity.replyToId,
      attachments: activity.attachments?.map((a) => ({
        type: a.contentType.startsWith('image/')
          ? 'image' as const
          : 'file' as const,
        url: a.contentUrl,
        mimeType: a.contentType,
        filename: a.name,
      })),
      raw: activity,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const token = await this.getAccessToken();
      const chunks = this.chunkMessage(message.content);
      let lastMessageId: string | undefined;

      // We need the serviceUrl from the incoming activity
      // For now, use the default Bot Framework service URL
      const serviceUrl = 'https://smba.trafficmanager.net/teams/';

      for (const chunk of chunks) {
        const activity = {
          type: 'message',
          text: chunk,
          ...(message.replyToId ? { replyToId: message.replyToId } : {}),
        };

        const url = `${serviceUrl}v3/conversations/${encodeURIComponent(channelId)}/activities`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(activity),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`Teams API error ${response.status}: ${errorText}`);
        }

        const result = await response.json() as TeamsSendResponse;
        lastMessageId = result.id;
      }

      audit('message.sent', {
        channelType: 'teams',
        channelId,
        messageId: lastMessageId,
      });

      return { success: true, messageId: lastMessageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'teams',
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
