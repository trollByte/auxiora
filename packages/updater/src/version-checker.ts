import { getLogger } from '@auxiora/logger';
import type { UpdateChannel, UpdateCheckResult } from './types.js';

const logger = getLogger('updater:version-checker');

interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  html_url: string;
  body: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
  }>;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class VersionChecker {
  private cache: { releases: GitHubRelease[]; fetchedAt: number } | null = null;

  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async check(currentVersion: string, channel: UpdateChannel): Promise<UpdateCheckResult> {
    const empty: UpdateCheckResult = {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      channel,
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: 0,
      assets: [],
    };

    try {
      const releases = await this.fetchReleases();
      const candidates = this.filterByChannel(releases, channel);
      if (candidates.length === 0) return empty;

      candidates.sort((a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
      );

      const latest = candidates[0];
      const latestVersion = latest.tag_name.replace(/^v/, '');

      if (!this.isNewer(currentVersion, latestVersion)) {
        return empty;
      }

      return {
        available: true,
        currentVersion,
        latestVersion,
        channel,
        releaseUrl: latest.html_url,
        releaseNotes: latest.body ?? '',
        publishedAt: new Date(latest.published_at).getTime(),
        assets: latest.assets.map(a => ({
          name: a.name,
          url: a.browser_download_url,
          size: a.size,
          contentType: a.content_type,
        })),
      };
    } catch (error) {
      logger.error('Failed to check for updates', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return empty;
    }
  }

  private async fetchReleases(): Promise<GitHubRelease[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.releases;
    }

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases?per_page=20`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const releases = (await response.json()) as GitHubRelease[];
    this.cache = { releases, fetchedAt: Date.now() };
    return releases;
  }

  private filterByChannel(releases: GitHubRelease[], channel: UpdateChannel): GitHubRelease[] {
    switch (channel) {
      case 'stable':
        return releases.filter(r => !r.prerelease && !r.tag_name.includes('-'));
      case 'beta':
        return releases;
      case 'nightly':
        return releases.filter(r =>
          r.tag_name.includes('nightly') || r.prerelease,
        );
      default:
        return releases.filter(r => !r.prerelease);
    }
  }

  private isNewer(currentVer: string, candidateVer: string): boolean {
    const parse = (v: string) => {
      const clean = v.replace(/^v/, '');
      const [main, pre] = clean.split('-', 2);
      const parts = main.split('.').map(Number);
      return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0, pre };
    };

    const cur = parse(currentVer);
    const can = parse(candidateVer);

    if (can.major !== cur.major) return can.major > cur.major;
    if (can.minor !== cur.minor) return can.minor > cur.minor;
    if (can.patch !== cur.patch) return can.patch > cur.patch;

    if (cur.pre && !can.pre) return true;
    if (!cur.pre && can.pre) return false;
    if (cur.pre && can.pre) return can.pre > cur.pre;

    return false;
  }
}
