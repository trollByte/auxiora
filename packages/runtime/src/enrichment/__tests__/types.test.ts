import { describe, it, expect } from 'vitest';
import type { EnrichmentContext, EnrichmentStage, StageResult, EnrichmentResult, ArchitectMeta } from '../types.js';

describe('EnrichmentPipeline types', () => {
  it('EnrichmentContext is structurally valid', () => {
    const ctx: EnrichmentContext = {
      basePrompt: 'base',
      userMessage: 'hello',
      history: [{ role: 'user', content: 'hi' }],
      channelType: 'webchat',
      chatId: 'chat-1',
      sessionId: 'sess-1',
      userId: 'user-1',
      toolsUsed: [{ name: 'web_search', success: true }],
      config: {} as any,
    };
    expect(ctx.channelType).toBe('webchat');
  });

  it('StageResult accepts prompt-only or prompt+metadata', () => {
    const minimal: StageResult = { prompt: 'p' };
    const full: StageResult = { prompt: 'p', metadata: { foo: 1 } };
    expect(minimal.prompt).toBe('p');
    expect(full.metadata).toEqual({ foo: 1 });
  });

  it('EnrichmentResult has stages array', () => {
    const result: EnrichmentResult = {
      prompt: 'enriched',
      metadata: { stages: ['memory', 'mode'] },
    };
    expect(result.metadata.stages).toHaveLength(2);
  });
});
