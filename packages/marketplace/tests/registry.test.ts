import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegistryClient } from '../src/registry.js';
import type { MarketplaceConfig, PluginListing, SearchResult, InstallResult, PublishResult } from '../src/types.js';

const mockConfig: MarketplaceConfig = {
  registryUrl: 'https://registry.example.com',
  autoUpdate: false,
  installDir: '/tmp/plugins',
};

const mockListing: PluginListing = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'test-author',
  license: 'MIT',
  permissions: ['NETWORK'],
  keywords: ['test'],
  downloads: 100,
  rating: 4.5,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
};

describe('RegistryClient', () => {
  let client: RegistryClient;

  beforeEach(() => {
    client = new RegistryClient(mockConfig);
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search', () => {
    it('should search with query parameters', async () => {
      const searchResult: SearchResult = {
        plugins: [mockListing],
        total: 1,
        offset: 0,
        limit: 20,
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(searchResult)));

      const result = await client.search({ query: 'test', limit: 10 });

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('test-plugin');
      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=test');
      expect(calledUrl).toContain('limit=10');
    });

    it('should throw on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }));

      await expect(client.search()).rejects.toThrow('Registry search failed');
    });
  });

  describe('getPlugin', () => {
    it('should return plugin listing', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockListing)));

      const result = await client.getPlugin('test-plugin');

      expect(result).toEqual(mockListing);
    });

    it('should return null for 404', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }));

      const result = await client.getPlugin('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('install', () => {
    it('should install a plugin', async () => {
      const installResult: InstallResult = {
        success: true,
        name: 'test-plugin',
        version: '1.0.0',
        installedAt: '2026-02-07T00:00:00Z',
        dependencies: [],
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(installResult)));

      const result = await client.install('test-plugin', '1.0.0');

      expect(result.success).toBe(true);
      expect(result.name).toBe('test-plugin');
      expect(client.listInstalled()).toHaveLength(1);
    });

    it('should return error on failed install', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500, statusText: 'Error' }));

      const result = await client.install('broken');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Install failed');
    });
  });

  describe('uninstall', () => {
    it('should uninstall an installed plugin', async () => {
      const installResult: InstallResult = {
        success: true,
        name: 'test-plugin',
        version: '1.0.0',
        installedAt: '2026-02-07T00:00:00Z',
        dependencies: [],
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(installResult)));
      await client.install('test-plugin');

      const removed = await client.uninstall('test-plugin');

      expect(removed).toBe(true);
      expect(client.listInstalled()).toHaveLength(0);
    });

    it('should return false for non-installed plugin', async () => {
      const removed = await client.uninstall('nonexistent');

      expect(removed).toBe(false);
    });
  });

  describe('update', () => {
    it('should return error for non-installed plugin', async () => {
      const result = await client.update('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not installed');
    });
  });

  describe('publish', () => {
    it('should publish a plugin', async () => {
      const publishResult: PublishResult = {
        success: true,
        name: 'my-plugin',
        version: '1.0.0',
        publishedAt: '2026-02-07T00:00:00Z',
      };
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(publishResult)));

      const result = await client.publish('/path/to/plugin');

      expect(result.success).toBe(true);
      expect(result.name).toBe('my-plugin');
    });

    it('should return error on failed publish', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('', { status: 403, statusText: 'Forbidden' }));

      const result = await client.publish('/path/to/plugin');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Publish failed');
    });
  });

  describe('listInstalled', () => {
    it('should return empty list initially', () => {
      expect(client.listInstalled()).toEqual([]);
    });
  });

  describe('checkUpdates', () => {
    it('should return empty for no installed plugins', async () => {
      const updates = await client.checkUpdates();
      expect(updates).toEqual([]);
    });
  });

  describe('getConfig', () => {
    it('should return config copy', () => {
      const config = client.getConfig();
      expect(config.registryUrl).toBe(mockConfig.registryUrl);
    });
  });
});
