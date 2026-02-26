import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../src/registry.js';
import type { DiscoveredModel } from '../src/types.js';

function makeModel(overrides: Partial<DiscoveredModel> = {}): DiscoveredModel {
  const now = Date.now();
  return {
    id: 'openrouter:test/model-1',
    providerSource: 'openrouter',
    modelId: 'test/model-1',
    displayName: 'Test Model 1',
    contextLength: 128000,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsImageGen: false,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    strengths: ['reasoning', 'code'],
    lastRefreshedAt: now,
    createdAt: now,
    enabled: true,
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry(':memory:');
  });

  describe('upsertModels', () => {
    it('should insert models and retrieve them', () => {
      const model = makeModel();
      registry.upsertModels([model]);

      const result = registry.getModel('openrouter:test/model-1');
      expect(result).toBeDefined();
      expect(result!.displayName).toBe('Test Model 1');
      expect(result!.supportsVision).toBe(true);
      expect(result!.strengths).toEqual(['reasoning', 'code']);
    });

    it('should upsert (update on conflict)', () => {
      const model = makeModel();
      registry.upsertModels([model]);

      const updated = makeModel({ displayName: 'Updated Name', costPer1kInput: 0.005 });
      registry.upsertModels([updated]);

      const result = registry.getModel('openrouter:test/model-1');
      expect(result!.displayName).toBe('Updated Name');
      expect(result!.costPer1kInput).toBe(0.005);
    });

    it('should insert multiple models at once', () => {
      const models = [
        makeModel({ id: 'openrouter:a/model-a', modelId: 'a/model-a', displayName: 'Model A' }),
        makeModel({ id: 'openrouter:b/model-b', modelId: 'b/model-b', displayName: 'Model B' }),
        makeModel({ id: 'openrouter:c/model-c', modelId: 'c/model-c', displayName: 'Model C' }),
      ];
      registry.upsertModels(models);

      const all = registry.getModels();
      expect(all).toHaveLength(3);
    });
  });

  describe('getModels', () => {
    beforeEach(() => {
      registry.upsertModels([
        makeModel({ id: 'openrouter:a/big', modelId: 'a/big', displayName: 'Big Model', providerSource: 'openrouter', supportsVision: true }),
        makeModel({ id: 'openrouter:a/small', modelId: 'a/small', displayName: 'Small Model', providerSource: 'openrouter', supportsVision: false }),
        makeModel({ id: 'huggingface:b/chat', modelId: 'b/chat', displayName: 'Chat Model', providerSource: 'huggingface', supportsVision: false }),
      ]);
    });

    it('should filter by source', () => {
      const result = registry.getModels({ source: 'openrouter' });
      expect(result).toHaveLength(2);
      expect(result.every(m => m.providerSource === 'openrouter')).toBe(true);
    });

    it('should filter by vision support', () => {
      const result = registry.getModels({ supportsVision: true });
      expect(result).toHaveLength(1);
      expect(result[0]!.displayName).toBe('Big Model');
    });

    it('should search by query', () => {
      const result = registry.getModels({ query: 'chat' });
      expect(result).toHaveLength(1);
      expect(result[0]!.displayName).toBe('Chat Model');
    });

    it('should support limit and offset', () => {
      const page1 = registry.getModels({ limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);

      const page2 = registry.getModels({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });
  });

  describe('getModel', () => {
    it('should return undefined for non-existent model', () => {
      const result = registry.getModel('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('toModelCapabilities', () => {
    it('should convert to ModelCapabilities format', () => {
      registry.upsertModels([
        makeModel({ id: 'openrouter:a/model', modelId: 'a/model', providerSource: 'openrouter' }),
      ]);

      const caps = registry.toModelCapabilities('openrouter');
      expect(caps['a/model']).toBeDefined();
      expect(caps['a/model']!.maxContextTokens).toBe(128000);
      expect(caps['a/model']!.supportsVision).toBe(true);
      expect(caps['a/model']!.isLocal).toBe(false);
      expect(caps['a/model']!.strengths).toEqual(['reasoning', 'code']);
    });

    it('should exclude disabled models', () => {
      registry.upsertModels([
        makeModel({ id: 'openrouter:a/enabled', modelId: 'a/enabled', enabled: true }),
        makeModel({ id: 'openrouter:a/disabled', modelId: 'a/disabled', enabled: false }),
      ]);

      const caps = registry.toModelCapabilities('openrouter');
      expect(caps['a/enabled']).toBeDefined();
      expect(caps['a/disabled']).toBeUndefined();
    });
  });

  describe('search', () => {
    it('should search by display name and model ID', () => {
      registry.upsertModels([
        makeModel({ id: 'or:anthropic/claude-3-opus', modelId: 'anthropic/claude-3-opus', displayName: 'Claude 3 Opus' }),
        makeModel({ id: 'or:meta/llama-3', modelId: 'meta/llama-3', displayName: 'Llama 3' }),
      ]);

      const results = registry.search('claude');
      expect(results).toHaveLength(1);
      expect(results[0]!.displayName).toBe('Claude 3 Opus');
    });
  });

  describe('getTrending', () => {
    it('should return models sorted by trending score', () => {
      registry.upsertModels([
        makeModel({ id: 'hf:a', modelId: 'a', providerSource: 'huggingface', hfTrendingScore: 0.8 }),
        makeModel({ id: 'hf:b', modelId: 'b', providerSource: 'huggingface', hfTrendingScore: 0.95 }),
        makeModel({ id: 'hf:c', modelId: 'c', providerSource: 'huggingface', hfTrendingScore: 0.5 }),
      ]);

      const trending = registry.getTrending(2);
      expect(trending).toHaveLength(2);
      expect(trending[0]!.modelId).toBe('b');
      expect(trending[1]!.modelId).toBe('a');
    });

    it('should exclude models without trending score', () => {
      registry.upsertModels([
        makeModel({ id: 'or:x', modelId: 'x', providerSource: 'openrouter' }),
        makeModel({ id: 'hf:y', modelId: 'y', providerSource: 'huggingface', hfTrendingScore: 0.5 }),
      ]);

      const trending = registry.getTrending();
      expect(trending).toHaveLength(1);
      expect(trending[0]!.modelId).toBe('y');
    });
  });

  describe('pruneStale', () => {
    it('should delete models older than maxAge', () => {
      const old = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const recent = Date.now();

      registry.upsertModels([
        makeModel({ id: 'or:old', modelId: 'old', lastRefreshedAt: old }),
        makeModel({ id: 'or:new', modelId: 'new', lastRefreshedAt: recent }),
      ]);

      const pruned = registry.pruneStale(7 * 24 * 60 * 60 * 1000); // 7 days
      expect(pruned).toBe(1);

      const remaining = registry.getModels();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.modelId).toBe('new');
    });
  });

  describe('setEnabled', () => {
    it('should disable and re-enable a model', () => {
      registry.upsertModels([makeModel()]);

      registry.setEnabled('openrouter:test/model-1', false);
      let model = registry.getModel('openrouter:test/model-1');
      expect(model!.enabled).toBe(false);

      registry.setEnabled('openrouter:test/model-1', true);
      model = registry.getModel('openrouter:test/model-1');
      expect(model!.enabled).toBe(true);
    });
  });

  describe('HuggingFace-specific fields', () => {
    it('should persist and retrieve HF metadata', () => {
      registry.upsertModels([
        makeModel({
          id: 'hf:meta/llama',
          modelId: 'meta/llama',
          providerSource: 'huggingface',
          hfModelCard: '# Llama\n\nA great model.',
          hfDownloads: 1500000,
          hfLikes: 5000,
          hfTrendingScore: 0.92,
          hfTags: ['transformers', 'pytorch', 'llama'],
          hfBenchmarkScores: { mmlu: 0.82, humaneval: 0.71 },
          hfInferenceProviders: ['together', 'fireworks-ai'],
        }),
      ]);

      const model = registry.getModel('hf:meta/llama')!;
      expect(model.hfModelCard).toBe('# Llama\n\nA great model.');
      expect(model.hfDownloads).toBe(1500000);
      expect(model.hfLikes).toBe(5000);
      expect(model.hfTrendingScore).toBe(0.92);
      expect(model.hfTags).toEqual(['transformers', 'pytorch', 'llama']);
      expect(model.hfBenchmarkScores).toEqual({ mmlu: 0.82, humaneval: 0.71 });
      expect(model.hfInferenceProviders).toEqual(['together', 'fireworks-ai']);
    });
  });
});
