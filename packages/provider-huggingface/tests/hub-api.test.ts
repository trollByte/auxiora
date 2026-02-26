import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { HubApiClient } from '../src/hub-api.js';

describe('HubApiClient', () => {
  let client: HubApiClient;

  beforeEach(() => {
    client = new HubApiClient('test-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getModelCard', () => {
    it('returns markdown content for valid model', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '# Model Card\n\nThis is a great model.',
      } as Response);

      const card = await client.getModelCard('meta-llama/Llama-3-70B');

      expect(card).toBe('# Model Card\n\nThis is a great model.');
    });

    it('returns empty string on 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const card = await client.getModelCard('nonexistent/model');

      expect(card).toBe('');
    });
  });

  describe('getTrending', () => {
    it('returns trending models array', async () => {
      const mockModels = [
        { id: 'model-a', modelId: 'model-a', author: 'org', pipeline_tag: 'text-generation', tags: [], downloads: 100, likes: 10 },
        { id: 'model-b', modelId: 'model-b', author: 'org', pipeline_tag: 'text-generation', tags: [], downloads: 200, likes: 20 },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockModels,
      } as Response);

      const trending = await client.getTrending(10);

      expect(trending).toHaveLength(2);
      expect(trending[0].id).toBe('model-a');
    });

    it('throws on API error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(client.getTrending()).rejects.toThrow('HuggingFace API error: 500');
    });
  });

  describe('getModelBenchmarks', () => {
    it('extracts benchmark scores from eval_results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          cardData: {
            eval_results: [
              {
                task: { type: 'text-generation' },
                metrics: [
                  { type: 'accuracy', value: 0.85 },
                  { type: 'f1', value: 0.82 },
                ],
              },
              {
                task: { type: 'question-answering' },
                metrics: [
                  { type: 'exact_match', value: 0.75 },
                ],
              },
            ],
          },
        }),
      } as Response);

      const benchmarks = await client.getModelBenchmarks('some/model');

      expect(benchmarks['text-generation_accuracy']).toBe(0.85);
      expect(benchmarks['text-generation_f1']).toBe(0.82);
      expect(benchmarks['question-answering_exact_match']).toBe(0.75);
    });

    it('returns empty object when no eval_results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ cardData: {} }),
      } as Response);

      const benchmarks = await client.getModelBenchmarks('some/model');
      expect(benchmarks).toEqual({});
    });

    it('returns empty object on API error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const benchmarks = await client.getModelBenchmarks('nonexistent/model');
      expect(benchmarks).toEqual({});
    });
  });
});
