import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeFetch } from '../src/safe-fetch.js';
import { SSRFError } from '../src/types.js';

describe('safeFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw SSRFError for private IPs', async () => {
    await expect(safeFetch('http://127.0.0.1/secret')).rejects.toThrow(SSRFError);
  });

  it('should throw SSRFError for localhost', async () => {
    await expect(safeFetch('http://localhost:8080')).rejects.toThrow(SSRFError);
  });

  it('should throw SSRFError with url and reason properties', async () => {
    try {
      await safeFetch('http://10.0.0.1/internal');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SSRFError);
      expect((e as SSRFError).url).toBe('http://10.0.0.1/internal');
      expect((e as SSRFError).reason).toContain('private');
    }
  });

  it('should call fetch for valid public URLs', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const result = await safeFetch('https://example.com/api');
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', undefined);
    vi.unstubAllGlobals();
  });

  it('should pass through RequestInit options', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const init = { method: 'POST', body: 'data' };
    await safeFetch('https://example.com/api', init);
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', init);
    vi.unstubAllGlobals();
  });

  it('should respect allowlist', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const result = await safeFetch('http://localhost:11434/api', undefined, {
      allowedUrls: ['localhost'],
    });
    expect(result).toBe(mockResponse);
    vi.unstubAllGlobals();
  });
});
