import { describe, expect, it } from 'vitest';
import { GroupContextStage } from '../../src/enrichment/stages/group-context-stage.js';
import type { EnrichmentContext } from '../../src/enrichment/types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'You are a helpful assistant.',
    userMessage: 'Hello everyone',
    history: [],
    channelType: 'discord',
    chatId: 'discord:general',
    sessionId: 'sess1',
    userId: 'user1',
    toolsUsed: [],
    config: {} as never,
    ...overrides,
  };
}

describe('GroupContextStage', () => {
  const stage = new GroupContextStage();

  it('has order 150', () => {
    expect(stage.order).toBe(150);
  });

  it('is disabled when no groupContext', () => {
    expect(stage.enabled(makeCtx())).toBe(false);
  });

  it('is disabled when groupContext.isGroup is false', () => {
    expect(stage.enabled(makeCtx({ groupContext: { isGroup: false } }))).toBe(false);
  });

  it('is enabled when groupContext.isGroup is true', () => {
    expect(stage.enabled(makeCtx({ groupContext: { isGroup: true } }))).toBe(true);
  });

  it('prepends group context instruction with all fields', async () => {
    const ctx = makeCtx({
      senderName: 'Alice',
      groupContext: { isGroup: true, groupName: 'Dev Team', participantCount: 8 },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('group chat');
    expect(result.prompt).toContain('Dev Team');
    expect(result.prompt).toContain('8');
    expect(result.prompt).toContain('Alice');
    expect(result.prompt).toContain('Base prompt.');
  });

  it('omits groupName when not provided', async () => {
    const ctx = makeCtx({
      senderName: 'Bob',
      groupContext: { isGroup: true, participantCount: 3 },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('group chat');
    expect(result.prompt).not.toContain('called');
    expect(result.prompt).toContain('Bob');
  });

  it('omits participantCount when not provided', async () => {
    const ctx = makeCtx({
      groupContext: { isGroup: true, groupName: 'Watercooler' },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('Watercooler');
    expect(result.prompt).not.toContain('participants');
  });

  it('omits senderName when not provided', async () => {
    const ctx = makeCtx({
      groupContext: { isGroup: true },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('group chat');
    expect(result.prompt).not.toContain('speaker');
  });
});
