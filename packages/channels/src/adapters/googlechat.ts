import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface GoogleChatAdapterConfig {
  serviceAccountKey: string;
  allowedSpaces?: string[];
}

interface GoogleChatEvent {
  type: string;
  eventTime: string;
  message?: {
    name: string;
    sender: {
      name: string;
      displayName: string;
      type: string;
    };
    createTime: string;
    text: string;
    thread?: {
      name: string;
    };
    space: {
      name: string;
      type: string;
      displayName?: string;
    };
    argumentText?: string;
    attachment?: Array<{
      name: string;
      contentName: string;
      contentType: string;
      downloadUri?: string;
      thumbnailUri?: string;
      source: string;
    }>;
  };
  space?: {
    name: string;
    type: string;
    displayName?: string;
  };
  user?: {
    name: string;
    displayName: string;
    type: string;
  };
  configCompleteRedirectUrl?: string;
}

interface GoogleChatMessageResponse {
  name: string;
  sender: {
    name: string;
    displayName: string;
  };
  createTime: string;
  text: string;
  thread: {
    name: string;
  };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

const CHAT_API_BASE = 'https://chat.googleapis.com/v1';
const MAX_MESSAGE_LENGTH = 4096;

export class GoogleChatAdapter implements ChannelAdapter {
  readonly type = 'googlechat' as const;
  readonly name = 'Google Chat';

  private config: GoogleChatAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private accessToken?: string;
  private tokenExpiry = 0;
  private serviceAccount: ServiceAccountKey;

  constructor(config: GoogleChatAdapterConfig) {
    this.config = config;
    try {
      this.serviceAccount = JSON.parse(config.serviceAccountKey) as ServiceAccountKey;
    } catch {
      throw new Error('Invalid Google Chat service account key: must be valid JSON');
    }
  }

  async connect(): Promise<void> {
    // Verify credentials by obtaining a token
    await this.getAccessToken();
    this.connected = true;

    audit('channel.connected', {
      channelType: 'googlechat',
      serviceAccount: this.serviceAccount.client_email,
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.accessToken = undefined;
    this.tokenExpiry = 0;
    audit('channel.disconnected', { channelType: 'googlechat' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({
        iss: this.serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/chat.bot',
        aud: this.serviceAccount.token_uri,
        iat: now,
        exp: now + 3600,
      }),
    );

    // Sign the JWT using the Web Crypto API
    const signingInput = `${header}.${payload}`;
    const key = await this.importPrivateKey(this.serviceAccount.private_key);
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput),
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const jwt = `${header}.${payload}.${sig}`;

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });

    const response = await fetch(this.serviceAccount.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to obtain Google Chat token: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as GoogleTokenResponse;
    this.accessToken = data.access_token;
    // Expire 5 minutes early
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    return this.accessToken;
  }

  private async importPrivateKey(pem: string): Promise<CryptoKey> {
    const pemBody = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    return crypto.subtle.importKey(
      'pkcs8',
      binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }

  /**
   * Handle incoming event from Google Chat.
   * Call this from your HTTP server when receiving POST to the bot endpoint.
   */
  async handleWebhook(event: GoogleChatEvent): Promise<void> {
    if (event.type !== 'MESSAGE') return;
    if (!event.message) return;

    // Check allowed spaces
    const spaceName = event.message.space.name;
    if (
      this.config.allowedSpaces?.length &&
      !this.config.allowedSpaces.includes(spaceName)
    ) {
      audit('message.filtered', {
        channelType: 'googlechat',
        senderId: event.message.sender.name,
        channelId: spaceName,
        reason: 'space_not_allowed',
      });
      return;
    }

    const inbound = this.toInboundMessage(event);

    audit('message.received', {
      channelType: 'googlechat',
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

  private toInboundMessage(event: GoogleChatEvent): InboundMessage {
    const message = event.message!;
    // Use argumentText if available (strips @mention), fall back to text
    const content = message.argumentText?.trim() || message.text || '';

    return {
      id: message.name,
      channelType: 'googlechat',
      channelId: message.space.name,
      senderId: message.sender.name,
      senderName: message.sender.displayName,
      content,
      timestamp: new Date(message.createTime).getTime(),
      replyToId: message.thread?.name,
      attachments: message.attachment?.map((a) => ({
        type: a.contentType.startsWith('image/')
          ? ('image' as const)
          : a.contentType.startsWith('audio/')
            ? ('audio' as const)
            : a.contentType.startsWith('video/')
              ? ('video' as const)
              : ('file' as const),
        url: a.downloadUri,
        mimeType: a.contentType,
        filename: a.contentName,
      })),
      raw: event,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const token = await this.getAccessToken();
      const chunks = this.chunkMessage(message.content);
      let lastMessageName: string | undefined;

      for (const chunk of chunks) {
        const body: Record<string, unknown> = {
          text: chunk,
        };

        if (message.replyToId) {
          body.thread = { name: message.replyToId };
        }

        const url = `${CHAT_API_BASE}/${channelId}/messages`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`Google Chat API error ${response.status}: ${errorText}`);
        }

        const result = (await response.json()) as GoogleChatMessageResponse;
        lastMessageName = result.name;
      }

      audit('message.sent', {
        channelType: 'googlechat',
        channelId,
        messageId: lastMessageName,
      });

      return { success: true, messageId: lastMessageName };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'googlechat',
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

  async startTyping(_channelId: string): Promise<() => void> {
    // Google Chat does not support typing indicators via the API
    return () => {};
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
