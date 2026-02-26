import { describe, it, expect } from 'vitest';
import { LearningStage } from '../../src/enrichment/stages/learning-stage.js';
import type { EnrichmentContext } from '../../src/enrichment/types.js';

const makeCtx = (overrides?: Partial<EnrichmentContext>): EnrichmentContext => ({
  basePrompt: 'You are a helpful assistant.',
  userMessage: 'Hello',
  history: [],
  channelType: 'web',
  chatId: 'chat-1',
  sessionId: 'sess-1',
  userId: 'user-1',
  toolsUsed: [],
  config: {} as any,
  ...overrides,
});

describe('LearningStage', () => {
  it('is disabled when no learnings exist', () => {
    const stage = new LearningStage(() => []);
    expect(stage.enabled(makeCtx())).toBe(false);
  });

  it('is enabled when learnings exist', () => {
    const stage = new LearningStage(() => [
      { content: 'Cache responses', category: 'note', occurrences: 1 },
    ]);
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('injects learnings into prompt', async () => {
    const stage = new LearningStage(() => [
      { content: 'Always validate input', category: 'warning', occurrences: 3 },
      { content: 'Use retry for transient failures', category: 'pattern', occurrences: 1 },
    ]);
    stage.enabled(makeCtx());
    const result = await stage.enrich(makeCtx(), 'Base prompt.');
    expect(result.prompt).toContain('[Learned Patterns]');
    expect(result.prompt).toContain('Always validate input');
    expect(result.prompt).toContain('Use retry for transient failures');
    expect(result.prompt).toContain('(seen 3x)');
  });

  it('has order 55', () => {
    const stage = new LearningStage(() => []);
    expect(stage.order).toBe(55);
  });

  it('returns metadata with learning count', async () => {
    const stage = new LearningStage(() => [
      { content: 'test', category: 'note', occurrences: 1 },
    ]);
    stage.enabled(makeCtx());
    const result = await stage.enrich(makeCtx(), 'prompt');
    expect(result.metadata).toEqual({ learningCount: 1 });
  });

  it('falls back to getter if enabled() was not called', async () => {
    const stage = new LearningStage(() => [
      { content: 'fallback works', category: 'note', occurrences: 1 },
    ]);
    const result = await stage.enrich(makeCtx(), 'prompt');
    expect(result.prompt).toContain('fallback works');
  });
});
