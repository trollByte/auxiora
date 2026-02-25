import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegistryClient } from '../src/registry.js';
import type {
  MarketplaceConfig,
  PersonalityListing,
  PersonalitySearchResult,
  PersonalityInstallResult,
  PersonalityPublishResult,
} from '../src/types.js';

const mockConfig: MarketplaceConfig = {
  registryUrl: 'https://registry.example.com',
  autoUpdate: false,
  installDir: '/tmp/plugins',
};

const mockPersonality: PersonalityListing = {
  name: 'sarcastic-bot',
  version: '1.0.0',
  description: 'A witty and sarcastic personality',
  author: 'personality-author',
  preview: 'Oh, another human. How... delightful.',
  tone: { warmth: 0.3, humor: 0.9, formality: 0.2 },
  keywords: ['sarcastic', 'witty', 'humor'],
  downloads: 500,
  rating: 4.2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-20T00:00:00Z',
};

describe('RegistryClient personality methods', () => {
  let client: RegistryClient;

  beforeEach(() => {
    client = new RegistryClient(mockConfig);
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchPersonalities', () => {
    it('should search personalities with query', async () => {
      const result: PersonalitySearchResult = {
        personalities: [mockPersonality],
        total: 1,
        offset: 0,
        limit: 10,
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(result)));

      const searchResult = await client.searchPersonalities({ query: 'sarcastic' });

      expect(searchResult.personalities).toHaveLength(1);
      expect(searchResult.personalities[0].name).toBe('sarcastic-bot');
      expect(fetch).toHaveBeenCalledOnce();

      const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
      expect(calledUrl.pathname).toBe('/api/v1/personalities/search');
      expect(calledUrl.searchParams.get('q')).toBe('sarcastic');
    });

    it('should pass search options as query params', async () => {
      const result: PersonalitySearchResult = {
        personalities: [],
        total: 0,
        offset: 0,
        limit: 5,
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(result)));

      await client.searchPersonalities({
        query: 'warm',
        author: 'test-user',
        sortBy: 'rating',
        limit: 5,
        offset: 10,
      });

      const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('q')).toBe('warm');
      expect(calledUrl.searchParams.get('author')).toBe('test-user');
      expect(calledUrl.searchParams.get('sort')).toBe('rating');
      expect(calledUrl.searchParams.get('limit')).toBe('5');
      expect(calledUrl.searchParams.get('offset')).toBe('10');
    });

    it('should throw on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }));

      await expect(client.searchPersonalities()).rejects.toThrow('Personality search failed: 500');
    });
  });

  describe('getPersonality', () => {
    it('should fetch a specific personality', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockPersonality)));

      const result = await client.getPersonality('sarcastic-bot');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('sarcastic-bot');
      expect(result!.tone.humor).toBe(0.9);
    });

    it('should return null for 404', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }));

      const result = await client.getPersonality('nonexistent');
      expect(result).toBeNull();
    });

    it('should throw on server error', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('Error', { status: 500, statusText: 'Internal Server Error' }));

      await expect(client.getPersonality('test')).rejects.toThrow('Personality lookup failed: 500');
    });
  });

  describe('installPersonality', () => {
    it('should install a personality', async () => {
      const installResult: PersonalityInstallResult = {
        success: true,
        name: 'sarcastic-bot',
        version: '1.0.0',
        installedAt: '2026-02-07T00:00:00Z',
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(installResult)));

      const result = await client.installPersonality('sarcastic-bot');

      expect(result.success).toBe(true);
      expect(result.name).toBe('sarcastic-bot');
      expect(fetch).toHaveBeenCalledOnce();

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(new URL(url as string).pathname).toBe('/api/v1/personalities/install');
      expect(init?.method).toBe('POST');
    });

    it('should install a specific version', async () => {
      const installResult: PersonalityInstallResult = {
        success: true,
        name: 'sarcastic-bot',
        version: '2.0.0',
        installedAt: '2026-02-07T00:00:00Z',
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(installResult)));

      const result = await client.installPersonality('sarcastic-bot', '2.0.0');

      expect(result.success).toBe(true);
      expect(result.version).toBe('2.0.0');
    });

    it('should return error result on failure', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('Error', { status: 500, statusText: 'Internal Server Error' }));

      const result = await client.installPersonality('bad-personality');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Personality install failed');
    });
  });

  describe('publishPersonality', () => {
    it('should publish a personality', async () => {
      const publishResult: PersonalityPublishResult = {
        success: true,
        name: 'my-personality',
        version: '1.0.0',
        publishedAt: '2026-02-07T00:00:00Z',
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(publishResult)));

      const result = await client.publishPersonality('/path/to/SOUL.md');

      expect(result.success).toBe(true);
      expect(result.name).toBe('my-personality');
      expect(fetch).toHaveBeenCalledOnce();

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(new URL(url as string).pathname).toBe('/api/v1/personalities/publish');
      expect(init?.method).toBe('POST');
    });

    it('should return error result on failure', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('Error', { status: 403, statusText: 'Forbidden' }));

      const result = await client.publishPersonality('/path/to/SOUL.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Personality publish failed');
    });
  });
});

describe('PersonalityListing type', () => {
  it('should have all required fields', () => {
    const listing: PersonalityListing = {
      name: 'test',
      version: '1.0.0',
      description: 'Test',
      author: 'author',
      preview: 'Hello!',
      tone: { warmth: 0.5, humor: 0.5, formality: 0.5 },
      keywords: ['test'],
      downloads: 0,
      rating: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    expect(listing.name).toBe('test');
    expect(listing.tone.warmth).toBe(0.5);
    expect(listing.preview).toBe('Hello!');
  });
});
