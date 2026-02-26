import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOpenRouterModels, mapToDiscoveredModels } from '../src/discovery.js';
import type { OpenRouterModel } from '../src/types.js';

const sampleModel: OpenRouterModel = {
  id: 'anthropic/claude-3-opus',
  name: 'Claude 3 Opus',
  description: 'Most capable Claude model',
  context_length: 200000,
  architecture: {
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tokenizer: 'claude',
  },
  pricing: {
    prompt: '0.000003',
    completion: '0.000015',
  },
  supported_parameters: ['tools', 'temperature', 'max_tokens'],
  top_provider: {
    max_completion_tokens: 4096,
  },
};

const textOnlyModel: OpenRouterModel = {
  id: 'meta-llama/llama-3-70b',
  name: 'Llama 3 70B',
  context_length: 8192,
  architecture: {
    input_modalities: ['text'],
    output_modalities: ['text'],
    tokenizer: 'llama',
  },
  pricing: {
    prompt: '0.0000008',
    completion: '0.0000008',
  },
};

describe('fetchOpenRouterModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches models from OpenRouter API', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [sampleModel] }),
    } as Response);

    const models = await fetchOpenRouterModels('test-key');

    expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': 'Bearer test-key',
        'HTTP-Referer': 'https://auxiora.dev',
        'X-Title': 'Auxiora',
      },
    });
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('anthropic/claude-3-opus');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(fetchOpenRouterModels('bad-key')).rejects.toThrow('OpenRouter API error: 401 Unauthorized');
  });
});

describe('mapToDiscoveredModels', () => {
  it('maps OpenRouter models to DiscoveredModelLike', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);

    expect(discovered).toHaveLength(1);
    const d = discovered[0];
    expect(d.id).toBe('openrouter:anthropic/claude-3-opus');
    expect(d.providerSource).toBe('openrouter');
    expect(d.modelId).toBe('anthropic/claude-3-opus');
    expect(d.displayName).toBe('Claude 3 Opus');
    expect(d.contextLength).toBe(200000);
    expect(d.enabled).toBe(true);
  });

  it('detects vision from input_modalities', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].supportsVision).toBe(true);

    const textOnly = mapToDiscoveredModels([textOnlyModel]);
    expect(textOnly[0].supportsVision).toBe(false);
  });

  it('detects tools from supported_parameters', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].supportsTools).toBe(true);

    const noTools = mapToDiscoveredModels([textOnlyModel]);
    expect(noTools[0].supportsTools).toBe(false);
  });

  it('converts per-token pricing to per-1k pricing', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    // 0.000003 per token * 1000 = 0.003 per 1k tokens
    expect(discovered[0].costPer1kInput).toBeCloseTo(0.003, 6);
    expect(discovered[0].costPer1kOutput).toBeCloseTo(0.015, 6);
  });

  it('sets streaming to true for all models', () => {
    const discovered = mapToDiscoveredModels([sampleModel, textOnlyModel]);
    expect(discovered[0].supportsStreaming).toBe(true);
    expect(discovered[1].supportsStreaming).toBe(true);
  });

  it('includes raw metadata as JSON string', () => {
    const discovered = mapToDiscoveredModels([sampleModel]);
    expect(discovered[0].rawMetadata).toBeDefined();
    const parsed = JSON.parse(discovered[0].rawMetadata!);
    expect(parsed.id).toBe('anthropic/claude-3-opus');
  });
});
