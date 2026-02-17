import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../src/manager.js';

const testDir = path.join(os.tmpdir(), 'auxiora-sessions-test-' + Date.now());

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(async () => {
    fs.mkdirSync(testDir, { recursive: true });

    manager = new SessionManager({
      maxContextTokens: 10000,
      ttlMinutes: 60,
      autoSave: true,
      compactionEnabled: true,
      dbPath: path.join(testDir, 'sessions.db'),
    });

    await manager.initialize();
  });

  afterEach(() => {
    manager.destroy();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a new session', async () => {
      const session = await manager.create({ channelType: 'webchat' });

      expect(session.id).toBeDefined();
      expect(session.messages).toEqual([]);
      expect(session.metadata.channelType).toBe('webchat');
      expect(session.metadata.createdAt).toBeDefined();
    });
  });

  describe('messages', () => {
    it('should add messages to session', async () => {
      const session = await manager.create({ channelType: 'webchat' });

      await manager.addMessage(session.id, 'user', 'Hello');
      await manager.addMessage(session.id, 'assistant', 'Hi there!');

      const messages = manager.getMessages(session.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].role).toBe('assistant');
    });

    it('should track token usage', async () => {
      const session = await manager.create({ channelType: 'webchat' });

      await manager.addMessage(session.id, 'assistant', 'Response', {
        input: 100,
        output: 50,
      });

      const messages = manager.getMessages(session.id);
      expect(messages[0].tokens).toEqual({ input: 100, output: 50 });
    });
  });

  describe('getOrCreate', () => {
    it('should create new session if none exists', async () => {
      const session = await manager.getOrCreate('key1', {
        channelType: 'telegram',
        senderId: 'user123',
      });

      expect(session.metadata.senderId).toBe('user123');
    });

    it('should return existing session for same sender', async () => {
      const session1 = await manager.getOrCreate('key1', {
        channelType: 'telegram',
        senderId: 'user123',
      });

      await manager.addMessage(session1.id, 'user', 'Hello');

      const session2 = await manager.getOrCreate('key1', {
        channelType: 'telegram',
        senderId: 'user123',
      });

      expect(session2.id).toBe(session1.id);
      expect(manager.getMessages(session2.id)).toHaveLength(1);
    });
  });

  describe('context windowing', () => {
    it('should return messages within token limit', async () => {
      const session = await manager.create({ channelType: 'webchat' });

      for (let i = 0; i < 10; i++) {
        await manager.addMessage(session.id, 'user', 'x'.repeat(100));
        await manager.addMessage(session.id, 'assistant', 'y'.repeat(100));
      }

      const context = manager.getContextMessages(session.id, 2700, 0);
      expect(context.length).toBeLessThan(20);
      expect(context.length).toBeGreaterThan(0);
    });
  });

  describe('clear and delete', () => {
    it('should clear session messages', async () => {
      const session = await manager.create({ channelType: 'webchat' });
      await manager.addMessage(session.id, 'user', 'Hello');
      await manager.addMessage(session.id, 'assistant', 'Hi');

      await manager.clear(session.id);

      const messages = manager.getMessages(session.id);
      expect(messages).toHaveLength(0);
    });

    it('should delete session', async () => {
      const session = await manager.create({ channelType: 'webchat' });

      await manager.delete(session.id);

      const retrieved = await manager.get(session.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should list active sessions', async () => {
      await manager.create({ channelType: 'webchat' });
      await manager.create({ channelType: 'discord' });
      await manager.create({ channelType: 'telegram' });

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(3);
    });
  });

  describe('chat management', () => {
    it('should create and list chats', () => {
      manager.createChat('Chat 1');
      manager.createChat('Chat 2');

      const chats = manager.listChats();
      expect(chats).toHaveLength(2);
    });

    it('should rename a chat', () => {
      const chat = manager.createChat('Old Name');
      manager.renameChat(chat.id, 'New Name');

      const chats = manager.listChats();
      expect(chats.find(c => c.id === chat.id)?.title).toBe('New Name');
    });

    it('should archive and restore visibility', () => {
      manager.createChat('Active');
      const toArchive = manager.createChat('Archive Me');
      manager.archiveChat(toArchive.id);

      expect(manager.listChats()).toHaveLength(1);
      expect(manager.listChats({ archived: true })).toHaveLength(2);
    });

    it('should delete a chat permanently', () => {
      const chat = manager.createChat('Delete Me');
      manager.deleteChat(chat.id);

      expect(manager.listChats()).toHaveLength(0);
    });

    it('should get messages for a specific chat', async () => {
      const chat = manager.createChat('Test Chat');
      await manager.addMessage(chat.id, 'user', 'Hello from chat');

      const messages = manager.getChatMessages(chat.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello from chat');
    });
  });
});
