import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalTracker } from '../../src/collectors/temporal-tracker.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'hello', recentMessages: [], ...overrides };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('TemporalTracker', () => {
  let collector: TemporalTracker;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new TemporalTracker(storage);
  });

  it('returns uptime signal', async () => {
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('temporal-tracker');
    expect(signals[0].text).toContain('Running for');
  });

  it('includes session info when messages exist', async () => {
    const now = Date.now();
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'hi', timestamp: now - 600_000 },
        { id: '2', role: 'assistant', content: 'hello', timestamp: now - 590_000 },
        { id: '3', role: 'user', content: 'question', timestamp: now - 300_000 },
      ],
    }));
    expect(signals[0].text).toContain('conversation');
  });

  it('afterResponse increments daily counter', async () => {
    await collector.afterResponse(postCtx());
    await collector.afterResponse(postCtx());
    const counters = await storage.read('temporal', 'daily-counters') as any;
    expect(counters).not.toBeNull();
    const today = counters.days?.find((d: any) => d.date === new Date().toISOString().slice(0, 10));
    expect(today?.messages).toBe(2);
  });

  it('has low priority', async () => {
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBe(0.4);
  });
});
