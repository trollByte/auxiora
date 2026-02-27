import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VersionChecker } from '../src/version-checker.js';

const MOCK_RELEASES = [
  {
    tag_name: 'v2.0.0',
    prerelease: false,
    html_url: 'https://github.com/trollByte/auxiora/releases/tag/v2.0.0',
    body: 'Stable release',
    published_at: '2026-02-15T00:00:00Z',
    assets: [{ name: 'auxiora-2.0.0-linux-x64.tar.gz', browser_download_url: 'https://example.com/a.tar.gz', size: 1000, content_type: 'application/gzip' }],
  },
  {
    tag_name: 'v2.1.0-beta.1',
    prerelease: true,
    html_url: 'https://github.com/trollByte/auxiora/releases/tag/v2.1.0-beta.1',
    body: 'Beta release',
    published_at: '2026-02-17T00:00:00Z',
    assets: [],
  },
  {
    tag_name: 'v1.3.0',
    prerelease: false,
    html_url: 'https://github.com/trollByte/auxiora/releases/tag/v1.3.0',
    body: 'Old stable',
    published_at: '2026-01-01T00:00:00Z',
    assets: [],
  },
];

const MOCK_NPM_INFO = {
  'dist-tags': { latest: '2.0.0', beta: '2.1.0-beta.1' },
  time: {
    '2.0.0': '2026-02-15T00:00:00.000Z',
    '2.1.0-beta.1': '2026-02-17T00:00:00.000Z',
    '1.3.0': '2026-01-01T00:00:00.000Z',
  },
  versions: { '2.0.0': { version: '2.0.0' }, '2.1.0-beta.1': { version: '2.1.0-beta.1' }, '1.3.0': { version: '1.3.0' } },
};

function mockFetchBoth() {
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('api.github.com')) {
      return new Response(JSON.stringify(MOCK_RELEASES), { status: 200 });
    }
    if (url.includes('registry.npmjs.org')) {
      return new Response(JSON.stringify(MOCK_NPM_INFO), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  });
}

describe('VersionChecker', () => {
  let checker: VersionChecker;

  beforeEach(() => {
    checker = new VersionChecker('trollByte', 'auxiora');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GitHub + npm combined', () => {
    beforeEach(() => { mockFetchBoth(); });

    it('finds stable update from both sources', async () => {
      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(true);
      expect(result.latestVersion).toBe('2.0.0');
    });

    it('returns not available when already on latest', async () => {
      const result = await checker.check('2.0.0', 'stable');
      expect(result.available).toBe(false);
    });

    it('finds beta releases on beta channel', async () => {
      const result = await checker.check('2.0.0', 'beta');
      expect(result.available).toBe(true);
      expect(result.latestVersion).toBe('2.1.0-beta.1');
    });

    it('queries both GitHub and npm', async () => {
      await checker.check('1.3.0', 'stable');
      const urls = vi.mocked(global.fetch).mock.calls.map(c =>
        typeof c[0] === 'string' ? c[0] : (c[0] as Request).url,
      );
      expect(urls.some(u => u.includes('api.github.com'))).toBe(true);
      expect(urls.some(u => u.includes('registry.npmjs.org'))).toBe(true);
    });

    it('result includes source field', async () => {
      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(true);
      expect(['github', 'npm']).toContain(result.source);
    });
  });

  describe('GitHub fallback', () => {
    it('returns GitHub result when npm fails', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('api.github.com')) {
          return new Response(JSON.stringify(MOCK_RELEASES), { status: 200 });
        }
        return new Response('Service unavailable', { status: 503 });
      });

      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(true);
      expect(result.source).toBe('github');
      expect(result.latestVersion).toBe('2.0.0');
    });
  });

  describe('npm fallback', () => {
    it('returns npm result when GitHub fails', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('registry.npmjs.org')) {
          return new Response(JSON.stringify(MOCK_NPM_INFO), { status: 200 });
        }
        return new Response('Rate limited', { status: 403 });
      });

      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(true);
      expect(result.source).toBe('npm');
      expect(result.latestVersion).toBe('2.0.0');
    });
  });

  describe('npm-specific', () => {
    beforeEach(() => { mockFetchBoth(); });

    it('npm result has npmjs.com release URL', async () => {
      // Make GitHub return no newer versions so npm wins
      vi.restoreAllMocks();
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('api.github.com')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes('registry.npmjs.org')) {
          return new Response(JSON.stringify(MOCK_NPM_INFO), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(true);
      expect(result.source).toBe('npm');
      expect(result.releaseUrl).toContain('npmjs.com');
    });

    it('npm publishes timestamp in result', async () => {
      vi.restoreAllMocks();
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('api.github.com')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes('registry.npmjs.org')) {
          return new Response(JSON.stringify(MOCK_NPM_INFO), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await checker.check('1.3.0', 'stable');
      expect(result.publishedAt).toBeGreaterThan(0);
    });
  });

  describe('caching', () => {
    beforeEach(() => { mockFetchBoth(); });

    it('caches responses within TTL', async () => {
      await checker.check('1.3.0', 'stable');
      await checker.check('1.3.0', 'stable');
      // 2 calls first time (GitHub + npm), 0 calls second time (cached)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('both fail', () => {
    it('handles both sources failing gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(false);
    });
  });

  describe('prefers higher version across sources', () => {
    it('picks npm when it has a higher version than GitHub', async () => {
      const npmHigher = {
        ...MOCK_NPM_INFO,
        'dist-tags': { ...MOCK_NPM_INFO['dist-tags'], latest: '3.0.0' },
        time: { ...MOCK_NPM_INFO.time, '3.0.0': '2026-03-01T00:00:00.000Z' },
      };
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('api.github.com')) {
          return new Response(JSON.stringify(MOCK_RELEASES), { status: 200 });
        }
        if (url.includes('registry.npmjs.org')) {
          return new Response(JSON.stringify(npmHigher), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await checker.check('1.3.0', 'stable');
      expect(result.available).toBe(true);
      expect(result.latestVersion).toBe('3.0.0');
      expect(result.source).toBe('npm');
    });
  });

  describe('isNewer', () => {
    it('detects major version bump', () => {
      expect(checker.isNewer('1.0.0', '2.0.0')).toBe(true);
    });

    it('detects minor version bump', () => {
      expect(checker.isNewer('1.0.0', '1.1.0')).toBe(true);
    });

    it('detects patch version bump', () => {
      expect(checker.isNewer('1.0.0', '1.0.1')).toBe(true);
    });

    it('release beats prerelease', () => {
      expect(checker.isNewer('1.0.0-beta.1', '1.0.0')).toBe(true);
    });

    it('same version is not newer', () => {
      expect(checker.isNewer('1.0.0', '1.0.0')).toBe(false);
    });
  });
});
