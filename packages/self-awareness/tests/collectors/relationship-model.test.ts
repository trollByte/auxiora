import { describe, it, expect, beforeEach } from 'vitest';
import { RelationshipModel } from '../../src/collectors/relationship-model.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'hello', recentMessages: [], ...overrides };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('RelationshipModel', () => {
  let collector: RelationshipModel;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new RelationshipModel(storage);
  });

  it('returns empty signals for new user', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('returns profile signal for known user', async () => {
    await storage.write('relationships', 'u1', {
      interactionCount: 25,
      preferredVerbosity: 'concise',
      expertiseDomains: ['typescript', 'security'],
      topTopics: ['engineering', 'architecture'],
      avgUserMsgLength: 40,
      lastSeen: Date.now(),
    });
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('relationship-model');
    expect(signals[0].text).toContain('concise');
    expect(signals[0].text).toContain('typescript');
  });

  it('afterResponse updates interaction count', async () => {
    await collector.afterResponse(postCtx({ response: 'short reply' }));
    const profile = await storage.read('relationships', 'u1') as any;
    expect(profile.interactionCount).toBe(1);
  });

  it('afterResponse accumulates interactions', async () => {
    for (let i = 0; i < 5; i++) {
      await collector.afterResponse(postCtx({
        currentMessage: 'brief question',
        response: 'A very long and detailed response with lots of explanation.',
      }));
    }
    const profile = await storage.read('relationships', 'u1') as any;
    expect(profile.interactionCount).toBe(5);
  });

  it('afterResponse tracks expertise from corrections', async () => {
    await collector.afterResponse(postCtx({
      currentMessage: "actually, TypeScript generics work differently — you need to use extends",
      response: "You're right, thanks for the correction.",
    }));
    const profile = await storage.read('relationships', 'u1') as any;
    expect(profile.expertiseDomains).toBeDefined();
  });

  it('has correct priority', async () => {
    await storage.write('relationships', 'u1', {
      interactionCount: 10, preferredVerbosity: 'detailed',
      expertiseDomains: [], topTopics: [], avgUserMsgLength: 100, lastSeen: Date.now(),
    });
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBe(0.7);
  });
});
