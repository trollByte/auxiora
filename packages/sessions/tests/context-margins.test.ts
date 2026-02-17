import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SessionManager } from '../src/manager.js';

let manager: SessionManager;
let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-margins-'));
  manager = new SessionManager({
    maxContextTokens: 10000,
    ttlMinutes: 60,
    autoSave: true,
    compactionEnabled: true,
    dbPath: path.join(testDir, 'sessions.db'),
  });
});

afterEach(() => {
  manager.destroy();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('getContextMessages — safety margins', () => {
  it('should apply 20% safety margin to token budget', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    // Add 20 messages of 400 chars each
    // At prose ratio /4: each msg = 100 tokens, total = 2000 tokens
    for (let i = 0; i < 20; i++) {
      await manager.addMessage(session.id, 'user', 'a'.repeat(400));
    }

    // maxTokens=10000, outputReserve=0:
    // effective = 10000 * 0.8 - 0 - 2000 = 6000 tokens
    // 6000 / 100 = 60 msgs → all 20 fit
    const contextNoReserve = manager.getContextMessages(session.id, 10000, 0);
    expect(contextNoReserve.length).toBe(20);

    // maxTokens=3500, outputReserve=0:
    // effective = 3500 * 0.8 - 0 - 2000 = 800 tokens
    // 800 / 100 = 8 msgs
    const contextTight = manager.getContextMessages(session.id, 3500, 0);
    expect(contextTight.length).toBeLessThan(20);
    expect(contextTight.length).toBeGreaterThan(0);
  });

  it('should accept custom outputReserve', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    for (let i = 0; i < 20; i++) {
      await manager.addMessage(session.id, 'user', 'a'.repeat(400));
    }

    // Small reserve: effective = 10000*0.8 - 1000 - 2000 = 5000 → all 20 fit
    const contextSmall = manager.getContextMessages(session.id, 10000, 1000);
    // Large reserve: effective = 10000*0.8 - 7000 - 2000 = -1000 → clamped to 0
    const contextLarge = manager.getContextMessages(session.id, 10000, 7000);
    expect(contextSmall.length).toBeGreaterThan(contextLarge.length);
  });

  it('should use estimateTokens instead of length/4 for CJK', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    // CJK text: ~100 CJK chars, estimated at ~2 chars/token = ~50 tokens each
    const cjkText = '\u4F60\u597D\u4E16\u754C\u6B22\u8FCE'.repeat(17); // ~102 CJK chars
    for (let i = 0; i < 20; i++) {
      await manager.addMessage(session.id, 'user', cjkText);
    }

    // With old /4: 102/4 = 26 tokens/msg
    // With CJK detection: 102/2 = 51 tokens/msg
    // Budget = 4000*0.8 - 0 - 2000 = 1200 tokens
    // Old: 1200/26 = 46 msgs → all 20 fit
    // New: 1200/51 = 23 msgs → all 20 fit with CJK too
    // Use tighter: 3000*0.8 - 0 - 2000 = 400 tokens
    // Old: 400/26 = 15 msgs → 15 returned
    // New: 400/51 = 7 msgs → 7 returned
    const context = manager.getContextMessages(session.id, 3000, 0);
    // With CJK-aware estimation, fewer messages should fit
    expect(context.length).toBeLessThan(15);
    expect(context.length).toBeGreaterThan(0);
  });

  it('should warn when effective budget is very small', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = await manager.create({ channelType: 'webchat' });

    await manager.addMessage(session.id, 'user', 'Hello');

    // effective = 5000 * 0.8 - 4096 - 2000 = -2096 → clamped to 0
    manager.getContextMessages(session.id, 5000);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should use config default when maxTokens not specified', async () => {
    const session = await manager.create({ channelType: 'webchat' });
    await manager.addMessage(session.id, 'user', 'Hello');

    // Config default is 10000: effective = 10000*0.8 - 4096 - 2000 = 1904
    // 'Hello' = ~2 tokens, well within budget
    const context = manager.getContextMessages(session.id);
    expect(context.length).toBe(1);
  });

  it('should preserve message order (oldest to newest)', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    await manager.addMessage(session.id, 'user', 'First');
    await manager.addMessage(session.id, 'assistant', 'Second');
    await manager.addMessage(session.id, 'user', 'Third');

    const context = manager.getContextMessages(session.id);
    expect(context[0].content).toBe('First');
    expect(context[1].content).toBe('Second');
    expect(context[2].content).toBe('Third');
  });
});
