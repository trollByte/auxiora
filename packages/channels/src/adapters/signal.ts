import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface SignalAdapterConfig {
  signalCliEndpoint: string;
  phoneNumber: string;
}

interface SignalJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface SignalMessage {
  envelope: {
    source: string;
    sourceName?: string;
    sourceNumber?: string;
    timestamp: number;
    dataMessage?: {
      message: string;
      timestamp: number;
      groupInfo?: {
        groupId: string;
        type?: string;
      };
      attachments?: Array<{
        contentType: string;
        filename?: string;
        size?: number;
        id?: string;
      }>;
      quote?: {
        id: number;
        author: string;
        text: string;
      };
    };
  };
}

interface SignalSendResult {
  timestamp: number;
  results?: Array<{
    recipientAddress: { number: string };
    type: string;
  }>;
}

const MAX_MESSAGE_LENGTH = 6000;

export class SignalAdapter implements ChannelAdapter {
  readonly type = 'signal' as const;
  readonly name = 'Signal';

  private config: SignalAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private pollRunning = false;
  private pollAbort?: AbortController;
  private rpcId = 0;

  constructor(config: SignalAdapterConfig) {
    this.config = config;
  }

  private get endpoint(): string {
    return this.config.signalCliEndpoint.replace(/\/+$/, '');
  }

  private async rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.rpcId++;
    const body = {
      jsonrpc: '2.0',
      id: this.rpcId,
      method,
      params: { ...params, account: this.config.phoneNumber },
    };

    const response = await fetch(`${this.endpoint}/api/v1/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Signal CLI API error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as SignalJsonRpcResponse<T>;

    if (result.error) {
      throw new Error(`Signal CLI RPC error: ${result.error.message}`);
    }

    return result.result as T;
  }

  async connect(): Promise<void> {
    // Verify connection by listing accounts
    await this.rpcCall('listAccounts');
    this.connected = true;

    audit('channel.connected', {
      channelType: 'signal',
      phoneNumber: this.config.phoneNumber,
    });

    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.pollRunning = false;
    this.pollAbort?.abort();
    this.connected = false;
    audit('channel.disconnected', { channelType: 'signal' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private startPolling(): void {
    this.pollRunning = true;
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (this.pollRunning && this.connected) {
      try {
        this.pollAbort = new AbortController();

        const messages = await this.rpcCall<SignalMessage[]>('receive');

        if (messages && Array.isArray(messages)) {
          for (const msg of messages) {
            await this.handleMessage(msg);
          }
        }

        // Brief delay between polls
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          break;
        }
        this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleMessage(msg: SignalMessage): Promise<void> {
    const dataMessage = msg.envelope.dataMessage;
    if (!dataMessage || !dataMessage.message) return;

    // Ignore own messages
    if (msg.envelope.source === this.config.phoneNumber ||
        msg.envelope.sourceNumber === this.config.phoneNumber) {
      return;
    }

    const inbound = this.toInboundMessage(msg);

    audit('message.received', {
      channelType: 'signal',
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

  private toInboundMessage(msg: SignalMessage): InboundMessage {
    const dataMessage = msg.envelope.dataMessage!;
    const isGroup = !!dataMessage.groupInfo;
    const channelId = isGroup
      ? dataMessage.groupInfo!.groupId
      : msg.envelope.sourceNumber || msg.envelope.source;

    return {
      id: String(dataMessage.timestamp),
      channelType: 'signal',
      channelId,
      senderId: msg.envelope.sourceNumber || msg.envelope.source,
      senderName: msg.envelope.sourceName,
      content: dataMessage.message,
      timestamp: dataMessage.timestamp,
      replyToId: dataMessage.quote ? String(dataMessage.quote.id) : undefined,
      attachments: dataMessage.attachments?.map((a) => ({
        type: a.contentType.startsWith('image/')
          ? 'image' as const
          : a.contentType.startsWith('audio/')
            ? 'audio' as const
            : a.contentType.startsWith('video/')
              ? 'video' as const
              : 'file' as const,
        mimeType: a.contentType,
        filename: a.filename,
        size: a.size,
      })),
      raw: msg,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chunks = this.chunkMessage(message.content);
      let lastTimestamp: number | undefined;

      for (const chunk of chunks) {
        // Determine if group or direct
        const isGroup = !channelId.startsWith('+');

        const params: Record<string, unknown> = {
          message: chunk,
        };

        if (isGroup) {
          params.groupId = channelId;
        } else {
          params.recipient = [channelId];
        }

        if (message.replyToId) {
          params.quoteTimestamp = parseInt(message.replyToId, 10);
          params.quoteAuthor = channelId;
        }

        const result = await this.rpcCall<SignalSendResult>('send', params);
        lastTimestamp = result.timestamp;
      }

      audit('message.sent', {
        channelType: 'signal',
        channelId,
        messageId: lastTimestamp,
      });

      return { success: true, messageId: String(lastTimestamp) };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'signal',
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
