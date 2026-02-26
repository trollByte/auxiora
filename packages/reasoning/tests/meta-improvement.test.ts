import { describe, it, expect } from 'vitest';
import { MetaImprovementStructure } from '../src/meta-improvement.js';
import type { ImprovementProposal } from '../src/improvement-types.js';

describe('MetaImprovementStructure', () => {
  it('creates a 4-step reasoning structure', () => {
    const meta = new MetaImprovementStructure();
    const progress = meta.getProgress();

    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(0);
    expect(meta.getCurrentStepName()).toBe('observe');
  });

  it('progresses through steps in order', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', {
      metrics: { accuracy: 0.85, latency_p50: 200 },
      anomalies: ['High error rate on code reviews'],
    });
    expect(meta.getCurrentStepName()).toBe('reflect');

    meta.completeStep('reflect', {
      patterns: ['Code review errors correlate with long inputs'],
      rootCauses: ['Context window truncation on large diffs'],
    });
    expect(meta.getCurrentStepName()).toBe('hypothesize');

    meta.completeStep('hypothesize', {
      proposals: [
        { change: 'Chunk large diffs before review', confidence: 0.8 },
        { change: 'Increase context window budget', confidence: 0.6 },
      ],
    });
    expect(meta.getCurrentStepName()).toBe('validate');
  });

  it('builds improvement proposal from step outputs', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', { metrics: { accuracy: 0.85 } });
    meta.completeStep('reflect', { patterns: ['Error on long inputs'] });
    meta.completeStep('hypothesize', {
      proposals: [{ change: 'Chunk inputs', confidence: 0.8 }],
    });
    meta.completeStep('validate', {
      testResults: [{ proposal: 'Chunk inputs', passed: true, improvement: 0.12 }],
    });

    expect(meta.isComplete()).toBe(true);
    const proposal = meta.buildProposal();
    expect(proposal).toBeDefined();
    expect(proposal!.observations).toBeDefined();
    expect(proposal!.reflections).toBeDefined();
    expect(proposal!.hypotheses).toBeDefined();
    expect(proposal!.validations).toBeDefined();
    expect(proposal!.status).toBe('pending_review');
  });

  it('generates tools for the current step', () => {
    const meta = new MetaImprovementStructure();
    const tools = meta.getCurrentTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toContain('observe');
  });

  it('returns empty tools when all steps are complete', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', { metrics: {} });
    meta.completeStep('reflect', { patterns: [] });
    meta.completeStep('hypothesize', { proposals: [] });
    meta.completeStep('validate', { testResults: [] });

    const tools = meta.getCurrentTools();
    expect(tools).toHaveLength(0);
  });

  it('rejects completing steps out of order', () => {
    const meta = new MetaImprovementStructure();

    expect(() => meta.completeStep('reflect', { patterns: [] })).toThrow();
  });

  it('provides step descriptions for LLM context', () => {
    const meta = new MetaImprovementStructure();
    const descriptions = meta.getStepDescriptions();

    expect(descriptions).toHaveLength(4);
    expect(descriptions[0].name).toBe('observe');
    expect(descriptions[0].description).toBeTruthy();
  });
});
