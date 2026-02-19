# Self-Update System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Auxiora to detect her installation method and update herself with auto-restart and automatic rollback.

**Architecture:** Strategy pattern in a new `packages/updater/` package. An `InstallationDetector` identifies the install method, a `VersionChecker` queries GitHub Releases with channel filtering, method-specific `UpdateStrategy` classes handle stage/apply/restart/rollback, and an `Updater` orchestrator runs the lifecycle with health-check verification.

**Tech Stack:** TypeScript strict ESM, Node 22 built-ins (`child_process/execFile`, `fs`, `fetch`), vitest, commander (CLI), pino logger via `@auxiora/logger`.

**Design doc:** `docs/plans/2026-02-18-self-update-system-design.md`

---

## Conventions Reference

- All imports use `.js` extensions (strict ESM)
- Type imports use `import type { ... }`
- Logger: `const logger = getLogger('updater:module')` — error field expects `Error` objects
- Package naming: `@auxiora/updater`
- CLI commands: export `createXxxCommand(): Command` from `packages/cli/src/commands/xxx.ts`
- Tests: vitest with `describe`/`it`/`expect`, files in `tests/` directory
- All subprocess calls use `execFile` (not `exec`) to prevent shell injection
- Version: 1.3.0 to match other packages

---

### Task 1: Package Scaffolding

**Files:**
- Create: `packages/updater/package.json`
- Create: `packages/updater/tsconfig.json`
- Create: `packages/updater/src/index.ts` (empty barrel, will grow)

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/updater",
  "version": "1.3.0",
  "description": "Self-update system with installation detection, version checking, and strategy-based updates",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "dist/"
  ]
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../logger" }
  ]
}
```

**Step 3: Create empty barrel**

```typescript
// packages/updater/src/index.ts
// Barrel export — populated as modules are added
```

**Step 4: Install dependencies**

Run: `pnpm install`
Expected: Workspace links created, no errors.

**Step 5: Verify build**

Run: `cd packages/updater && pnpm build`
Expected: Compiles successfully, `dist/index.js` created.

**Step 6: Commit**

```bash
git add packages/updater/
git commit -m "feat(updater): scaffold package with build config"
```

---

### Task 2: Types

**Files:**
- Create: `packages/updater/src/types.ts`
- Modify: `packages/updater/src/index.ts` (add re-exports)

**Step 1: Create types.ts**

All shared interfaces and type aliases for the updater package. Reference: design doc sections on Installation Detection, Version Checking, Update Strategies, and Orchestration.

```typescript
// packages/updater/src/types.ts

export type InstallMethod = 'npm' | 'git' | 'docker' | 'apt' | 'brew' | 'tarball' | 'k8s' | 'unknown';

export type UpdateChannel = 'stable' | 'beta' | 'nightly';

export interface InstallationInfo {
  method: InstallMethod;
  currentVersion: string;
  installPath: string;
  canSelfUpdate: boolean;
  requiresSudo: boolean;
  containerRuntime?: 'docker' | 'podman';
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  channel: UpdateChannel;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: number;
  assets: ReleaseAsset[];
}

export interface StagedUpdate {
  targetVersion: string;
  previousVersion: string;
  backupPath: string;
  stagedPath: string;
  method: InstallMethod;
  timestamp: number;
}

export interface UpdateResult {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  method: InstallMethod;
  rolledBack: boolean;
  error?: string;
  durationMs: number;
}

export interface UpdatePreferences {
  channel: UpdateChannel;
  disableUpdateCheck: boolean;
  checkIntervalHours: number;
  autoUpdate: boolean;
  lastCheckTimestamp: number;
  lastUpdateResult?: UpdateResult;
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  channel: 'stable',
  disableUpdateCheck: false,
  checkIntervalHours: 24,
  autoUpdate: false,
  lastCheckTimestamp: 0,
};

export interface UpdateStrategy {
  readonly method: InstallMethod;
  stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate>;
  apply(staged: StagedUpdate): Promise<void>;
  restart(info: InstallationInfo): Promise<void>;
  rollback(staged: StagedUpdate): Promise<void>;
  cleanup(staged: StagedUpdate): Promise<void>;
}
```

**Step 2: Update barrel export**

```typescript
// packages/updater/src/index.ts
export type {
  InstallMethod,
  UpdateChannel,
  InstallationInfo,
  ReleaseAsset,
  UpdateCheckResult,
  StagedUpdate,
  UpdateResult,
  UpdatePreferences,
  UpdateStrategy,
} from './types.js';
export { DEFAULT_UPDATE_PREFERENCES } from './types.js';
```

**Step 3: Verify build**

Run: `cd packages/updater && pnpm build`
Expected: Compiles, types exported.

**Step 4: Commit**

```bash
git add packages/updater/src/
git commit -m "feat(updater): add type definitions for update system"
```

---

### Task 3: Safe Exec Utility

**Files:**
- Create: `packages/updater/src/util/exec.ts`
- Create: `packages/updater/tests/exec.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/updater/tests/exec.test.ts
import { describe, it, expect } from 'vitest';
import { safeExecFile } from '../src/util/exec.js';

describe('safeExecFile', () => {
  it('runs a command and returns stdout', async () => {
    const result = await safeExecFile('echo', ['hello']);
    expect(result.status).toBe('ok');
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns error status on command failure', async () => {
    const result = await safeExecFile('false', []);
    expect(result.status).toBe('error');
    expect(result.exitCode).not.toBe(0);
  });

  it('returns error status on command not found', async () => {
    const result = await safeExecFile('nonexistent-binary-xyz', []);
    expect(result.status).toBe('error');
    expect(result.stderr).toBeTruthy();
  });

  it('respects timeout', async () => {
    const result = await safeExecFile('sleep', ['10'], { timeoutMs: 100 });
    expect(result.status).toBe('error');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/updater/tests/exec.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// packages/updater/src/util/exec.ts
import { execFile } from 'node:child_process';

export interface ExecResult {
  status: 'ok' | 'error';
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ExecOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Safe subprocess execution using execFile (no shell, no injection).
 * Never throws — returns a result object with status.
 */
export function safeExecFile(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        timeout: options?.timeoutMs ?? 120_000,
        cwd: options?.cwd,
        env: options?.env ?? process.env,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            status: 'error',
            stdout: stdout ?? '',
            stderr: stderr ?? error.message,
            exitCode: error.code != null ? (typeof error.code === 'number' ? error.code : 1) : 1,
          });
          return;
        }
        resolve({
          status: 'ok',
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: 0,
        });
      },
    );
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/updater/tests/exec.test.ts`
Expected: 4/4 pass.

**Step 5: Commit**

```bash
git add packages/updater/src/util/ packages/updater/tests/
git commit -m "feat(updater): add safe execFile wrapper"
```

---

### Task 4: Installation Detector

**Files:**
- Create: `packages/updater/src/detector.ts`
- Create: `packages/updater/tests/detector.test.ts`
- Modify: `packages/updater/src/index.ts` (add export)

**Step 1: Write the failing tests**

Tests mock filesystem and env to exercise each detection path. Use `vi.mock` for `node:fs` and set `process.env` directly.

```typescript
// packages/updater/tests/detector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstallationDetector } from '../src/detector.js';
import type { InstallMethod } from '../src/types.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('InstallationDetector', () => {
  let detector: InstallationDetector;
  const originalEnv = { ...process.env };
  const originalArgv = [...process.argv];

  beforeEach(() => {
    detector = new InstallationDetector();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    // Clean env overrides
    delete process.env.AUXIORA_INSTALL_METHOD;
    delete process.env.KUBERNETES_SERVICE_HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  it('detects docker when /.dockerenv exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p) === '/.dockerenv' ? true : false,
    );
    const info = detector.detect();
    expect(info.method).toBe('docker');
  });

  it('detects k8s when KUBERNETES_SERVICE_HOST is set', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
    const info = detector.detect();
    expect(info.method).toBe('k8s');
  });

  it('respects AUXIORA_INSTALL_METHOD override', () => {
    process.env.AUXIORA_INSTALL_METHOD = 'tarball';
    const info = detector.detect();
    expect(info.method).toBe('tarball');
  });

  it('detects brew from executable path', () => {
    process.argv[1] = '/opt/homebrew/Cellar/auxiora/1.0/bin/auxiora';
    const info = detector.detect();
    expect(info.method).toBe('brew');
  });

  it('detects apt from dpkg metadata', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p) === '/var/lib/dpkg/info/auxiora.list' ? true : false,
    );
    const info = detector.detect();
    expect(info.method).toBe('apt');
    expect(info.requiresSudo).toBe(true);
  });

  it('detects git when .git directory exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('.git') ? true : false,
    );
    const info = detector.detect();
    expect(info.method).toBe('git');
  });

  it('returns unknown when nothing matches', () => {
    const info = detector.detect();
    expect(info.method).toBe('unknown');
    expect(info.canSelfUpdate).toBe(false);
  });

  it('sets canSelfUpdate true for known methods', () => {
    process.env.AUXIORA_INSTALL_METHOD = 'npm';
    const info = detector.detect();
    expect(info.canSelfUpdate).toBe(true);
  });

  it('reads version from package.json', () => {
    process.env.AUXIORA_INSTALL_METHOD = 'npm';
    const info = detector.detect();
    expect(info.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/updater/tests/detector.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// packages/updater/src/detector.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { InstallMethod, InstallationInfo } from './types.js';

const logger = getLogger('updater:detector');

// Read version from this package's root package.json
function readPackageVersion(): string {
  try {
    // Walk up from this file to find package.json
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fall through
  }
  return '0.0.0';
}

export class InstallationDetector {
  /**
   * Detect the installation method. First match wins.
   * Uses filesystem checks, environment variables, and executable path heuristics.
   */
  detect(): InstallationInfo {
    const method = this.detectMethod();
    const currentVersion = readPackageVersion();
    const installPath = this.resolveInstallPath(method);

    const info: InstallationInfo = {
      method,
      currentVersion,
      installPath,
      canSelfUpdate: method !== 'unknown',
      requiresSudo: method === 'apt' || (method === 'tarball' && installPath.startsWith('/opt/')),
    };

    if (method === 'docker' || method === 'k8s') {
      info.containerRuntime = this.detectContainerRuntime();
    }

    logger.debug('Installation detected', { method, installPath, currentVersion });
    return info;
  }

  private detectMethod(): InstallMethod {
    // 1. Docker container
    if (fs.existsSync('/.dockerenv')) return 'docker';

    // 2. Kubernetes pod
    if (process.env.KUBERNETES_SERVICE_HOST) return 'k8s';

    // 3. Explicit override
    const override = process.env.AUXIORA_INSTALL_METHOD;
    if (override && this.isValidMethod(override)) return override;

    // 4. Homebrew
    const execPath = process.argv[1] ?? '';
    if (execPath.includes('homebrew') || execPath.includes('Homebrew') || execPath.includes('Cellar')) {
      return 'brew';
    }

    // 5. Debian/Ubuntu apt
    if (fs.existsSync('/var/lib/dpkg/info/auxiora.list')) return 'apt';

    // 6. Git clone
    const projectRoot = this.findProjectRoot();
    if (projectRoot && fs.existsSync(path.join(projectRoot, '.git'))) return 'git';

    // 7. npm global (expensive — check last)
    // Skipped in detect() for speed; the npm check requires spawning a subprocess.
    // If we get here and the executable is in a node_modules path, assume npm.
    if (execPath.includes('node_modules')) return 'npm';

    // 8. Tarball
    const home = process.env.HOME ?? '';
    if (
      execPath.startsWith(path.join(home, '.local/lib/auxiora')) ||
      execPath.startsWith('/opt/auxiora')
    ) {
      return 'tarball';
    }

    // 9. Unknown
    return 'unknown';
  }

  private isValidMethod(value: string): value is InstallMethod {
    return ['npm', 'git', 'docker', 'apt', 'brew', 'tarball', 'k8s'].includes(value);
  }

  private findProjectRoot(): string | null {
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  private resolveInstallPath(method: InstallMethod): string {
    switch (method) {
      case 'docker':
      case 'k8s':
        return '/app';
      case 'apt':
        return '/opt/auxiora';
      case 'git':
        return this.findProjectRoot() ?? process.cwd();
      case 'tarball': {
        const home = process.env.HOME ?? '';
        const localPath = path.join(home, '.local/lib/auxiora');
        return fs.existsSync(localPath) ? localPath : '/opt/auxiora';
      }
      default:
        return process.cwd();
    }
  }

  private detectContainerRuntime(): 'docker' | 'podman' {
    // Podman sets specific env vars or cgroup paths
    if (process.env.container === 'podman') return 'podman';
    return 'docker';
  }
}
```

**Step 4: Update barrel export**

Add to `packages/updater/src/index.ts`:
```typescript
export { InstallationDetector } from './detector.js';
```

**Step 5: Run tests**

Run: `npx vitest run packages/updater/tests/detector.test.ts`
Expected: All pass.

**Step 6: Commit**

```bash
git add packages/updater/
git commit -m "feat(updater): add installation method detector"
```

---

### Task 5: Version Checker

**Files:**
- Create: `packages/updater/src/version-checker.ts`
- Create: `packages/updater/tests/version-checker.test.ts`
- Modify: `packages/updater/src/index.ts` (add export)

**Step 1: Write the failing tests**

Mock `global.fetch` to return GitHub API responses. Test channel filtering, caching, and "no update available" path.

```typescript
// packages/updater/tests/version-checker.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/updater/tests/version-checker.test.ts`
Expected: FAIL.

**Step 3: Implement**

```typescript
// packages/updater/src/version-checker.ts
import { getLogger } from '@auxiora/logger';
import type { UpdateChannel, UpdateCheckResult, ReleaseAsset } from './types.js';

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

/**
 * Checks GitHub Releases for available updates with channel awareness.
 */
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

      // Sort by semver descending (simplified: by published_at)
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
        // Beta channel includes stable + prerelease
        return releases;
      case 'nightly':
        return releases.filter(r =>
          r.tag_name.includes('nightly') || r.prerelease,
        );
      default:
        return releases.filter(r => !r.prerelease);
    }
  }

  /**
   * Simple semver comparison: is candidateVer newer than currentVer?
   * Strips leading 'v' and compares major.minor.patch numerically.
   * For prerelease tags, string comparison on the suffix.
   */
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

    // Same version number: prerelease is older than stable
    if (cur.pre && !can.pre) return true;
    if (!cur.pre && can.pre) return false;

    // Both prerelease: string compare
    if (cur.pre && can.pre) return can.pre > cur.pre;

    return false;
  }
}
```

**Step 4: Update barrel export**

Add to `packages/updater/src/index.ts`:
```typescript
export { VersionChecker } from './version-checker.js';
```

**Step 5: Run tests**

Run: `npx vitest run packages/updater/tests/version-checker.test.ts`
Expected: All pass.

**Step 6: Commit**

```bash
git add packages/updater/
git commit -m "feat(updater): add version checker with GitHub Releases API"
```

---

### Task 6: Health Checker

**Files:**
- Create: `packages/updater/src/health-checker.ts`
- Create: `packages/updater/tests/health-checker.test.ts`
- Modify: `packages/updater/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/updater/tests/health-checker.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthChecker } from '../src/health-checker.js';

describe('HealthChecker', () => {
  const checker = new HealthChecker('http://localhost:18800');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when health endpoint reports expected version', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '2.0.0' }), { status: 200 }),
    );

    const result = await checker.waitForHealthy('2.0.0', { maxAttempts: 1, intervalMs: 10 });
    expect(result.healthy).toBe(true);
  });

  it('fails when version does not match after max attempts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 }),
    );

    const result = await checker.waitForHealthy('2.0.0', { maxAttempts: 2, intervalMs: 10 });
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain('version');
  });

  it('fails when health endpoint is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await checker.waitForHealthy('2.0.0', { maxAttempts: 2, intervalMs: 10 });
    expect(result.healthy).toBe(false);
  });
});
```

**Step 2: Implement**

```typescript
// packages/updater/src/health-checker.ts
import { getLogger } from '@auxiora/logger';

const logger = getLogger('updater:health-checker');

export interface HealthCheckOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  reason?: string;
  attempts: number;
}

export class HealthChecker {
  constructor(private readonly baseUrl: string) {}

  async waitForHealthy(
    expectedVersion: string,
    options?: HealthCheckOptions,
  ): Promise<HealthCheckResult> {
    const maxAttempts = options?.maxAttempts ?? 10;
    const intervalMs = options?.intervalMs ?? 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/health`);
        if (response.ok) {
          const body = (await response.json()) as { status: string; version: string };
          if (body.version === expectedVersion) {
            logger.info('Health check passed', { version: expectedVersion, attempt });
            return { healthy: true, attempts: attempt };
          }
          logger.debug('Health check: version mismatch', {
            expected: expectedVersion,
            actual: body.version,
            attempt,
          });
        }
      } catch {
        logger.debug('Health check: endpoint unreachable', { attempt });
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    return {
      healthy: false,
      reason: `Health check failed after ${maxAttempts} attempts — version ${expectedVersion} not confirmed`,
      attempts: maxAttempts,
    };
  }
}
```

**Step 3: Update barrel, run tests, commit**

Add to barrel: `export { HealthChecker } from './health-checker.js';`

Run: `npx vitest run packages/updater/tests/health-checker.test.ts`

```bash
git add packages/updater/
git commit -m "feat(updater): add health checker with retry polling"
```

---

### Task 7: Tarball Strategy (Reference Implementation)

**Files:**
- Create: `packages/updater/src/strategies/tarball.ts`
- Create: `packages/updater/src/util/download.ts`
- Create: `packages/updater/tests/strategies/tarball.test.ts`

This is the reference strategy — it exercises the full stage/apply/restart/rollback/cleanup lifecycle using only filesystem operations and is the easiest to test. Other strategies follow the same pattern.

**Step 1: Write the download utility**

```typescript
// packages/updater/src/util/download.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('updater:download');

/**
 * Download a URL to a local file path.
 * Returns the path on success, throws on failure.
 */
export async function downloadFile(url: string, destPath: string): Promise<string> {
  logger.info('Downloading', { url, destPath });

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  logger.info('Download complete', { destPath, bytes: buffer.length });
  return destPath;
}
```

**Step 2: Write the strategy + tests**

The tarball strategy test should mock `fs`, `safeExecFile`, and `downloadFile` to verify the lifecycle without touching disk. Write tests first, then implement. Follow TDD: verify tests fail, implement, verify tests pass.

Key test cases for the tarball strategy:
- `stage()` downloads the correct asset URL to a temp directory
- `apply()` moves the old install dir to backup and extracts the new tarball
- `rollback()` moves backup back to the install path
- `cleanup()` removes the backup and staged directories
- `restart()` calls `kill` on the gateway process

This task is large — implement in sub-steps:
1. Write 5 tests (stage, apply, rollback, cleanup, restart)
2. Run — all fail
3. Implement `TarballStrategy` class
4. Run — all pass
5. Commit

**Step 3: Commit**

```bash
git add packages/updater/
git commit -m "feat(updater): add tarball strategy and download utility"
```

---

### Task 8: Remaining Strategies

**Files:**
- Create: `packages/updater/src/strategies/npm.ts`
- Create: `packages/updater/src/strategies/git.ts`
- Create: `packages/updater/src/strategies/docker.ts`
- Create: `packages/updater/src/strategies/apt.ts`
- Create: `packages/updater/src/strategies/brew.ts`
- Create: `packages/updater/src/strategies/k8s.ts`
- Create: `packages/updater/src/strategies/index.ts`
- Create: tests for each

Each strategy follows the same `UpdateStrategy` interface. All shell commands use `safeExecFile`. Write 3-5 tests per strategy (stage, apply, rollback at minimum). Mock `safeExecFile` in tests.

**Key per-strategy notes:**

- **NpmStrategy:** `safeExecFile('npm', ['install', '-g', 'auxiora@' + version])`
- **GitStrategy:** `safeExecFile('git', ['fetch', '--tags'])`, then `safeExecFile('git', ['checkout', 'v' + version])`, then `safeExecFile('pnpm', ['install'])`, then `safeExecFile('pnpm', ['build'])`
- **DockerStrategy:** Inspect current container config with `safeExecFile('docker', ['inspect', ...])`, then `docker stop`, `docker rm`, `docker run` with preserved config
- **AptStrategy:** `safeExecFile('sudo', ['apt-get', 'install', '-y', 'auxiora=' + version])`
- **BrewStrategy:** `safeExecFile('brew', ['upgrade', 'auxiora'])`
- **K8sStrategy:** `safeExecFile('kubectl', ['set', 'image', ...])` with `safeExecFile('kubectl', ['rollout', 'undo', ...])` for rollback

**Strategy factory** in `packages/updater/src/strategies/index.ts`:

```typescript
import type { InstallMethod, UpdateStrategy } from '../types.js';
import { NpmStrategy } from './npm.js';
import { GitStrategy } from './git.js';
import { DockerStrategy } from './docker.js';
import { AptStrategy } from './apt.js';
import { BrewStrategy } from './brew.js';
import { TarballStrategy } from './tarball.js';
import { K8sStrategy } from './k8s.js';

export function createStrategyMap(): Map<InstallMethod, UpdateStrategy> {
  const strategies: UpdateStrategy[] = [
    new NpmStrategy(),
    new GitStrategy(),
    new DockerStrategy(),
    new AptStrategy(),
    new BrewStrategy(),
    new TarballStrategy(),
    new K8sStrategy(),
  ];

  const map = new Map<InstallMethod, UpdateStrategy>();
  for (const s of strategies) {
    map.set(s.method, s);
  }
  return map;
}

export { NpmStrategy } from './npm.js';
export { GitStrategy } from './git.js';
export { DockerStrategy } from './docker.js';
export { AptStrategy } from './apt.js';
export { BrewStrategy } from './brew.js';
export { TarballStrategy } from './tarball.js';
export { K8sStrategy } from './k8s.js';
```

Commit each strategy individually or batch them — implementer's choice. Final commit:

```bash
git add packages/updater/
git commit -m "feat(updater): add all update strategies (npm, git, docker, apt, brew, k8s)"
```

---

### Task 9: Updater Orchestrator

**Files:**
- Create: `packages/updater/src/updater.ts`
- Create: `packages/updater/tests/updater.test.ts`
- Modify: `packages/updater/src/index.ts`

**Step 1: Write the failing tests**

Test the orchestrator with fully mocked strategies. Key test cases:

```typescript
// packages/updater/tests/updater.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Updater } from '../src/updater.js';
import type { UpdateStrategy, InstallationInfo, UpdateCheckResult, StagedUpdate } from '../src/types.js';

// ... mock factory helpers

describe('Updater', () => {
  it('returns early when no update is available', async () => { /* ... */ });
  it('returns early when install method is unknown', async () => { /* ... */ });
  it('runs full lifecycle: stage -> apply -> restart -> health -> cleanup', async () => { /* ... */ });
  it('rolls back and restarts when health check fails', async () => { /* ... */ });
  it('persists StagedUpdate to disk before apply', async () => { /* ... */ });
  it('cleans up staged update file on success', async () => { /* ... */ });
});
```

**Step 2: Implement**

The `Updater` class coordinates: detect → check → stage → persist → apply → restart → health → cleanup/rollback.

Key implementation details:
- Write `StagedUpdate` JSON to `$XDG_DATA_HOME/auxiora/last-update.json` before `apply()`
- Delete that file after successful `cleanup()`
- On rollback, call `strategy.rollback()` then `strategy.restart()` then delete the file
- Return `UpdateResult` with timing and rollback status

**Step 3: Run tests, commit**

```bash
git add packages/updater/
git commit -m "feat(updater): add orchestrator with health-checked rollback"
```

---

### Task 10: CLI Command

**Files:**
- Create: `packages/cli/src/commands/update.ts`
- Modify: `packages/cli/src/index.ts` (register command)
- Modify: `packages/cli/package.json` (add `@auxiora/updater` dependency)

**Step 1: Create the command**

Follow the `createXxxCommand()` pattern from other CLI commands (see `packages/cli/src/commands/start.ts`).

```typescript
// packages/cli/src/commands/update.ts
import { Command } from 'commander';
import { Updater } from '@auxiora/updater';
import { InstallationDetector } from '@auxiora/updater';
import { VersionChecker } from '@auxiora/updater';
import { HealthChecker } from '@auxiora/updater';
import { createStrategyMap } from '@auxiora/updater';
import type { UpdateChannel } from '@auxiora/updater';

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Check for and apply updates')
    .option('--check', 'Check for updates without installing')
    .option('--channel <channel>', 'Update channel: stable, beta, or nightly', 'stable')
    .option('--rollback', 'Roll back to previous version')
    .option('--force', 'Force update even if already up to date')
    .action(async (options) => {
      const detector = new InstallationDetector();
      const info = detector.detect();

      console.log(`Installation method: ${info.method}`);
      console.log(`Current version: ${info.currentVersion}`);

      if (!info.canSelfUpdate) {
        console.log('Cannot self-update from this installation method.');
        console.log('Please update manually using your package manager.');
        return;
      }

      const checker = new VersionChecker('trollByte', 'auxiora');
      const health = new HealthChecker('http://localhost:18800');
      const strategies = createStrategyMap();

      const updater = new Updater({ detector, versionChecker: checker, healthChecker: health, strategies });

      if (options.rollback) {
        console.log('Rolling back to previous version...');
        await updater.rollback();
        return;
      }

      const channel = options.channel as UpdateChannel;

      if (options.check) {
        const result = await checker.check(info.currentVersion, channel);
        if (result.available) {
          console.log(`Update available: ${result.latestVersion} (${channel})`);
          console.log(`Release notes: ${result.releaseNotes.slice(0, 200)}`);
        } else {
          console.log('Already up to date.');
        }
        return;
      }

      console.log(`Checking for updates on ${channel} channel...`);
      const result = await updater.update(channel);

      if (result.success) {
        console.log(`Updated to ${result.newVersion} (took ${result.durationMs}ms)`);
      } else if (result.rolledBack) {
        console.error(`Update failed and was rolled back: ${result.error}`);
        process.exit(1);
      } else {
        console.error(`Update failed: ${result.error}`);
        process.exit(1);
      }
    });
}
```

**Step 2: Register in CLI index**

Add to `packages/cli/src/index.ts`:
```typescript
import { createUpdateCommand } from './commands/update.js';
// ... in command registration:
program.addCommand(createUpdateCommand());
```

**Step 3: Add dependency to CLI package.json**

Add `"@auxiora/updater": "workspace:*"` to `dependencies` in `packages/cli/package.json`.

**Step 4: Verify build**

Run: `pnpm install && pnpm -r build`
Expected: All packages build.

**Step 5: Commit**

```bash
git add packages/cli/ packages/updater/
git commit -m "feat(cli): add auxiora update command"
```

---

### Task 11: Gateway Endpoint

**Files:**
- Modify: `packages/gateway/src/server.ts` (add `/api/v1/update/status` route)
- Modify: `packages/gateway/package.json` (add `@auxiora/updater` dependency)

**Step 1: Add the route**

In `setupRoutes()` in `packages/gateway/src/server.ts`, add after the existing `/api/v1` route:

```typescript
// Update status endpoint
this.app.get('/api/v1/update/status', async (req: Request, res: Response) => {
  try {
    const { InstallationDetector, VersionChecker } = await import('@auxiora/updater');
    const detector = new InstallationDetector();
    const info = detector.detect();
    const checker = new VersionChecker('trollByte', 'auxiora');
    const checkResult = await checker.check(info.currentVersion, 'stable');

    res.json({
      currentVersion: info.currentVersion,
      installMethod: info.method,
      canSelfUpdate: info.canSelfUpdate,
      updateAvailable: checkResult.available,
      latestVersion: checkResult.latestVersion,
      channel: 'stable',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check update status' });
  }
});
```

**Step 2: Verify build, commit**

```bash
git add packages/gateway/
git commit -m "feat(gateway): add /api/v1/update/status endpoint"
```

---

### Task 12: Final Integration + Full Test Run

**Step 1: Update barrel exports**

Ensure `packages/updater/src/index.ts` exports everything:

```typescript
// Types
export type { InstallMethod, UpdateChannel, InstallationInfo, ReleaseAsset, UpdateCheckResult, StagedUpdate, UpdateResult, UpdatePreferences, UpdateStrategy } from './types.js';
export { DEFAULT_UPDATE_PREFERENCES } from './types.js';

// Core classes
export { InstallationDetector } from './detector.js';
export { VersionChecker } from './version-checker.js';
export { HealthChecker } from './health-checker.js';
export { Updater } from './updater.js';

// Strategies
export { createStrategyMap } from './strategies/index.js';
export { NpmStrategy } from './strategies/npm.js';
export { GitStrategy } from './strategies/git.js';
export { DockerStrategy } from './strategies/docker.js';
export { AptStrategy } from './strategies/apt.js';
export { BrewStrategy } from './strategies/brew.js';
export { TarballStrategy } from './strategies/tarball.js';
export { K8sStrategy } from './strategies/k8s.js';

// Utilities
export { safeExecFile } from './util/exec.js';
export { downloadFile } from './util/download.js';
```

**Step 2: Run full test suite**

Run: `npx vitest run packages/updater/tests/`
Expected: All updater tests pass.

Run: `npx vitest run`
Expected: Full monorepo test suite passes (no regressions).

**Step 3: Type check**

Run: `pnpm -r typecheck`
Expected: No errors.

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(updater): finalize self-update system with full test suite"
```

---

## Task Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Package scaffolding | 3 create | — |
| 2 | Types | 1 create, 1 modify | — |
| 3 | Safe exec utility | 1 create | 4 tests |
| 4 | Installation detector | 1 create, 1 modify | 9 tests |
| 5 | Version checker | 1 create, 1 modify | 5 tests |
| 6 | Health checker | 1 create, 1 modify | 3 tests |
| 7 | Tarball strategy (reference) | 2 create | ~5 tests |
| 8 | Remaining 6 strategies + factory | 7 create, 6 test files | ~25 tests |
| 9 | Updater orchestrator | 1 create, 1 modify | ~6 tests |
| 10 | CLI command | 1 create, 2 modify | — |
| 11 | Gateway endpoint | 2 modify | — |
| 12 | Final integration | verify all | full suite |
