import { describe, it, expect } from 'vitest';
import { HFModelAdvisor } from '../src/advisor.js';
import type { DiscoveredModelLike } from '../src/types.js';

function makeModel(overrides: Partial<DiscoveredModelLike>): DiscoveredModelLike {
  return {
    id: 'huggingface:test/model',
    providerSource: 'huggingface',
    modelId: 'test/model',
    displayName: 'test/model',
    contextLength: 8192,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsImageGen: false,
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.0005,
    strengths: ['general'],
    hfDownloads: 10000,
    hfLikes: 100,
    hfTrendingScore: 0.5,
    lastRefreshedAt: Date.now(),
    createdAt: Date.now(),
    enabled: true,
    ...overrides,
  };
}

describe('HFModelAdvisor', () => {
  describe('advise', () => {
    it('returns recommended model matching task type', () => {
      const models = [
        makeModel({ modelId: 'code-model', strengths: ['code'] }),
        makeModel({ modelId: 'general-model', strengths: ['general'] }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('code');

      expect(result.recommended).toBe('code-model');
      expect(result.reasoning).toContain('code');
    });

    it('filters by maxCost', () => {
      const models = [
        makeModel({ modelId: 'expensive', costPer1kInput: 0.01, strengths: ['code'] }),
        makeModel({ modelId: 'cheap', costPer1kInput: 0.0001, strengths: ['code'] }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('code', { maxCost: 0.001 });

      expect(result.recommended).toBe('cheap');
    });

    it('filters by minContext', () => {
      const models = [
        makeModel({ modelId: 'small-ctx', contextLength: 4096 }),
        makeModel({ modelId: 'large-ctx', contextLength: 128000 }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('general', { minContext: 32000 });

      expect(result.recommended).toBe('large-ctx');
    });

    it('filters by needsVision', () => {
      const models = [
        makeModel({ modelId: 'text-only', supportsVision: false }),
        makeModel({ modelId: 'vision-model', supportsVision: true }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('general', { needsVision: true });

      expect(result.recommended).toBe('vision-model');
    });

    it('returns empty recommendation when no models match', () => {
      const models = [
        makeModel({ modelId: 'text-only', supportsVision: false }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('general', { needsVision: true });

      expect(result.recommended).toBe('');
      expect(result.reasoning).toContain('No models match');
      expect(result.alternatives).toHaveLength(0);
    });

    it('returns alternatives', () => {
      const models = [
        makeModel({ modelId: 'model-a', hfTrendingScore: 0.9 }),
        makeModel({ modelId: 'model-b', hfTrendingScore: 0.7 }),
        makeModel({ modelId: 'model-c', hfTrendingScore: 0.5 }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('general');

      expect(result.alternatives.length).toBeGreaterThan(0);
      expect(result.alternatives[0].model).toBeDefined();
    });

    it('skips disabled models', () => {
      const models = [
        makeModel({ modelId: 'disabled', enabled: false, hfTrendingScore: 0.99 }),
        makeModel({ modelId: 'enabled', enabled: true, hfTrendingScore: 0.1 }),
      ];
      const advisor = new HFModelAdvisor(models);

      const result = advisor.advise('general');

      expect(result.recommended).toBe('enabled');
    });
  });

  describe('compare', () => {
    it('returns comparison with dimension winners', () => {
      const models = [
        makeModel({ modelId: 'model-a', contextLength: 128000, costPer1kInput: 0.001, costPer1kOutput: 0.001, hfDownloads: 500000, hfLikes: 2000, hfTrendingScore: 0.9 }),
        makeModel({ modelId: 'model-b', contextLength: 8192, costPer1kInput: 0.0001, costPer1kOutput: 0.0001, hfDownloads: 100000, hfLikes: 500, hfTrendingScore: 0.3 }),
      ];
      const advisor = new HFModelAdvisor(models);

      const comparison = advisor.compare('model-a', 'model-b');

      expect(comparison.modelA).toBe('model-a');
      expect(comparison.modelB).toBe('model-b');
      expect(comparison.benchmarks.context_length.winner).toBe('model-a');
      expect(comparison.benchmarks.cost_input.winner).toBe('model-b'); // lower cost = higher negated value
      expect(comparison.benchmarks.downloads.winner).toBe('model-a');
      expect(comparison.benchmarks.likes.winner).toBe('model-a');
      expect(comparison.benchmarks.trending.winner).toBe('model-a');
      expect(comparison.recommendation).toContain('model-a');
    });

    it('handles missing models gracefully', () => {
      const advisor = new HFModelAdvisor([]);

      const comparison = advisor.compare('nonexistent-a', 'nonexistent-b');

      expect(comparison.benchmarks.context_length.a).toBeNull();
      expect(comparison.benchmarks.context_length.b).toBeNull();
      expect(comparison.recommendation).toContain('comparable');
    });

    it('detects ties', () => {
      const models = [
        makeModel({ modelId: 'model-a', contextLength: 8192, costPer1kInput: 0.0005, costPer1kOutput: 0.0005, hfDownloads: 10000, hfLikes: 100, hfTrendingScore: 0.5 }),
        makeModel({ modelId: 'model-b', contextLength: 8192, costPer1kInput: 0.0005, costPer1kOutput: 0.0005, hfDownloads: 10000, hfLikes: 100, hfTrendingScore: 0.5 }),
      ];
      const advisor = new HFModelAdvisor(models);

      const comparison = advisor.compare('model-a', 'model-b');

      expect(comparison.recommendation).toContain('comparable');
    });
  });
});
