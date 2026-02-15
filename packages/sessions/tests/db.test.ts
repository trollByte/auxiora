import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionDatabase } from '../src/db.js';

const testDir = path.join(os.tmpdir(), 'auxiora-db-test-' + Date.now());
const dbPath = path.join(testDir, 'test.db');

describe('SessionDatabase', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    db = new SessionDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('chats', () => {
    it('should create a chat', () => {
      const chat = db.createChat('Test Chat', 'webchat');
      expect(chat.id).toBeDefined();
      expect(chat.title).toBe('Test Chat');
      expect(chat.channel).toBe('webchat');
      expect(chat.archived).toBe(false);
    });

    it('should list chats ordered by updatedAt descending', () => {
      const chat1 = db.createChat('First', 'webchat');
      const chat2 = db.createChat('Second', 'webchat');
      db.addMessage(chat1.id, 'msg-1', 'user', 'hello', Date.now() + 1000);

      const chats = db.listChats();
      expect(chats).toHaveLength(2);
      expect(chats[0].id).toBe(chat1.id);
    });

    it('should filter out archived chats by default', () => {
      db.createChat('Active', 'webchat');
      const archived = db.createChat('Archived', 'webchat');
      db.archiveChat(archived.id);

      const chats = db.listChats();
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe('Active');
    });

    it('should include archived chats when requested', () => {
      db.createChat('Active', 'webchat');
      const archived = db.createChat('Archived', 'webchat');
      db.archiveChat(archived.id);

      const chats = db.listChats({ archived: true });
      expect(chats).toHaveLength(2);
    });

    it('should rename a chat', () => {
      const chat = db.createChat('Old Name', 'webchat');
      db.renameChat(chat.id, 'New Name');
      const updated = db.getChat(chat.id);
      expect(updated?.title).toBe('New Name');
    });

    it('should delete a chat and its messages', () => {
      const chat = db.createChat('To Delete', 'webchat');
      db.addMessage(chat.id, 'msg-1', 'user', 'hello', Date.now());
      db.deleteChat(chat.id);
      expect(db.getChat(chat.id)).toBeUndefined();
      expect(db.getMessages(chat.id)).toEqual([]);
    });

    it('should support pagination', () => {
      for (let i = 0; i < 5; i++) {
        db.createChat(`Chat ${i}`, 'webchat');
      }
      const page1 = db.listChats({ limit: 2 });
      expect(page1).toHaveLength(2);
      const page2 = db.listChats({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      const page3 = db.listChats({ limit: 2, offset: 4 });
      expect(page3).toHaveLength(1);
    });
  });

  describe('messages', () => {
    it('should add and retrieve messages', () => {
      const chat = db.createChat('Test', 'webchat');
      db.addMessage(chat.id, 'msg-1', 'user', 'Hello', 1000);
      db.addMessage(chat.id, 'msg-2', 'assistant', 'Hi there', 2000);

      const messages = db.getMessages(chat.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].role).toBe('assistant');
    });

    it('should store token counts', () => {
      const chat = db.createChat('Test', 'webchat');
      db.addMessage(chat.id, 'msg-1', 'assistant', 'response', 1000, 100, 50);
      const messages = db.getMessages(chat.id);
      expect(messages[0].tokens).toEqual({ input: 100, output: 50 });
    });

    it('should update chat updatedAt when adding messages', () => {
      const chat = db.createChat('Test', 'webchat');
      const originalUpdatedAt = chat.updatedAt;
      db.addMessage(chat.id, 'msg-1', 'user', 'Hello', originalUpdatedAt + 5000);
      const updated = db.getChat(chat.id);
      expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });

    it('should get context messages within token budget', () => {
      const chat = db.createChat('Test', 'webchat');
      for (let i = 0; i < 20; i++) {
        db.addMessage(chat.id, `msg-${i}`, 'user', 'x'.repeat(100), i * 1000);
      }
      const context = db.getContextMessages(chat.id, 100);
      expect(context.length).toBeLessThan(20);
      expect(context.length).toBeGreaterThan(0);
      expect(context[context.length - 1].id).toBe('msg-19');
    });
  });

  describe('session compatibility', () => {
    it('should get or create a session-style chat by sender+channel', () => {
      const chat1 = db.getOrCreateSessionChat('user123', 'telegram');
      expect(chat1.id).toBeDefined();
      const chat2 = db.getOrCreateSessionChat('user123', 'telegram');
      expect(chat2.id).toBe(chat1.id);
      const chat3 = db.getOrCreateSessionChat('user456', 'telegram');
      expect(chat3.id).not.toBe(chat1.id);
    });
  });
});
