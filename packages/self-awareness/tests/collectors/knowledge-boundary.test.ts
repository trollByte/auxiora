import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBoundary } from '../../src/collectors/knowledge-boundary.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'hello', recentMessages: [], ...overrides };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('KnowledgeBoundary', () => {
  let collector: KnowledgeBoundary;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new KnowledgeBoundary(storage);
  });

  it('returns empty signals for new user', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('afterResponse records hedge phrases', async () => {
    await collector.afterResponse(postCtx({
      userId: 'u1',
      currentMessage: 'explain kubernetes networking',
      response: "I think kubernetes networking uses CNI plugins, but I'm not entirely sure about the specifics.",
    }));
    const map = await storage.read('knowledge-map', 'u1');
    expect(map).not.toBeNull();
    expect(map!.topics).toBeDefined();
  });

  it('afterResponse detects user corrections', async () => {
    await collector.afterResponse(postCtx({
      currentMessage: 'what is a VLAN?',
      response: 'A VLAN is a virtual local area network.',
    }));
    await collector.afterResponse(postCtx({
      currentMessage: "actually, VLANs also provide broadcast domain isolation, you didn't mention that",
      response: "You're right, VLANs do provide broadcast domain isolation.",
      recentMessages: [
        { id: '1', role: 'assistant', content: 'A VLAN is a virtual local area network.', timestamp: 1 },
        { id: '2', role: 'user', content: "actually, VLANs also provide broadcast domain isolation", timestamp: 2 },
      ],
    }));
    const map = await storage.read('knowledge-map', 'u1') as any;
    expect(map?.topics?.length).toBeGreaterThan(0);
  });

  it('surfaces warning for previously-corrected topic', async () => {
    await storage.write('knowledge-map', 'u1', {
      topics: [{ topic: 'kubernetes', hedgeCount: 1, correctionCount: 2, lastSeen: Date.now() }],
    });
    const signals = await collector.collect(ctx({ currentMessage: 'tell me more about kubernetes networking' }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].text).toContain('kubernetes');
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.7);
  });

  it('does not warn for uncorrected topics', async () => {
    await storage.write('knowledge-map', 'u1', {
      topics: [{ topic: 'react', hedgeCount: 0, correctionCount: 0, lastSeen: Date.now() }],
    });
    const signals = await collector.collect(ctx({ currentMessage: 'help me with react hooks' }));
    expect(signals).toEqual([]);
  });
});
