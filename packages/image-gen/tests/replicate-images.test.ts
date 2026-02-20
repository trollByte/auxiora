import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicateImageProvider } from '../src/providers/replicate-images.js';

describe('ReplicateImageProvider', () => {
  let provider: ReplicateImageProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new ReplicateImageProvider('test-token');
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('replicate');
    expect(provider.defaultModel).toBe('stability-ai/sdxl');
    expect(provider.supportedSizes).toContain('1024x1024');
    expect(provider.supportedSizes).toContain('512x512');
    expect(provider.supportedFormats).toContain('png');
    expect(provider.supportedFormats).toContain('webp');
  });

  it('should send correct create prediction request', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pred-123',
          status: 'succeeded',
          output: ['https://replicate.delivery/img1.webp'],
          urls: { get: 'https://api.replicate.com/v1/predictions/pred-123' },
        }),
      });

    await provider.generate({ prompt: 'a dog', size: '1024x1024' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.replicate.com/v1/predictions');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.version).toBe('stability-ai/sdxl');
    const input = body.input as Record<string, unknown>;
    expect(input.prompt).toBe('a dog');
    expect(input.width).toBe(1024);
    expect(input.height).toBe(1024);
    expect(input.num_outputs).toBe(1);
  });

  it('should include negative prompt and seed in input', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pred-1',
        status: 'succeeded',
        output: ['https://example.com/img.png'],
        urls: { get: 'https://api.replicate.com/v1/predictions/pred-1' },
      }),
    });

    await provider.generate({
      prompt: 'landscape',
      negativePrompt: 'blurry',
      seed: 42,
    });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    const input = body.input as Record<string, unknown>;
    expect(input.negative_prompt).toBe('blurry');
    expect(input.seed).toBe(42);
  });

  it('should poll until prediction succeeds', async () => {
    // Initial create returns processing
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pred-456',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred-456' },
        }),
      })
      // First poll: still processing
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pred-456',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred-456' },
        }),
      })
      // Second poll: succeeded
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pred-456',
          status: 'succeeded',
          output: ['https://replicate.delivery/result.png'],
          urls: { get: 'https://api.replicate.com/v1/predictions/pred-456' },
        }),
      });

    vi.useFakeTimers();
    const promise = provider.generate({ prompt: 'landscape' });

    // Advance through polling intervals
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    vi.useRealTimers();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe('https://replicate.delivery/result.png');
    expect(result.images[0].provider).toBe('replicate');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should return error on failed prediction', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pred-fail',
        status: 'failed',
        error: 'NSFW content detected',
        urls: { get: 'https://api.replicate.com/v1/predictions/pred-fail' },
      }),
    });

    const result = await provider.generate({ prompt: 'bad prompt' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('NSFW content detected');
  });

  it('should handle API error on creation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const result = await provider.generate({ prompt: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await provider.generate({ prompt: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });

  it('should return images with correct metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pred-meta',
        status: 'succeeded',
        output: ['https://example.com/1.png', 'https://example.com/2.png'],
        urls: { get: 'https://api.replicate.com/v1/predictions/pred-meta' },
      }),
    });

    const result = await provider.generate({
      prompt: 'two cats',
      count: 2,
      size: '512x512',
      format: 'png',
    });

    expect(result.success).toBe(true);
    expect(result.images).toHaveLength(2);
    expect(result.images[0].id).toBe('replicate-pred-meta-0');
    expect(result.images[1].id).toBe('replicate-pred-meta-1');
    expect(result.images[0].size).toBe('512x512');
    expect(result.images[0].format).toBe('png');
  });

  it('should use custom model version', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pred-custom',
        status: 'succeeded',
        output: ['https://example.com/img.png'],
        urls: { get: 'https://api.replicate.com/v1/predictions/pred-custom' },
      }),
    });

    await provider.generate({ prompt: 'test', model: 'custom/model:v1' });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.version).toBe('custom/model:v1');
  });
});
