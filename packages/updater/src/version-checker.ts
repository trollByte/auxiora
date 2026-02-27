import { getLogger } from '@auxiora/logger';
import type { UpdateChannel, UpdateCheckResult, UpdateSource } from './types.js';

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

interface NpmPackageInfo {
  'dist-tags': Record<string, string>;
  time: Record<string, string>;
  versions: Record<string, { version: string }>;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class VersionChecker {
  private ghCache: { releases: GitHubRelease[]; fetchedAt: number } | null = null;
  private npmCache: { info: NpmPackageInfo; fetchedAt: number } | null = null;
  private readonly npmPackage: string;

  constructor(
    private readonly owner: string,
    private readonly repo: string,
    npmPackage?: string,
  ) {
    this.npmPackage = npmPackage ?? repo;
  }

  /**
   * Check both GitHub Releases and npm registry for updates.
   * Returns the newest version found across both sources.
   */
  async check(currentVersion: string, channel: UpdateChannel): Promise<UpdateCheckResult> {
    const empty: UpdateCheckResult = {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      channel,
      source: 'github',
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: 0,
      assets: [],
    };

    const [ghResult, npmResult] = await Promise.all([
      this.checkGitHub(currentVersion, channel).catch(err => {
        logger.error('GitHub update check failed', {
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return empty;
      }),
      this.checkNpm(currentVersion, channel).catch(err => {
        logger.error('npm update check failed', {
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return empty;
      }),
    ]);

    // Return whichever found a newer version; prefer the one with the higher version
    if (ghResult.available && npmResult.available) {
      return this.isNewer(ghResult.latestVersion, npmResult.latestVersion) ? npmResult : ghResult;
    }
    if (ghResult.available) return ghResult;
    if (npmResult.available) return npmResult;
    return empty;
  }

  // ── GitHub ─────────────────────────────────────────────────────────

  private async checkGitHub(currentVersion: string, channel: UpdateChannel): Promise<UpdateCheckResult> {
    const empty: UpdateCheckResult = {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      channel,
      source: 'github',
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: 0,
      assets: [],
    };

    const releases = await this.fetchGitHubReleases();
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
      source: 'github',
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
  }

  private async fetchGitHubReleases(): Promise<GitHubRelease[]> {
    if (this.ghCache && Date.now() - this.ghCache.fetchedAt < CACHE_TTL_MS) {
      return this.ghCache.releases;
    }

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases?per_page=20`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const releases = (await response.json()) as GitHubRelease[];
    this.ghCache = { releases, fetchedAt: Date.now() };
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

  // ── npm ────────────────────────────────────────────────────────────

  private async checkNpm(currentVersion: string, channel: UpdateChannel): Promise<UpdateCheckResult> {
    const empty: UpdateCheckResult = {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      channel,
      source: 'npm',
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: 0,
      assets: [],
    };

    const info = await this.fetchNpmInfo();

    // Pick the right dist-tag based on channel
    const tag = channel === 'stable' ? 'latest' : channel === 'beta' ? 'beta' : 'nightly';
    const latestVersion = info['dist-tags'][tag] ?? info['dist-tags']['latest'];

    if (!latestVersion) return empty;

    // For stable channel, skip prerelease versions from npm
    if (channel === 'stable' && latestVersion.includes('-')) return empty;

    if (!this.isNewer(currentVersion, latestVersion)) {
      return empty;
    }

    const publishedAt = info.time[latestVersion]
      ? new Date(info.time[latestVersion]).getTime()
      : 0;

    return {
      available: true,
      currentVersion,
      latestVersion,
      channel,
      source: 'npm',
      releaseUrl: `https://www.npmjs.com/package/${this.npmPackage}/v/${latestVersion}`,
      releaseNotes: '',
      publishedAt,
      assets: [],
    };
  }

  private async fetchNpmInfo(): Promise<NpmPackageInfo> {
    if (this.npmCache && Date.now() - this.npmCache.fetchedAt < CACHE_TTL_MS) {
      return this.npmCache.info;
    }

    const url = `https://registry.npmjs.org/${this.npmPackage}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status}`);
    }

    const info = (await response.json()) as NpmPackageInfo;
    this.npmCache = { info, fetchedAt: Date.now() };
    return info;
  }

  // ── Shared ─────────────────────────────────────────────────────────

  /** Returns true if candidateVer is newer than currentVer. */
  isNewer(currentVer: string, candidateVer: string): boolean {
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
