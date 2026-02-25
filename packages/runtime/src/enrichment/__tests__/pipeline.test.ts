import { describe, it, expect, vi } from 'vitest';
import { EnrichmentPipeline } from '../pipeline.js';
import type { EnrichmentContext, EnrichmentStage } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base prompt',
    userMessage: 'hello',
    history: [],
    channelType: 'webchat',
    chatId: 'chat-1',
    sessionId: 'sess-1',
    userId: 'user-1',
    toolsUsed: [],
    config: {} as any,
    ...overrides,
  };
}

function makeStage(name: string, order: number, result: { prompt: string; metadata?: Record<string, unknown> }, enabled = true): EnrichmentStage {
  return {
    name,
    order,
    enabled: () => enabled,
    enrich: vi.fn(async (_ctx, _prompt) => result),
  };
}

describe('EnrichmentPipeline', () => {
  it('runs stages in order and returns final prompt', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('b', 200, { prompt: 'after-b' }));
    pipeline.addStage(makeStage('a', 100, { prompt: 'after-a' }));

    const result = await pipeline.run(makeCtx());
    expect(result.metadata.stages).toEqual(['a', 'b']);
    expect(result.prompt).toBe('after-b');
  });

  it('skips disabled stages', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('enabled', 100, { prompt: 'yes' }));
    pipeline.addStage(makeStage('disabled', 200, { prompt: 'no' }, false));

    const result = await pipeline.run(makeCtx());
    expect(result.metadata.stages).toEqual(['enabled']);
    expect(result.prompt).toBe('yes');
  });

  it('merges metadata from multiple stages', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('a', 100, { prompt: 'p', metadata: { foo: 1 } }));
    pipeline.addStage(makeStage('b', 200, { prompt: 'p2', metadata: { bar: 2 } }));

    const result = await pipeline.run(makeCtx());
    expect(result.metadata.foo).toBe(1);
    expect(result.metadata.bar).toBe(2);
    expect(result.metadata.stages).toEqual(['a', 'b']);
  });

  it('passes current prompt to next stage', async () => {
    const pipeline = new EnrichmentPipeline();
    const stageA: EnrichmentStage = {
      name: 'a',
      order: 100,
      enabled: () => true,
      enrich: vi.fn(async (_ctx, prompt) => ({ prompt: prompt + '+a' })),
    };
    const stageB: EnrichmentStage = {
      name: 'b',
      order: 200,
      enabled: () => true,
      enrich: vi.fn(async (_ctx, prompt) => ({ prompt: prompt + '+b' })),
    };
    pipeline.addStage(stageB);
    pipeline.addStage(stageA);

    const result = await pipeline.run(makeCtx());
    expect(result.prompt).toBe('base prompt+a+b');
  });

  it('returns base prompt when no stages are enabled', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('off', 100, { prompt: 'never' }, false));

    const result = await pipeline.run(makeCtx());
    expect(result.prompt).toBe('base prompt');
    expect(result.metadata.stages).toEqual([]);
  });
});
