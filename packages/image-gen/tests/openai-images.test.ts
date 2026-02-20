import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIImageProvider } from '../src/providers/openai-images.js';

describe('OpenAIImageProvider', () => {
  let provider: OpenAIImageProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new OpenAIImageProvider('test-api-key');
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('openai');
    expect(provider.defaultModel).toBe('dall-e-3');
    expect(provider.supportedSizes).toContain('1024x1024');
    expect(provider.supportedFormats).toContain('png');
  });

  it('should send correct request to OpenAI API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'base64data', revised_prompt: 'a nice cat' }],
      }),
    });

    await provider.generate({ prompt: 'a cat', size: '1024x1024' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-api-key');

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.model).toBe('dall-e-3');
    expect(body.prompt).toBe('a cat');
    expect(body.size).toBe('1024x1024');
    expect(body.response_format).toBe('b64_json');
    expect(body.n).toBe(1);
  });

  it('should return generated images on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'imagedata123', revised_prompt: 'revised cat' }],
      }),
    });

    const result = await provider.generate({ prompt: 'a cat' });

    expect(result.success).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].base64).toBe('imagedata123');
    expect(result.images[0].prompt).toBe('revised cat');
    expect(result.images[0].provider).toBe('openai');
    expect(result.images[0].model).toBe('dall-e-3');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should estimate cost for 1024x1024', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'data' }] }),
    });

    const result = await provider.generate({ prompt: 'test', size: '1024x1024' });
    expect(result.cost).toBe(0.04);
  });

  it('should estimate cost for 1024x1792', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'data' }] }),
    });

    const result = await provider.generate({ prompt: 'test', size: '1024x1792' });
    expect(result.cost).toBe(0.08);
  });

  it('should scale cost by count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'a' }, { b64_json: 'b' }],
      }),
    });

    const result = await provider.generate({ prompt: 'test', size: '1024x1024', count: 2 });
    expect(result.cost).toBe(0.08);
  });

  it('should handle API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });

    const result = await provider.generate({ prompt: 'a cat' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('429');
    expect(result.images).toEqual([]);
  });

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await provider.generate({ prompt: 'a cat' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  it('should use custom model when specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'data' }] }),
    });

    await provider.generate({ prompt: 'test', model: 'dall-e-2' });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.model).toBe('dall-e-2');
  });

  it('should use original prompt when no revised_prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'data' }] }),
    });

    const result = await provider.generate({ prompt: 'original prompt' });
    expect(result.images[0].prompt).toBe('original prompt');
  });
});
