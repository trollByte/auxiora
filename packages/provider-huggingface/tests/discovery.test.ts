import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchHFModels, mapToDiscoveredModels } from '../src/discovery.js';
import type { HFModel } from '../src/types.js';

const sampleModel: HFModel = {
  _id: '64abc123',
  id: 'Qwen/Qwen2.5-72B-Instruct',
  modelId: 'Qwen/Qwen2.5-72B-Instruct',
  author: 'Qwen',
  pipeline_tag: 'text-generation',
  tags: ['transformers', 'conversational'],
  downloads: 500000,
  likes: 2000,
  trending_score: 0.95,
  inferenceProviderMapping: {
    'cerebras': { status: 'available', providerId: 'cerebras-qwen', task: 'text-generation' },
    'together': { status: 'available', providerId: 'together-qwen', task: 'text-generation' },
    'fireworks-ai': { status: 'available', providerId: 'fw-qwen', task: 'text-generation' },
  },
};

const visionModel: HFModel = {
  _id: '64def456',
  id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
  modelId: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
  author: 'meta-llama',
  pipeline_tag: 'image-text-to-text',
  tags: ['transformers', 'vision'],
  downloads: 100000,
  likes: 500,
  inferenceProviderMapping: {
    'hf-inference': { status: 'available', providerId: 'hf-llama-vision', task: 'image-text-to-text' },
  },
};

const baseModel: HFModel = {
  _id: '64ghi789',
  id: 'bigscience/bloom-560m',
  modelId: 'bigscience/bloom-560m',
  author: 'bigscience',
  pipeline_tag: 'text-generation',
  tags: ['transformers'],
  downloads: 50000,
  likes: 100,
};

describe('fetchHFModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches models from HuggingFace API', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [sampleModel],
    } as Response);

    const models = await fetchHFModels('test-key');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://huggingface.co/api/models?inference_provider=all&pipeline_tag=text-generation&sort=trending&limit=100&expand[]=inferenceProviderMapping',
      { headers: { 'Authorization': 'Bearer test-key' } },
    );
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('Qwen/Qwen2.5-72B-Instruct');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(fetchHFModels('bad-key')).rejects.toThrow('HuggingFace API error: 401 Unauthorized');
  });
});

describe('mapToDiscoveredModels', () => {
  it('maps HF models with huggingface: ID prefix', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);

    expect(discovered).toHaveLength(1);
    const d = discovered[0];
    expect(d.id).toBe('huggingface:Qwen/Qwen2.5-72B-Instruct');
    expect(d.providerSource).toBe('huggingface');
    expect(d.modelId).toBe('Qwen/Qwen2.5-72B-Instruct');
    expect(d.displayName).toBe('Qwen/Qwen2.5-72B-Instruct');
    expect(d.enabled).toBe(true);
  });

  it('detects vision from pipeline_tag', () => {
    const discovered = mapToDiscoveredModels([visionModel]);
    expect(discovered[0].supportsVision).toBe(true);

    const textOnly = mapToDiscoveredModels([sampleModel]);
    expect(textOnly[0].supportsVision).toBe(false);
  });

  it('infers tools support from instruct/chat in ID or conversational tag', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].supportsTools).toBe(true);

    const noTools = mapToDiscoveredModels([baseModel]);
    expect(noTools[0].supportsTools).toBe(false);
  });

  it('includes trending score', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].hfTrendingScore).toBe(0.95);
  });

  it('lists inference providers', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].hfInferenceProviders).toEqual(
      expect.arrayContaining(['cerebras', 'together', 'fireworks-ai']),
    );
    expect(discovered[0].hfInferenceProviders).toHaveLength(3);
  });

  it('uses cheapest provider for pricing', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    // cerebras is cheapest at 0.0001/0.0001
    expect(discovered[0].costPer1kInput).toBe(0.0001);
    expect(discovered[0].costPer1kOutput).toBe(0.0001);
  });

  it('uses preferred provider pricing when specified', () => {
    const discovered = mapToDiscoveredModels([sampleModel], 'fireworks-ai');
    expect(discovered[0].costPer1kInput).toBe(0.0009);
    expect(discovered[0].costPer1kOutput).toBe(0.0009);
  });

  it('infers context length for known model families', () => {
    const discovered = mapToDiscoveredModels([sampleModel]); // Qwen2
    expect(discovered[0].contextLength).toBe(131072);
  });

  it('infers strengths from model ID', () => {
    const discovered = mapToDiscoveredModels([sampleModel]); // 72B
    expect(discovered[0].strengths).toContain('reasoning');
    expect(discovered[0].strengths).toContain('code');
  });

  it('sets streaming to true for all models', () => {
    const discovered = mapToDiscoveredModels([sampleModel, visionModel, baseModel]);
    for (const d of discovered) {
      expect(d.supportsStreaming).toBe(true);
    }
  });

  it('includes HF download and like counts', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].hfDownloads).toBe(500000);
    expect(discovered[0].hfLikes).toBe(2000);
  });
});
