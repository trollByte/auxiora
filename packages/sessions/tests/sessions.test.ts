import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../src/manager.js';

const testDir = path.join(os.tmpdir(), 'auxiora-sessions-test-' + Date.now());

// Mock the sessions directory
const originalGetSessionsDir = await import('@auxiora/core').then((m) => m.getSessionsDir);

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });

    // Create manager with test config
    manager = new SessionManager({
      maxContextTokens: 10000,
      ttlMinutes: 60,
      autoSave: true,
      compactionEnabled: true,
    });

    // Override sessions directory
    // @ts-ignore
    manager['sessionsDir'] = testDir;

    await manager.initialize();
  });

  afterEach(async () => {
    manager.destroy();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a new session', async () => {
      const session = await manager.create({ channelType: 'webchat' });

      expect(session.id).toBeDefined();
      expect(session.messages).toEqual([]);
      expect(session.metadata.channelType).toBe('webchat');
      expect(session.metadata.createdAt).toBeDefined();
    });

    it('should save session to disk', async () => {
      const session = await manager.create({ channelType: 'discord' });

      const filePath = path.join(testDir, `${session.id}.json`);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
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

      // Add messages with increasing content
      for (let i = 0; i < 10; i++) {
        await manager.addMessage(session.id, 'user', 'x'.repeat(100));
        await manager.addMessage(session.id, 'assistant', 'y'.repeat(100));
      }

      // Limit to ~500 chars (125 tokens roughly)
      const context = manager.getContextMessages(session.id, 125);

      // Should get fewer than all messages
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
      const filePath = path.join(testDir, `${session.id}.json`);

      await manager.delete(session.id);

      const retrieved = await manager.get(session.id);
      expect(retrieved).toBeNull();

      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
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
});
