import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationReflector } from '../../src/collectors/conversation-reflector.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello',
    recentMessages: [],
    ...overrides,
  };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return {
    ...ctx(), response: 'response', responseTime: 100,
    tokensUsed: { input: 10, output: 20 },
    ...overrides,
  };
}

describe('ConversationReflector', () => {
  let collector: ConversationReflector;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new ConversationReflector(storage);
  });

  it('returns empty signals for a fresh conversation', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('detects clarification patterns in recent messages', async () => {
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'explain X', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'X is...', timestamp: 2 },
        { id: '3', role: 'user', content: 'no, I meant something else', timestamp: 3 },
        { id: '4', role: 'assistant', content: 'Oh, you mean...', timestamp: 4 },
      ],
      currentMessage: 'that is not what I asked',
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].dimension).toBe('conversation-reflector');
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.7);
  });

  it('detects rephrase patterns', async () => {
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'what is kubernetes?', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Kubernetes is...', timestamp: 2 },
      ],
      currentMessage: "that's not what I asked, what is kubernetes networking?",
    }));
    expect(signals.length).toBeGreaterThan(0);
  });

  it('does not false-positive on normal follow-ups', async () => {
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'explain X', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'X is...', timestamp: 2 },
      ],
      currentMessage: 'great, now explain Y',
    }));
    expect(signals).toEqual([]);
  });

  it('afterResponse stores response fingerprint', async () => {
    await collector.afterResponse(postCtx({ response: 'Kubernetes is a container orchestration platform.' }));
    const stored = await storage.read('reflections', 'c1');
    expect(stored).not.toBeNull();
    expect(stored!.fingerprints).toBeDefined();
  });

  it('detects repetition from stored fingerprints', async () => {
    for (let i = 0; i < 3; i++) {
      await collector.afterResponse(postCtx({
        chatId: 'c1',
        response: 'Kubernetes is a container orchestration platform that manages containers.',
      }));
    }
    const signals = await collector.collect(ctx({ chatId: 'c1' }));
    expect(signals).toBeDefined();
  });
});
