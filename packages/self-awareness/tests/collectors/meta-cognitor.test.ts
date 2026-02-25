import { describe, it, expect, beforeEach } from 'vitest';
import { MetaCognitor } from '../../src/collectors/meta-cognitor.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'hello', recentMessages: [], ...overrides };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('MetaCognitor', () => {
  let collector: MetaCognitor;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new MetaCognitor(storage);
  });

  it('returns empty signals with no prior state', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('afterResponse stores response length', async () => {
    await collector.afterResponse(postCtx({ chatId: 'c1', response: 'Short reply.' }));
    const state = await storage.read('meta', 'c1') as any;
    expect(state).not.toBeNull();
    expect(state.responseLengths).toHaveLength(1);
    expect(state.responseLengths[0]).toBe(12);
  });

  it('surfaces stored insights', async () => {
    await storage.write('meta', 'c1', {
      responseLengths: [100, 200, 400, 800, 1600],
      insights: ['Response length trending up significantly — consider being more concise.'],
    });
    const signals = await collector.collect(ctx({ chatId: 'c1' }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].text).toContain('concise');
  });

  it('keeps only last 10 response lengths', async () => {
    for (let i = 0; i < 15; i++) {
      await collector.afterResponse(postCtx({ chatId: 'c1', response: `Response ${i}` }));
    }
    const state = await storage.read('meta', 'c1') as any;
    expect(state.responseLengths.length).toBeLessThanOrEqual(10);
  });

  it('limits insights to 5', async () => {
    await storage.write('meta', 'c1', {
      responseLengths: [100, 200, 400, 800, 1600],
      insights: ['a', 'b', 'c', 'd', 'e'],
    });
    await collector.afterResponse(postCtx({ chatId: 'c1', response: 'X'.repeat(3000) }));
    const state = await storage.read('meta', 'c1') as any;
    expect(state.insights.length).toBeLessThanOrEqual(5);
  });
});
