import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getSessionsDir } from '@auxiora/core';
import { audit } from '@auxiora/audit';
import type { Session, SessionConfig, Message, MessageRole, SessionMetadata } from './types.js';

function generateId(): string {
  return crypto.randomUUID();
}

function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: SessionConfig;
  private sessionsDir: string;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private saveQueue: Map<string, Promise<void>> = new Map();

  constructor(config: SessionConfig) {
    this.config = config;
    this.sessionsDir = getSessionsDir();

    // Cleanup expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  async create(metadata: Partial<SessionMetadata> & { channelType: string }): Promise<Session> {
    const id = generateId();
    const now = Date.now();

    const session: Session = {
      id,
      messages: [],
      metadata: {
        channelType: metadata.channelType,
        senderId: metadata.senderId,
        clientId: metadata.clientId,
        createdAt: now,
        lastActiveAt: now,
      },
    };

    this.sessions.set(id, session);
    await audit('session.created', { sessionId: id, channelType: metadata.channelType });

    if (this.config.autoSave) {
      await this.save(id);
    }

    return session;
  }

  async get(id: string): Promise<Session | null> {
    // Check memory first
    if (this.sessions.has(id)) {
      return this.sessions.get(id)!;
    }

    // Try to load from disk
    try {
      const filePath = path.join(this.sessionsDir, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as Session;
      this.sessions.set(id, session);
      return session;
    } catch {
      return null;
    }
  }

  async getOrCreate(
    key: string,
    metadata: Partial<SessionMetadata> & { channelType: string }
  ): Promise<Session> {
    // Look for existing session by key (could be senderId + channelType)
    for (const session of this.sessions.values()) {
      if (
        session.metadata.senderId === metadata.senderId &&
        session.metadata.channelType === metadata.channelType
      ) {
        session.metadata.lastActiveAt = Date.now();
        return session;
      }
    }

    // Try loading from disk by scanning files
    try {
      const files = await fs.readdir(this.sessionsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.sessionsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(content) as Session;

        if (
          session.metadata.senderId === metadata.senderId &&
          session.metadata.channelType === metadata.channelType
        ) {
          session.metadata.lastActiveAt = Date.now();
          this.sessions.set(session.id, session);
          return session;
        }
      }
    } catch {
      // Directory might not exist yet
    }

    // Create new session
    return this.create(metadata);
  }

  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    tokens?: { input?: number; output?: number }
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

    if (this.config.autoSave) {
      await this.save(sessionId);
    }

    return message;
  }

  getMessages(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    return session?.messages || [];
  }

  getContextMessages(sessionId: string, maxTokens?: number): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const limit = maxTokens || this.config.maxContextTokens;
    const messages: Message[] = [];
    let tokenCount = 0;

    // Work backwards from most recent
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const msg = session.messages[i];
      // Rough estimate: 4 chars per token
      const msgTokens = Math.ceil(msg.content.length / 4);

      if (tokenCount + msgTokens > limit) break;

      messages.unshift(msg);
      tokenCount += msgTokens;
    }

    return messages;
  }

  async setSystemPrompt(sessionId: string, prompt: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.systemPrompt = prompt;

    if (this.config.autoSave) {
      await this.save(sessionId);
    }
  }

  async save(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Queue saves to prevent concurrent writes
    const existing = this.saveQueue.get(sessionId);
    if (existing) {
      await existing;
    }

    const savePromise = (async () => {
      await fs.mkdir(this.sessionsDir, { recursive: true });
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    })();

    this.saveQueue.set(sessionId, savePromise);
    await savePromise;
    this.saveQueue.delete(sessionId);
  }

  async delete(sessionId: string): Promise<boolean> {
    const existed = this.sessions.delete(sessionId);

    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch {
      // File might not exist
    }

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

    if (this.config.autoSave) {
      await this.save(sessionId);
    }
  }

  async compact(sessionId: string, summary: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session || !this.config.compactionEnabled) return;

    // Replace all messages with a summary message
    session.messages = [
      {
        id: generateMessageId(),
        role: 'system',
        content: `[Previous conversation summary]\n${summary}`,
        timestamp: Date.now(),
      },
    ];
    session.metadata.lastActiveAt = Date.now();

    await audit('session.compacted', { sessionId, originalCount: session.messages.length });

    if (this.config.autoSave) {
      await this.save(sessionId);
    }
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    const ttlMs = this.config.ttlMinutes * 60 * 1000;

    for (const [id, session] of this.sessions) {
      if (now - session.metadata.lastActiveAt > ttlMs) {
        await this.delete(id);
      }
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}
