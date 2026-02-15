import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { getSessionsDir } from '@auxiora/core';
import { audit } from '@auxiora/audit';
import { SessionDatabase } from './db.js';
import type { Session, SessionConfig, Message, MessageRole, SessionMetadata, Chat, ListChatsOptions } from './types.js';

function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: SessionConfig;
  private db: SessionDatabase;
  private sessionsDir: string;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: SessionConfig) {
    this.config = config;
    this.sessionsDir = getSessionsDir();
    const dbPath = config.dbPath ?? path.join(this.sessionsDir, 'sessions.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new SessionDatabase(dbPath);

    // Cleanup expired sessions every 5 minutes (non-webchat channels only)
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  async initialize(): Promise<void> {
    // Migration from JSON files happens in Task 4
  }

  async create(metadata: Partial<SessionMetadata> & { channelType: string }): Promise<Session> {
    const title = metadata.channelType === 'webchat' ? 'New Chat' : `${metadata.channelType} session`;
    const chat = this.db.createChat(title, metadata.channelType, metadata.senderId);

    const now = Date.now();
    const session: Session = {
      id: chat.id,
      messages: [],
      metadata: {
        channelType: metadata.channelType,
        senderId: metadata.senderId,
        clientId: metadata.clientId,
        createdAt: now,
        lastActiveAt: now,
      },
    };

    this.sessions.set(chat.id, session);
    await audit('session.created', { sessionId: chat.id, channelType: metadata.channelType });
    return session;
  }

  async get(id: string): Promise<Session | null> {
    // Check in-memory cache
    if (this.sessions.has(id)) {
      return this.sessions.get(id)!;
    }

    // Check DB
    const chat = this.db.getChat(id);
    if (!chat) return null;

    const messages = this.db.getMessages(id);
    const session: Session = {
      id: chat.id,
      messages,
      metadata: {
        channelType: chat.channel,
        senderId: (chat.metadata?.senderId as string | undefined),
        clientId: (chat.metadata?.clientId as string | undefined),
        createdAt: chat.createdAt,
        lastActiveAt: chat.updatedAt,
      },
    };

    this.sessions.set(id, session);
    return session;
  }

  async getOrCreate(
    key: string,
    metadata: Partial<SessionMetadata> & { channelType: string },
  ): Promise<Session> {
    // Check in-memory cache first
    for (const session of this.sessions.values()) {
      if (
        session.metadata.senderId === metadata.senderId &&
        session.metadata.channelType === metadata.channelType
      ) {
        session.metadata.lastActiveAt = Date.now();
        return session;
      }
    }

    // Check DB
    if (metadata.senderId) {
      const chat = this.db.getOrCreateSessionChat(metadata.senderId, metadata.channelType);
      const existing = this.sessions.get(chat.id);
      if (existing) {
        existing.metadata.lastActiveAt = Date.now();
        return existing;
      }

      const messages = this.db.getMessages(chat.id);
      const session: Session = {
        id: chat.id,
        messages,
        metadata: {
          channelType: metadata.channelType,
          senderId: metadata.senderId,
          clientId: metadata.clientId,
          createdAt: chat.createdAt,
          lastActiveAt: Date.now(),
        },
      };
      this.sessions.set(chat.id, session);
      return session;
    }

    // No senderId — create new
    return this.create(metadata);
  }

  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    tokens?: { input?: number; output?: number },
  ): Promise<Message> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const message: Message = {
      id: generateMessageId(),
      role,
      content,
      timestamp: Date.now(),
      tokens,
    };

    session.messages.push(message);
    session.metadata.lastActiveAt = Date.now();

    // Persist to DB
    this.db.addMessage(sessionId, message.id, role, content, message.timestamp, tokens?.input, tokens?.output);

    return message;
  }

  getMessages(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    if (session) return session.messages;

    // Fall back to DB
    return this.db.getMessages(sessionId);
  }

  getContextMessages(sessionId: string, maxTokens?: number): Message[] {
    const limit = maxTokens || this.config.maxContextTokens;

    // Try in-memory first
    const session = this.sessions.get(sessionId);
    if (session) {
      const messages: Message[] = [];
      let tokenCount = 0;
      for (let i = session.messages.length - 1; i >= 0; i--) {
        const msg = session.messages[i];
        const msgTokens = Math.ceil(msg.content.length / 4);
        if (tokenCount + msgTokens > limit) break;
        messages.unshift(msg);
        tokenCount += msgTokens;
      }
      return messages;
    }

    // Fall back to DB
    return this.db.getContextMessages(sessionId, limit);
  }

  async setSystemPrompt(sessionId: string, prompt: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.systemPrompt = prompt;
  }

  async save(_sessionId: string): Promise<void> {
    // No-op — writes are immediate with SQLite
  }

  async delete(sessionId: string): Promise<boolean> {
    const existed = this.sessions.delete(sessionId);
    this.db.deleteChat(sessionId);

    if (existed) {
      await audit('session.destroyed', { sessionId });
    }
    return existed;
  }

  async clear(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;

    session.messages = [];
    session.metadata.lastActiveAt = Date.now();
    this.db.clearMessages(sessionId);
  }

  async compact(sessionId: string, summary: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session || !this.config.compactionEnabled) return;

    const originalCount = session.messages.length;
    this.db.clearMessages(sessionId);

    const summaryMessage: Message = {
      id: generateMessageId(),
      role: 'system',
      content: `[Previous conversation summary]\n${summary}`,
      timestamp: Date.now(),
    };

    session.messages = [summaryMessage];
    session.metadata.lastActiveAt = Date.now();
    this.db.addMessage(sessionId, summaryMessage.id, 'system', summaryMessage.content, summaryMessage.timestamp);

    await audit('session.compacted', { sessionId, originalCount });
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const ttlMs = this.config.ttlMinutes * 60 * 1000;

    for (const [id, session] of this.sessions) {
      // Only expire non-webchat sessions from memory
      if (session.metadata.channelType === 'webchat') continue;
      if (now - session.metadata.lastActiveAt > ttlMs) {
        this.sessions.delete(id);
      }
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  // ── Chat management ──

  createChat(title?: string): Chat {
    return this.db.createChat(title ?? 'New Chat', 'webchat');
  }

  listChats(options?: ListChatsOptions): Chat[] {
    return this.db.listChats(options);
  }

  renameChat(chatId: string, title: string): void {
    this.db.renameChat(chatId, title);
  }

  archiveChat(chatId: string): void {
    this.db.archiveChat(chatId);
    this.sessions.delete(chatId);
  }

  deleteChat(chatId: string): void {
    this.db.deleteChat(chatId);
    this.sessions.delete(chatId);
  }

  getChatMessages(chatId: string): Message[] {
    return this.db.getMessages(chatId);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    this.db.close();
  }
}
