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

describe('VersionChecker', () => {
  let checker: VersionChecker;

  beforeEach(() => {
    checker = new VersionChecker('trollByte', 'auxiora');
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_RELEASES), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds stable update when current version is older', async () => {
    const result = await checker.check('1.3.0', 'stable');
    expect(result.available).toBe(true);
    expect(result.latestVersion).toBe('2.0.0');
    expect(result.channel).toBe('stable');
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

  it('caches responses within TTL', async () => {
    await checker.check('1.3.0', 'stable');
    await checker.check('1.3.0', 'stable');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));
    const result = await checker.check('1.3.0', 'stable');
    expect(result.available).toBe(false);
  });
});
