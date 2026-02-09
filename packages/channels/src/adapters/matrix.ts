import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface MatrixAdapterConfig {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  autoJoinRooms?: boolean;
  allowedUsers?: string[];
  allowedRooms?: string[];
}

interface MatrixSyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, MatrixJoinedRoom>;
    invite?: Record<string, MatrixInvitedRoom>;
  };
}

interface MatrixJoinedRoom {
  timeline?: {
    events?: MatrixEvent[];
  };
}

interface MatrixInvitedRoom {
  invite_state?: {
    events?: MatrixEvent[];
  };
}

interface MatrixEvent {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts: number;
  content: {
    msgtype?: string;
    body?: string;
    'm.relates_to'?: {
      'm.in_reply_to'?: {
        event_id: string;
      };
    };
    url?: string;
    info?: {
      mimetype?: string;
      size?: number;
    };
    filename?: string;
    membership?: string;
  };
}

interface MatrixSendResponse {
  event_id: string;
}

const MAX_MESSAGE_LENGTH = 65536;

export class MatrixAdapter implements ChannelAdapter {
  readonly type = 'matrix' as const;
  readonly name = 'Matrix';

  private config: MatrixAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private syncToken?: string;
  private syncAbort?: AbortController;
  private syncLoopRunning = false;

  constructor(config: MatrixAdapterConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    const url = this.config.homeserverUrl.replace(/\/+$/, '');
    return `${url}/_matrix/client/v3`;
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async matrixFetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...(options.headers as Record<string, string> || {}) },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Matrix API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async connect(): Promise<void> {
    // Verify credentials by calling whoami
    await this.matrixFetch('/account/whoami');
    this.connected = true;

    audit('channel.connected', {
      channelType: 'matrix',
      userId: this.config.userId,
    });

    // Start sync loop
    this.startSyncLoop();
  }

  async disconnect(): Promise<void> {
    this.syncLoopRunning = false;
    this.syncAbort?.abort();
    this.connected = false;
    audit('channel.disconnected', { channelType: 'matrix' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private startSyncLoop(): void {
    this.syncLoopRunning = true;
    void this.syncLoop();
  }

  private async syncLoop(): Promise<void> {
    while (this.syncLoopRunning && this.connected) {
      try {
        this.syncAbort = new AbortController();
        const params = new URLSearchParams({
          timeout: '30000',
        });

        if (this.syncToken) {
          params.set('since', this.syncToken);
        }

        const response = await this.matrixFetch<MatrixSyncResponse>(
          `/sync?${params.toString()}`,
          { signal: this.syncAbort.signal },
        );

        // Handle invites (auto-join)
        if (this.config.autoJoinRooms && response.rooms?.invite) {
          for (const roomId of Object.keys(response.rooms.invite)) {
            try {
              await this.matrixFetch(`/rooms/${encodeURIComponent(roomId)}/join`, {
                method: 'POST',
                body: '{}',
              });
            } catch {
              // Ignore join failures
            }
          }
        }

        // Process messages from joined rooms
        if (response.rooms?.join) {
          for (const [roomId, room] of Object.entries(response.rooms.join)) {
            const events = room.timeline?.events || [];
            for (const event of events) {
              await this.handleEvent(roomId, event);
            }
          }
        }

        this.syncToken = response.next_batch;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          break;
        }
        this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
        // Brief delay before retrying on error
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleEvent(roomId: string, event: MatrixEvent): Promise<void> {
    // Only process m.room.message events
    if (event.type !== 'm.room.message') return;

    // Ignore own messages
    if (event.sender === this.config.userId) return;

    // Only process text and notice messages
    const msgtype = event.content.msgtype;
    if (msgtype !== 'm.text' && msgtype !== 'm.notice') return;

    // Check allowed rooms
    if (this.config.allowedRooms?.length && !this.config.allowedRooms.includes(roomId)) {
      audit('message.filtered', { channelType: 'matrix', senderId: event.sender, roomId, reason: 'room_not_allowed' });
      return;
    }

    // Check allowed users
    if (this.config.allowedUsers?.length && !this.config.allowedUsers.includes(event.sender)) {
      audit('message.filtered', { channelType: 'matrix', senderId: event.sender, roomId, reason: 'user_not_allowed' });
      return;
    }

    const inbound = this.toInboundMessage(roomId, event);

    audit('message.received', {
      channelType: 'matrix',
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

  private toInboundMessage(roomId: string, event: MatrixEvent): InboundMessage {
    const replyTo = event.content['m.relates_to']?.['m.in_reply_to']?.event_id;

    // Strip reply fallback from content if present
    let content = event.content.body || '';
    if (replyTo && content.startsWith('> ')) {
      const lines = content.split('\n');
      const nonQuoteIdx = lines.findIndex((l) => !l.startsWith('> ') && l !== '');
      if (nonQuoteIdx > 0) {
        content = lines.slice(nonQuoteIdx).join('\n').trim();
      }
    }

    return {
      id: event.event_id,
      channelType: 'matrix',
      channelId: roomId,
      senderId: event.sender,
      senderName: event.sender.split(':')[0].replace('@', ''),
      content,
      timestamp: event.origin_server_ts,
      replyToId: replyTo,
      raw: event,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chunks = this.chunkMessage(message.content);
      let lastEventId: string | undefined;

      for (const chunk of chunks) {
        const txnId = `m${Date.now()}.${Math.random().toString(36).slice(2)}`;
        const body: Record<string, unknown> = {
          msgtype: 'm.text',
          body: chunk,
        };

        // Add reply relation
        if (message.replyToId) {
          body['m.relates_to'] = {
            'm.in_reply_to': {
              event_id: message.replyToId,
            },
          };
        }

        const result = await this.matrixFetch<MatrixSendResponse>(
          `/rooms/${encodeURIComponent(channelId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
          { method: 'PUT', body: JSON.stringify(body) },
        );

        lastEventId = result.event_id;
      }

      audit('message.sent', {
        channelType: 'matrix',
        channelId,
        messageId: lastEventId,
      });

      return { success: true, messageId: lastEventId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'matrix',
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

  async startTyping(channelId: string): Promise<() => void> {
    const userId = this.config.userId;
    const path = `/rooms/${encodeURIComponent(channelId)}/typing/${encodeURIComponent(userId)}`;

    try {
      // Send typing with 30s timeout, repeat every 25s
      const sendTyping = () =>
        this.matrixFetch(path, {
          method: 'PUT',
          body: JSON.stringify({ typing: true, timeout: 30000 }),
        }).catch(() => {});

      await sendTyping();
      const interval = setInterval(sendTyping, 25000);

      return () => {
        clearInterval(interval);
        // Send stop-typing signal
        this.matrixFetch(path, {
          method: 'PUT',
          body: JSON.stringify({ typing: false }),
        }).catch(() => {});
      };
    } catch {
      return () => {};
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}
