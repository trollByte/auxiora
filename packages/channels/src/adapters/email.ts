import { audit } from '@auxiora/audit';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types.js';

export interface EmailAdapterConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  email: string;
  password: string;
  pollInterval?: number;
  allowedSenders?: string[];
  tls?: boolean;
}

interface ImapMessage {
  uid: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    content?: Buffer;
  }>;
}

const DEFAULT_POLL_INTERVAL = 30000; // 30 seconds

export class EmailAdapter implements ChannelAdapter {
  readonly type = 'email' as const;
  readonly name = 'Email';

  private config: EmailAdapterConfig;
  private messageHandler?: (message: InboundMessage) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private seenUids: Set<string> = new Set();
  private imapConnection?: ImapConnectionLike;
  private smtpConnection?: SmtpConnectionLike;

  constructor(config: EmailAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.imapHost || !this.config.smtpHost || !this.config.email || !this.config.password) {
      audit('channel.skipped', { channelType: 'email', reason: 'missing IMAP/SMTP credentials' });
      return;
    }
    try {
      // Connect IMAP
      this.imapConnection = await this.connectImap();

      // Connect SMTP
      this.smtpConnection = await this.connectSmtp();

      this.connected = true;

      audit('channel.connected', {
        channelType: 'email',
        email: this.config.email,
      });

      // Start polling for new messages
      this.startPolling();
    } catch (error) {
      throw new Error(`Failed to connect email: ${error instanceof Error ? error.message : error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    try {
      await this.imapConnection?.close();
    } catch {
      // Ignore close errors
    }

    try {
      await this.smtpConnection?.close();
    } catch {
      // Ignore close errors
    }

    this.imapConnection = undefined;
    this.smtpConnection = undefined;
    this.connected = false;
    audit('channel.disconnected', { channelType: 'email' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async connectImap(): Promise<ImapConnectionLike> {
    // Use native TCP connection via Node.js net/tls modules
    const net = await import('node:net');
    const tls = await import('node:tls');

    const useTls = this.config.tls !== false;
    const socket = useTls
      ? tls.connect({
          host: this.config.imapHost,
          port: this.config.imapPort,
          rejectUnauthorized: true,
        })
      : net.connect({
          host: this.config.imapHost,
          port: this.config.imapPort,
        });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('IMAP connection timeout'));
      }, 10000);

      socket.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      const onReady = () => {
        clearTimeout(timeout);
        resolve({
          socket,
          close: async () => { socket.destroy(); },
          sendCommand: async (cmd: string) => {
            return new Promise<string>((res, rej) => {
              let data = '';
              const onData = (chunk: Buffer) => {
                data += chunk.toString();
                if (data.includes('\r\n')) {
                  socket.removeListener('data', onData);
                  res(data);
                }
              };
              socket.on('data', onData);
              socket.write(`${cmd}\r\n`, (err?: Error | null) => {
                if (err) rej(err);
              });
            });
          },
        });
      };

      if (useTls) {
        (socket as import('node:tls').TLSSocket).once('secureConnect', onReady);
      } else {
        socket.once('connect', onReady);
      }
    });
  }

  private async connectSmtp(): Promise<SmtpConnectionLike> {
    const net = await import('node:net');
    const tls = await import('node:tls');

    const useTls = this.config.tls !== false;
    const socket = useTls
      ? tls.connect({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          rejectUnauthorized: true,
        })
      : net.connect({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
        });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('SMTP connection timeout'));
      }, 10000);

      socket.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      const onReady = () => {
        clearTimeout(timeout);
        resolve({
          socket,
          close: async () => { socket.destroy(); },
          sendCommand: async (cmd: string) => {
            return new Promise<string>((res, rej) => {
              let data = '';
              const onData = (chunk: Buffer) => {
                data += chunk.toString();
                if (data.includes('\r\n')) {
                  socket.removeListener('data', onData);
                  res(data);
                }
              };
              socket.on('data', onData);
              socket.write(`${cmd}\r\n`, (err?: Error | null) => {
                if (err) rej(err);
              });
            });
          },
        });
      };

      if (useTls) {
        (socket as import('node:tls').TLSSocket).once('secureConnect', onReady);
      } else {
        socket.once('connect', onReady);
      }
    });
  }

  private startPolling(): void {
    const interval = this.config.pollInterval || DEFAULT_POLL_INTERVAL;
    this.pollTimer = setInterval(() => {
      void this.pollInbox();
    }, interval);

    // Initial poll
    void this.pollInbox();
  }

  private async pollInbox(): Promise<void> {
    if (!this.connected || !this.imapConnection) return;

    try {
      // Fetch messages using IMAP commands
      const messages = await this.fetchNewMessages();

      for (const msg of messages) {
        if (this.seenUids.has(msg.uid)) continue;
        this.seenUids.add(msg.uid);

        // Check allowed senders whitelist
        if (
          this.config.allowedSenders?.length &&
          !this.config.allowedSenders.some((s) =>
            msg.from.toLowerCase().includes(s.toLowerCase())
          )
        ) {
          continue;
        }

        const inbound = this.toInboundMessage(msg);

        audit('message.received', {
          channelType: 'email',
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
    } catch (error) {
      this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async fetchNewMessages(): Promise<ImapMessage[]> {
    // Simplified IMAP fetch - in production you'd use a full IMAP client
    // This sends raw IMAP commands over the socket connection
    try {
      await this.imapConnection!.sendCommand(`A001 LOGIN "${this.config.email}" "${this.config.password}"`);
      await this.imapConnection!.sendCommand('A002 SELECT INBOX');
      const searchResult = await this.imapConnection!.sendCommand('A003 SEARCH UNSEEN');

      // Parse UIDs from search result
      const match = searchResult.match(/\* SEARCH (.+)/);
      if (!match) return [];

      const uids = match[1].trim().split(/\s+/).filter(Boolean);
      const messages: ImapMessage[] = [];

      for (const uid of uids) {
        try {
          const fetchResult = await this.imapConnection!.sendCommand(
            `A004 FETCH ${uid} (BODY[HEADER] BODY[TEXT])`
          );

          const msg = this.parseImapMessage(uid, fetchResult);
          if (msg) messages.push(msg);
        } catch {
          // Skip individual message errors
        }
      }

      return messages;
    } catch {
      return [];
    }
  }

  private parseImapMessage(uid: string, raw: string): ImapMessage | null {
    // Parse headers and body from IMAP FETCH response
    const fromMatch = raw.match(/From:\s*(.+)/i);
    const toMatch = raw.match(/To:\s*(.+)/i);
    const subjectMatch = raw.match(/Subject:\s*(.+)/i);
    const dateMatch = raw.match(/Date:\s*(.+)/i);
    const messageIdMatch = raw.match(/Message-ID:\s*<(.+?)>/i);
    const inReplyToMatch = raw.match(/In-Reply-To:\s*<(.+?)>/i);
    const referencesMatch = raw.match(/References:\s*(.+)/i);

    if (!fromMatch) return null;

    // Extract the body (text after headers)
    const headerBodySplit = raw.indexOf('\r\n\r\n');
    const body = headerBodySplit > -1 ? raw.slice(headerBodySplit + 4).trim() : '';

    // Parse from name and address
    const fromFull = fromMatch[1].trim();
    const fromNameMatch = fromFull.match(/^"?(.+?)"?\s*<(.+?)>$/);
    const from = fromNameMatch ? fromNameMatch[2] : fromFull;
    const fromName = fromNameMatch ? fromNameMatch[1] : undefined;

    // Parse references
    const references = referencesMatch
      ? referencesMatch[1].match(/<(.+?)>/g)?.map((r) => r.slice(1, -1))
      : undefined;

    return {
      uid,
      from,
      fromName,
      to: toMatch?.[1].trim() || '',
      subject: subjectMatch?.[1].trim() || '(no subject)',
      body,
      date: dateMatch ? new Date(dateMatch[1].trim()) : new Date(),
      messageId: messageIdMatch?.[1] || `${uid}@unknown`,
      inReplyTo: inReplyToMatch?.[1],
      references,
    };
  }

  private toInboundMessage(msg: ImapMessage): InboundMessage {
    // Use the email thread (via In-Reply-To/References) as the channel
    const threadId = msg.references?.[0] || msg.inReplyTo || msg.messageId;

    return {
      id: msg.messageId,
      channelType: 'email',
      channelId: threadId,
      senderId: msg.from,
      senderName: msg.fromName,
      content: `Subject: ${msg.subject}\n\n${msg.body}`,
      timestamp: msg.date.getTime(),
      replyToId: msg.inReplyTo,
      attachments: msg.attachments?.map((a) => ({
        type: a.contentType.startsWith('image/')
          ? 'image' as const
          : 'file' as const,
        mimeType: a.contentType,
        filename: a.filename,
        size: a.size,
        data: a.content,
      })),
      raw: msg,
    };
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      if (!this.smtpConnection) {
        return { success: false, error: 'SMTP not connected' };
      }

      // Parse the recipient from the channelId (thread message-id) or replyToId
      // In email adapter, channelId is the thread message-id
      // The actual recipient is derived from the original sender
      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@auxiora>`;

      // Build email
      const headers = [
        `From: ${this.config.email}`,
        `To: ${channelId}`,
        `Subject: Re: Auxiora`,
        `Message-ID: ${messageId}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
      ];

      if (message.replyToId) {
        headers.push(`In-Reply-To: <${message.replyToId}>`);
        headers.push(`References: <${message.replyToId}>`);
      }

      const emailContent = headers.join('\r\n') + '\r\n\r\n' + message.content;

      // Send via SMTP
      await this.smtpConnection.sendCommand(`EHLO auxiora`);
      await this.smtpConnection.sendCommand(
        `AUTH PLAIN ${Buffer.from(`\0${this.config.email}\0${this.config.password}`).toString('base64')}`
      );
      await this.smtpConnection.sendCommand(`MAIL FROM:<${this.config.email}>`);
      await this.smtpConnection.sendCommand(`RCPT TO:<${channelId}>`);
      await this.smtpConnection.sendCommand('DATA');
      await this.smtpConnection.sendCommand(`${emailContent}\r\n.`);

      audit('message.sent', {
        channelType: 'email',
        channelId,
        messageId,
      });

      return { success: true, messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      audit('channel.error', {
        channelType: 'email',
        action: 'send',
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
}

interface ImapConnectionLike {
  socket: unknown;
  close: () => Promise<void>;
  sendCommand: (cmd: string) => Promise<string>;
}

interface SmtpConnectionLike {
  socket: unknown;
  close: () => Promise<void>;
  sendCommand: (cmd: string) => Promise<string>;
}
