import { describe, it, expect, vi } from 'vitest';
import { EnrichmentPipeline } from '../pipeline.js';
import { MemoryStage } from '../stages/memory-stage.js';
import { ArchitectStage } from '../stages/architect-stage.js';
import { SelfAwarenessStage } from '../stages/self-awareness-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'You are Auxiora.',
    userMessage: 'How do I fix this security vulnerability?',
    history: [
      { role: 'user', content: 'I have a Node.js app with SQL injection' },
      { role: 'assistant', content: 'Let me help you fix that.' },
    ],
    channelType: 'discord',
    chatId: 'discord:general',
    sessionId: 'sess-42',
    userId: 'user-7',
    toolsUsed: [{ name: 'web_search', success: true }],
    config: { agent: { personality: 'the-architect' }, modes: { enabled: false } } as any,
    ...overrides,
  };
}

describe('EnrichmentPipeline integration', () => {
  it('runs full pipeline with memory + architect + self-awareness', async () => {
    const pipeline = new EnrichmentPipeline();

    const memStore = { getAll: vi.fn().mockResolvedValue([{ text: 'user prefers TypeScript' }]) };
    const memRetriever = { retrieve: vi.fn().mockReturnValue('\n\n[Memories]\n- user prefers TypeScript') };
    pipeline.addStage(new MemoryStage(memStore as any, memRetriever as any));

    const architect = {
      generatePrompt: vi.fn().mockReturnValue({
        contextModifier: '[Security Expert Mode]',
        detectedContext: { domain: 'security_review' },
        activeTraits: [{ trait: 'munger', source: 'base' }],
        emotionalTrajectory: 'stable',
        escalationAlert: false,
        relevantDecisions: [],
        feedbackInsight: { weakDomains: [], trend: 'stable', suggestedAdjustments: {} },
      }),
      getTraitMix: vi.fn().mockReturnValue({ mungerThinking: 0.9 }),
    };
    const collector = { updateToolContext: vi.fn() };
    pipeline.addStage(new ArchitectStage(architect as any, undefined, collector as any));

    const awarenessAssembler = {
      assemble: vi.fn().mockResolvedValue('Capacity at 60%.'),
    };
    pipeline.addStage(new SelfAwarenessStage(awarenessAssembler as any));

    const result = await pipeline.run(makeCtx());

    // Verify pipeline ordering
    expect(result.metadata.stages).toEqual(['memory', 'architect', 'self-awareness']);

    // Verify history was passed (GAP 1)
    expect(architect.generatePrompt).toHaveBeenCalledWith(
      'How do I fix this security vulnerability?',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user' }),
      ]),
    );

    // Verify tool tracking (GAP 2)
    expect(collector.updateToolContext).toHaveBeenCalledWith([{ name: 'web_search', success: true }]);

    // Verify channel hint (GAP 3)
    expect(result.prompt).toContain('[Channel: discord]');

    // Verify metadata (GAP 4)
    expect(result.metadata.architect).toBeDefined();
    expect((result.metadata.architect as any).detectedContext.domain).toBe('security_review');
    expect((result.metadata.architect as any).channelType).toBe('discord');

    // Verify all sections present
    expect(result.prompt).toContain('You are Auxiora.');
    expect(result.prompt).toContain('[Memories]');
    expect(result.prompt).toContain('[Security Expert Mode]');
    expect(result.prompt).toContain('[Dynamic Self-Awareness]');
  });

  it('skips architect stage for non-architect personality', async () => {
    const pipeline = new EnrichmentPipeline();
    const architect = { generatePrompt: vi.fn(), getTraitMix: vi.fn() };
    pipeline.addStage(new ArchitectStage(architect as any));

    const result = await pipeline.run(makeCtx({
      config: { agent: { personality: 'standard' }, modes: { enabled: false } } as any,
    }));

    expect(result.metadata.stages).toEqual([]);
    expect(architect.generatePrompt).not.toHaveBeenCalled();
  });
});
