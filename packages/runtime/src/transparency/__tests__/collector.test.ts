import { describe, it, expect } from 'vitest';
import { collectTransparencyMeta } from '../collector.js';
import type { ArchitectMeta, EnrichmentResult } from '../../enrichment/types.js';

function makeArchitectMeta(overrides?: Partial<ArchitectMeta>): ArchitectMeta {
  return {
    detectedContext: { domain: 'code_engineering', confidence: 0.85 },
    activeTraits: [{ name: 'precise', weight: 0.82 }, { name: 'thorough', weight: 0.74 }],
    traitWeights: { precise: 0.82, thorough: 0.74 },
    escalationAlert: false,
    channelType: 'webchat',
    ...overrides,
  };
}

function makeEnrichment(meta?: Partial<ArchitectMeta>): EnrichmentResult {
  return {
    prompt: 'enriched prompt',
    metadata: {
      architect: makeArchitectMeta(meta),
      stages: ['memory', 'mode', 'architect', 'self-awareness', 'model-identity'],
    },
  };
}

describe('collectTransparencyMeta', () => {
  it('assembles full metadata from all sources', () => {
    const result = collectTransparencyMeta({
      enrichment: makeEnrichment(),
      completion: {
        content: 'The answer is 42.',
        usage: { inputTokens: 156, outputTokens: 278 },
        model: 'claude-3.5-sonnet',
        finishReason: 'stop',
        toolUse: [{ name: 'web_search' }],
      },
      capabilities: { costPer1kInput: 0.008, costPer1kOutput: 0.024 },
      providerName: 'anthropic',
      awarenessSignals: [],
      responseText: 'The answer is 42.',
      processingStartTime: Date.now() - 1500,
    });

    expect(result.confidence.level).toBe('high');
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.75);
    expect(result.sources.find(s => s.type === 'tool_result')).toBeDefined();
    expect(result.model.provider).toBe('anthropic');
    expect(result.model.model).toBe('claude-3.5-sonnet');
    expect(result.model.tokens.input).toBe(156);
    expect(result.model.tokens.output).toBe(278);
    expect(result.model.cost.total).toBeGreaterThan(0);
    expect(result.model.finishReason).toBe('stop');
    expect(result.personality.domain).toBe('code_engineering');
    expect(result.personality.activeTraits).toHaveLength(2);
    expect(result.trace.enrichmentStages).toHaveLength(5);
    expect(result.trace.toolsUsed).toEqual(['web_search']);
  });

  it('extracts knowledge boundary from awareness signals', () => {
    const result = collectTransparencyMeta({
      enrichment: makeEnrichment(),
      completion: {
        content: 'Response text',
        usage: { inputTokens: 100, outputTokens: 200 },
        model: 'claude-3.5-sonnet',
        finishReason: 'stop',
      },
      capabilities: { costPer1kInput: 0.008, costPer1kOutput: 0.024 },
      providerName: 'anthropic',
      awarenessSignals: [{
        dimension: 'knowledge-boundary',
        data: { topic: 'kubernetes networking', corrections: 2, hedges: 1 },
      }],
      responseText: 'Response text',
      processingStartTime: Date.now() - 800,
    });

    expect(result.personality.knowledgeBoundary).toEqual({
      topic: 'kubernetes networking',
      corrections: 2,
    });
    expect(result.confidence.factors.find(f => f.signal === 'knowledge_boundary')).toBeDefined();
  });

  it('calculates cost from capabilities', () => {
    const result = collectTransparencyMeta({
      enrichment: makeEnrichment(),
      completion: {
        content: 'Test',
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: 'claude-3.5-sonnet',
        finishReason: 'stop',
      },
      capabilities: { costPer1kInput: 0.003, costPer1kOutput: 0.015 },
      providerName: 'openai',
      awarenessSignals: [],
      responseText: 'Test',
      processingStartTime: Date.now() - 500,
    });

    expect(result.model.cost.input).toBeCloseTo(0.003, 4);
    expect(result.model.cost.output).toBeCloseTo(0.0075, 4);
    expect(result.model.cost.total).toBeCloseTo(0.0105, 4);
  });

  it('handles missing enrichment gracefully', () => {
    const result = collectTransparencyMeta({
      enrichment: { prompt: 'base', metadata: { stages: [] } },
      completion: {
        content: 'Simple response.',
        usage: { inputTokens: 50, outputTokens: 100 },
        model: 'gpt-4o',
        finishReason: 'stop',
      },
      capabilities: { costPer1kInput: 0.005, costPer1kOutput: 0.015 },
      providerName: 'openai',
      awarenessSignals: [],
      responseText: 'Simple response.',
      processingStartTime: Date.now() - 300,
    });

    expect(result.personality.domain).toBe('general');
    expect(result.personality.activeTraits).toEqual([]);
    expect(result.trace.enrichmentStages).toEqual([]);
  });

  it('detects escalation alert', () => {
    const result = collectTransparencyMeta({
      enrichment: makeEnrichment({ escalationAlert: true }),
      completion: {
        content: 'I think this could be wrong.',
        usage: { inputTokens: 100, outputTokens: 200 },
        model: 'claude-3.5-sonnet',
        finishReason: 'stop',
      },
      capabilities: { costPer1kInput: 0.008, costPer1kOutput: 0.024 },
      providerName: 'anthropic',
      awarenessSignals: [],
      responseText: 'I think this could be wrong.',
      processingStartTime: Date.now() - 600,
    });

    expect(result.confidence.factors.find(f => f.signal === 'escalation_flagged')).toBeDefined();
  });
});
