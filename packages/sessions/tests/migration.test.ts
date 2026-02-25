import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../src/manager.js';

const testDir = path.join(os.tmpdir(), 'auxiora-migration-test-' + Date.now());

describe('JSON-to-SQLite migration', () => {
  let manager: SessionManager;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    manager?.destroy();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should migrate JSON session files to SQLite', async () => {
    // Create a fake JSON session file
    const sessionId = 'test-session-123';
    const sessionData = {
      id: sessionId,
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: 1000 },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: 2000 },
      ],
      metadata: {
        channelType: 'telegram',
        senderId: 'user456',
        createdAt: 1000,
        lastActiveAt: 2000,
      },
    };

    fs.writeFileSync(
      path.join(testDir, `${sessionId}.json`),
      JSON.stringify(sessionData),
    );

    manager = new SessionManager({
      maxContextTokens: 10000,
      ttlMinutes: 60,
      autoSave: true,
      compactionEnabled: true,
      dbPath: path.join(testDir, 'sessions.db'),
      sessionsDir: testDir,
    });

    await manager.initialize();

    // Verify session is now in SQLite
    const session = await manager.get(sessionId);
    expect(session).not.toBeNull();
    expect(session!.messages).toHaveLength(2);
    expect(session!.messages[0].content).toBe('Hello');
    expect(session!.messages[1].content).toBe('Hi there!');
    expect(session!.metadata.channelType).toBe('telegram');

    // Verify JSON file moved to migrated/
    expect(fs.existsSync(path.join(testDir, `${sessionId}.json`))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'migrated', `${sessionId}.json`))).toBe(true);
  });

  it('should be a no-op when no JSON files exist', async () => {
    manager = new SessionManager({
      maxContextTokens: 10000,
      ttlMinutes: 60,
      autoSave: true,
      compactionEnabled: true,
      dbPath: path.join(testDir, 'sessions.db'),
      sessionsDir: testDir,
    });

    await manager.initialize();

    // Should not throw and no migrated/ dir created
    expect(fs.existsSync(path.join(testDir, 'migrated'))).toBe(false);
  });

  it('should skip corrupt JSON files without crashing', async () => {
    // Write a corrupt file and a valid file
    fs.writeFileSync(path.join(testDir, 'corrupt.json'), '{invalid json!!!');
    fs.writeFileSync(
      path.join(testDir, 'valid-session.json'),
      JSON.stringify({
        id: 'valid-session',
        messages: [{ id: 'msg-1', role: 'user', content: 'Works', timestamp: 1000 }],
        metadata: { channelType: 'webchat', createdAt: 1000, lastActiveAt: 1000 },
      }),
    );

    manager = new SessionManager({
      maxContextTokens: 10000,
      ttlMinutes: 60,
      autoSave: true,
      compactionEnabled: true,
      dbPath: path.join(testDir, 'sessions.db'),
      sessionsDir: testDir,
    });

    await manager.initialize();

    // Valid session should be migrated
    const session = await manager.get('valid-session');
    expect(session).not.toBeNull();
    expect(session!.messages).toHaveLength(1);

    // Corrupt file should remain (not moved to migrated/)
    expect(fs.existsSync(path.join(testDir, 'corrupt.json'))).toBe(true);
  });
});
