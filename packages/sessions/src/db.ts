import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import { estimateTokens } from './token-estimator.js';
import type { Message, Chat, ListChatsOptions } from './types.js';

function generateId(): string {
  return crypto.randomUUID();
}

export class SessionDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        channel     TEXT NOT NULL DEFAULT 'webchat',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        archived    INTEGER NOT NULL DEFAULT 0,
        metadata    TEXT,
        sender_id   TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        tokens_in   INTEGER,
        tokens_out  INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chats_sender ON chats(sender_id, channel);
    `);
  }

  // ── Chat operations ──

  createChat(title: string, channel: string, senderId?: string): Chat {
    const id = generateId();
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO chats (id, title, channel, created_at, updated_at, sender_id) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, title, channel, now, now, senderId ?? null);
    return { id, title, channel, createdAt: now, updatedAt: now, archived: false };
  }

  getChat(id: string): Chat | undefined {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToChat(row) : undefined;
  }

  listChats(options?: ListChatsOptions): Chat[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    if (options?.archived) {
      return (this.db.prepare('SELECT * FROM chats ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Record<string, unknown>[]).map(r => this.rowToChat(r));
    }
    return (this.db.prepare('SELECT * FROM chats WHERE archived = 0 ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Record<string, unknown>[]).map(r => this.rowToChat(r));
  }

  renameChat(id: string, title: string): void {
    this.db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
  }

  archiveChat(id: string): void {
    this.db.prepare('UPDATE chats SET archived = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  }

  updateChatMetadata(id: string, metadata: Record<string, unknown>): void {
    this.db.prepare('UPDATE chats SET metadata = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(metadata), Date.now(), id);
  }

  deleteChat(id: string): void {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  }

  // ── Message operations ──

  addMessage(
    chatId: string,
    msgId: string,
    role: string,
    content: string,
    timestamp: number,
    tokensIn?: number,
    tokensOut?: number,
  ): void {
    this.db.prepare(
      'INSERT INTO messages (id, chat_id, role, content, timestamp, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(msgId, chatId, role, content, timestamp, tokensIn ?? null, tokensOut ?? null);
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(timestamp, chatId);
  }

  getMessages(chatId: string): Message[] {
    return (this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC').all(chatId) as Record<string, unknown>[]).map(r => this.rowToMessage(r));
  }

  getContextMessages(chatId: string, maxTokens: number): Message[] {
    const rows = this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC').all(chatId) as Record<string, unknown>[];
    const messages: Message[] = [];
    let tokenCount = 0;
    for (const row of rows) {
      const msg = this.rowToMessage(row);
      const msgTokens = estimateTokens(msg.content);
      if (tokenCount + msgTokens > maxTokens) break;
      messages.unshift(msg);
      tokenCount += msgTokens;
    }
    return messages;
  }

  clearMessages(chatId: string): void {
    this.db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), chatId);
  }

  // ── Session compatibility ──

  getOrCreateSessionChat(senderId: string, channel: string): Chat {
    const row = this.db.prepare(
      'SELECT * FROM chats WHERE sender_id = ? AND channel = ? ORDER BY updated_at DESC LIMIT 1',
    ).get(senderId, channel) as Record<string, unknown> | undefined;
    if (row) {
      this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), row.id as string);
      return this.rowToChat(row);
    }
    return this.createChat(`${channel} session`, channel, senderId);
  }

  insertChatWithId(
    id: string,
    title: string,
    channel: string,
    createdAt: number,
    updatedAt: number,
    senderId?: string,
  ): void {
    this.db.prepare(
      'INSERT INTO chats (id, title, channel, created_at, updated_at, sender_id) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, title, channel, createdAt, updatedAt, senderId ?? null);
  }

  // ── Helpers ──

  private rowToChat(row: Record<string, unknown>): Chat {
    return {
      id: row.id as string,
      title: row.title as string,
      channel: row.channel as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      archived: row.archived === 1,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  private rowToMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content as string,
      timestamp: row.timestamp as number,
      tokens: (row.tokens_in != null || row.tokens_out != null)
        ? { input: (row.tokens_in as number) ?? undefined, output: (row.tokens_out as number) ?? undefined }
        : undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}
