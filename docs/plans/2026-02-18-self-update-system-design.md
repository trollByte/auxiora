# Self-Update System Design

**Date:** 2026-02-18
**Status:** Approved

## Problem

Auxiora has 7 installation methods (npm, git clone, Docker, apt, Homebrew, tarball, Kubernetes) but no self-update mechanism. Users must manually check for and apply updates through their installation channel. When a user tells Auxiora "update yourself", she should detect how she was installed and handle the update automatically.

## Requirements

- Detect installation method automatically
- Check for updates with channel support (stable/beta/nightly)
- Download, apply, and auto-restart with zero user intervention
- Automatic rollback if health check fails after restart
- Proactive daily background check with notification
- Explicit CLI command (`auxiora update`) and chat trigger ("update yourself")
- Works across all 7 installation methods + unknown fallback

## Architecture

**Pattern:** Strategy pattern with per-method updaters.

**New package:** `packages/updater/` — consumed by CLI, behaviors, and chat runtime.

## Installation Detection

`InstallationDetector` identifies how Auxiora was installed. First match wins:

| Priority | Check | Method |
|----------|-------|--------|
| 1 | `/.dockerenv` exists | `docker` |
| 2 | `KUBERNETES_SERVICE_HOST` env set | `k8s` |
| 3 | `AUXIORA_INSTALL_METHOD` env set | Explicit override |
| 4 | Executable path contains `Homebrew` or `Cellar` | `brew` |
| 5 | `/var/lib/dpkg/info/auxiora.list` exists | `apt` |
| 6 | `.git` directory in project root | `git` |
| 7 | `npm ls -g auxiora` succeeds | `npm` |
| 8 | Executable under `~/.local/lib/auxiora/` or `/opt/auxiora/` | `tarball` |
| 9 | None matched | `unknown` (show manual instructions) |

Returns `InstallationInfo`:

```typescript
type InstallMethod = 'npm' | 'git' | 'docker' | 'apt' | 'brew' | 'tarball' | 'k8s' | 'unknown';

interface InstallationInfo {
  method: InstallMethod;
  currentVersion: string;
  installPath: string;
  canSelfUpdate: boolean;       // false for 'unknown'
  requiresSudo: boolean;        // true for apt, some tarball installs
  containerRuntime?: 'docker' | 'podman';
}
```

## Version Checking

`VersionChecker` queries GitHub Releases API with channel filtering and 1-hour response caching.

**Channel mapping:**
- `stable` — no prerelease flag, no `-` suffix (e.g., `v2.1.0`)
- `beta` — prerelease flag or `-beta`/`-rc` suffix (e.g., `v2.1.0-beta.3`)
- `nightly` — tagged `nightly` or `-nightly` suffix

```typescript
interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  channel: UpdateChannel;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: number;
  assets: ReleaseAsset[];
}
```

Proactive check runs daily, respects `disableUpdateCheck` preference.

## Update Strategies

Common interface:

```typescript
interface UpdateStrategy {
  readonly method: InstallMethod;
  stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate>;
  apply(staged: StagedUpdate): Promise<void>;
  restart(info: InstallationInfo): Promise<void>;
  rollback(staged: StagedUpdate): Promise<void>;
  cleanup(staged: StagedUpdate): Promise<void>;
}

interface StagedUpdate {
  targetVersion: string;
  previousVersion: string;
  backupPath: string;
  stagedPath: string;
  method: InstallMethod;
  timestamp: number;
}
```

**Per-strategy behavior:**

| Strategy | Stage | Apply | Restart | Rollback |
|----------|-------|-------|---------|----------|
| **Npm** | `npm pack` to temp | `npm install -g auxiora@{ver}` | Kill gateway, daemon restarts | `npm install -g auxiora@{prev}` |
| **Git** | `git fetch --tags` | `git checkout v{ver}` + `pnpm install` + `pnpm build` | Kill gateway, daemon restarts | `git checkout v{prev}` + rebuild |
| **Docker** | `docker pull ghcr.io/...:{tag}` | `docker stop` + `rm` + `run` (preserve volumes/env) | Implicit (new container) | `docker run` with previous tag |
| **Apt** | `apt download auxiora={ver}` | `sudo apt install auxiora={ver}` | `sudo systemctl restart auxiora` | `sudo apt install auxiora={prev}` |
| **Brew** | `brew fetch auxiora` | `brew upgrade auxiora` | Kill gateway, daemon restarts | `brew install auxiora@{prev}` |
| **Tarball** | Download from GitHub release assets | Move old dir to backup, extract new | Kill gateway, daemon restarts | Move backup back |
| **K8s** | Validate image in registry | `kubectl set image` | K8s rolling restart | `kubectl rollout undo` |

**Security note:** All shell commands use `execFile` (not `exec`) to prevent injection. The project provides `src/utils/execFileNoThrow.ts` for safe subprocess execution.

## Orchestration

`Updater` class runs the full lifecycle:

```
1. detect()           -> InstallationInfo
2. check()            -> UpdateCheckResult
3. strategy.stage()   -> StagedUpdate
4. strategy.apply()   -> void
5. strategy.restart() -> void
6. healthCheck()      -> pass/fail
   |-- pass -> strategy.cleanup() -> success
   |-- fail -> strategy.rollback() -> strategy.restart() -> failure
```

**Health check:** Poll `GET /health` up to 10 times at 2-second intervals. Verify response contains the new version string.

**Crash recovery:** `StagedUpdate` is persisted to `$XDG_DATA_HOME/auxiora/last-update.json` before apply starts. On next startup, if the file exists, the updater detects an incomplete update and rolls back.

```typescript
interface UpdateResult {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  method: InstallMethod;
  rolledBack: boolean;
  error?: string;
  durationMs: number;
}
```

## Integration Points

### CLI Command

```
auxiora update                    # check + update on stable channel
auxiora update --check            # check only
auxiora update --channel beta     # update from beta channel
auxiora update --rollback         # roll back to previous version
auxiora update --force            # skip "already up to date"
```

### Proactive Behavior

Built-in behavior in `packages/behaviors/`:
- Runs daily via cron
- Calls `updater.check()`
- Notifies user through channel system if update available
- Does NOT auto-install (user triggers via chat or CLI)
- Respects `disableUpdateCheck` preference

### Chat Integration

User says "update yourself" -> runtime calls `updater.update()` -> streams progress to chat -> reports result.

### Gateway Endpoint

`GET /api/v1/update/status` — returns current version, install method, last check, available update. Used by dashboard for update badge.

### Preferences

```typescript
interface UpdatePreferences {
  channel: 'stable' | 'beta' | 'nightly';  // default: 'stable'
  disableUpdateCheck: boolean;               // default: false
  checkIntervalHours: number;                // default: 24
  autoUpdate: boolean;                       // default: false (future)
  lastCheckTimestamp: number;
  lastUpdateResult?: UpdateResult;
}
```

## Package Structure

```
packages/updater/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── detector.ts
│   ├── version-checker.ts
│   ├── health-checker.ts
│   ├── updater.ts
│   ├── strategies/
│   │   ├── index.ts
│   │   ├── npm.ts
│   │   ├── git.ts
│   │   ├── docker.ts
│   │   ├── apt.ts
│   │   ├── brew.ts
│   │   ├── tarball.ts
│   │   └── k8s.ts
│   └── util/
│       ├── exec.ts               # Safe execFile wrapper (no shell injection)
│       └── download.ts           # Fetch + verify (checksum) helper
└── tests/
    ├── detector.test.ts
    ├── version-checker.test.ts
    ├── health-checker.test.ts
    ├── updater.test.ts
    └── strategies/
        ├── npm.test.ts
        ├── git.test.ts
        ├── docker.test.ts
        ├── apt.test.ts
        ├── brew.test.ts
        ├── tarball.test.ts
        └── k8s.test.ts
```

**Dependencies:** No new external deps. Uses Node built-ins (`child_process/execFile`, `fs`, `fetch`). Internal: `@auxiora/logger`.

**Testing:** All strategies tested with mocked `execFile`. Detector mocks filesystem/env. Orchestrator injects mock strategies to verify the full lifecycle flow.
