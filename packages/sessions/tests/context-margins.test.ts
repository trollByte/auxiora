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

describe('getContextMessages — channel auto-truncation', () => {
  it('should cap token budget for channel messages', async () => {
    const session = await manager.create({ channelType: 'discord' });

    // Add 60 messages of 400 chars each (100 tokens each = 6000 total)
    for (let i = 0; i < 60; i++) {
      await manager.addMessage(session.id, i % 2 === 0 ? 'user' : 'assistant', 'a'.repeat(400));
    }

    // Without isChannel: maxTokens=200000, budget = 200000*0.8 - 0 - 2000 = 158000 → all 60 fit
    const contextUnlimited = manager.getContextMessages(session.id, 200000, 0);
    expect(contextUnlimited.length).toBe(60);

    // With isChannel: capped at 40000, budget = 40000*0.8 - 0 - 2000 = 30000 → all 60 still fit (6000 < 30000)
    const contextChannel = manager.getContextMessages(session.id, 200000, 0, { isChannel: true });
    expect(contextChannel.length).toBe(60);

    // With isChannel + many more messages that exceed the capped budget
    for (let i = 0; i < 300; i++) {
      await manager.addMessage(session.id, i % 2 === 0 ? 'user' : 'assistant', 'a'.repeat(400));
    }
    // Total now: 360 messages = 36000 tokens, budget capped at 30000
    const contextCapped = manager.getContextMessages(session.id, 1000000, 0, { isChannel: true });
    expect(contextCapped.length).toBeLessThan(360);
    expect(contextCapped.length).toBeGreaterThan(0);
  });

  it('should apply maxTurns option to limit conversation turns', async () => {
    const session = await manager.create({ channelType: 'discord' });

    // Add 10 user/assistant turn pairs (20 messages)
    for (let i = 0; i < 10; i++) {
      await manager.addMessage(session.id, 'user', `User message ${i}`);
      await manager.addMessage(session.id, 'assistant', `Assistant reply ${i}`);
    }

    // Limit to 3 turns = 6 conversation messages + 1 omission marker = 7
    const context = manager.getContextMessages(session.id, 100000, 0, { maxTurns: 3 });
    // degradeContext adds an omission marker when messages are dropped
    const conversationMsgs = context.filter(m => !m.content.startsWith('[...'));
    expect(conversationMsgs.length).toBe(6);
    // Should be the most recent 3 turns
    expect(conversationMsgs[0].content).toBe('User message 7');
    expect(conversationMsgs[1].content).toBe('Assistant reply 7');
    expect(conversationMsgs[4].content).toBe('User message 9');
    expect(conversationMsgs[5].content).toBe('Assistant reply 9');
    // Omission marker should be present
    expect(context.some(m => m.content.includes('earlier messages omitted'))).toBe(true);
  });

  it('should use config maxChannelTurns when isChannel is true', async () => {
    // Create a separate manager with maxChannelTurns=5
    const channelManager = new SessionManager({
      maxContextTokens: 10000,
      maxChannelTurns: 5,
      ttlMinutes: 60,
      autoSave: true,
      compactionEnabled: true,
      dbPath: path.join(testDir, 'sessions-channel.db'),
    });

    const session = await channelManager.create({ channelType: 'discord' });

    // Add 10 turn pairs (20 messages)
    for (let i = 0; i < 10; i++) {
      await channelManager.addMessage(session.id, 'user', `Msg ${i}`);
      await channelManager.addMessage(session.id, 'assistant', `Reply ${i}`);
    }

    // isChannel=true should use config maxChannelTurns=5 → 10 conversation messages + omission marker
    const context = channelManager.getContextMessages(session.id, 100000, 0, { isChannel: true });
    const conversationMsgs = context.filter(m => !m.content.startsWith('[...'));
    expect(conversationMsgs.length).toBe(10);
    // Should be the most recent 5 turns
    expect(conversationMsgs[0].content).toBe('Msg 5');
    expect(conversationMsgs[9].content).toBe('Reply 9');

    channelManager.destroy();
  });

  it('should preserve system messages when applying turn limit', async () => {
    const session = await manager.create({ channelType: 'discord' });

    // Add a system message, then 5 turn pairs
    await manager.addMessage(session.id, 'system', 'You are a helpful assistant.');
    for (let i = 0; i < 5; i++) {
      await manager.addMessage(session.id, 'user', `User ${i}`);
      await manager.addMessage(session.id, 'assistant', `Reply ${i}`);
    }

    // Limit to 2 turns — should keep system message + last 4 conversation messages + omission marker
    const context = manager.getContextMessages(session.id, 100000, 0, { maxTurns: 2 });
    expect(context[0].content).toBe('You are a helpful assistant.');
    expect(context[0].role).toBe('system');
    // Filter out omission marker for conversation assertion
    const conversationMsgs = context.filter(m => m.role !== 'system' && !m.content.startsWith('[...'));
    expect(conversationMsgs.length).toBe(4);
    expect(conversationMsgs[0].content).toBe('User 3');
    expect(conversationMsgs[3].content).toBe('Reply 4');
    // Omission marker should be present (6 messages dropped from original 11)
    expect(context.some(m => m.content.includes('earlier messages omitted'))).toBe(true);
  });

  it('should not apply turn limit when maxTurns is 0', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    for (let i = 0; i < 10; i++) {
      await manager.addMessage(session.id, 'user', `Msg ${i}`);
      await manager.addMessage(session.id, 'assistant', `Reply ${i}`);
    }

    // maxTurns=0 means unlimited
    const context = manager.getContextMessages(session.id, 100000, 0, { maxTurns: 0 });
    expect(context.length).toBe(20);
  });
});
