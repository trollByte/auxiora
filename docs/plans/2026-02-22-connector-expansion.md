# Connector Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new connectors (Spotify, Philips Hue, Obsidian) and a CLI scaffold command to make adding future connectors trivial.

**Architecture:** Each connector follows the existing pattern from `connector-github`: uses `defineConnector()` from `@auxiora/connectors`, declares auth config, actions with trust levels, triggers, and an `executeAction` handler. A scaffold CLI command generates the boilerplate.

**Tech Stack:** TypeScript ESM, vitest, existing `@auxiora/connectors` framework, Spotify Web API, Philips Hue API, Obsidian Local REST API

---

## Background

The connector framework (`packages/connectors/src/`) provides:
- `Connector` interface with `id`, `name`, `auth`, `actions[]`, `triggers[]`, `entities[]`, `executeAction()`
- `ConnectorRegistry` for registration/lookup
- `AuthManager` for OAuth2/API key flows
- `defineConnector()` helper (from `@auxiora/connectors`)

**Template pattern** (from `connector-github`):
```typescript
import { defineConnector } from '@auxiora/connectors';

export const myConnector = defineConnector({
  id: 'my-service',
  name: 'My Service',
  description: '...',
  version: '1.0.0',
  category: 'category',
  auth: { type: 'oauth2', oauth2: { authUrl, tokenUrl, scopes } },
  actions: [
    { id: 'action-name', name: 'Action', description: '...', trustMinimum: 1, trustDomain: 'integrations', reversible: false, sideEffects: false, params: { ... } },
  ],
  triggers: [],
  entities: [],
  executeAction: async (actionId, params, token) => { ... },
});
```

### Key files to understand:
- `packages/connectors/src/types.ts` — `Connector`, `ActionDefinition`, `TriggerDefinition`
- `packages/connector-github/src/connector.ts` — reference implementation

---

### Task 1: Connector Scaffold CLI Command

**Files:**
- Create: `packages/cli/src/commands/connector.ts`
- Create: `packages/cli/src/templates/connector/` — template files
- Test: `packages/cli/tests/connector-scaffold.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/tests/connector-scaffold.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scaffoldConnector } from '../src/commands/connector.js';

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-scaffold-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('scaffoldConnector', () => {
  it('should create connector package structure', async () => {
    await scaffoldConnector('weather', testDir);

    const base = path.join(testDir, 'connector-weather');
    expect(fs.existsSync(path.join(base, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'src', 'connector.ts'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'tests', 'connector.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'tsconfig.json'))).toBe(true);
  });

  it('should include correct connector id in generated code', async () => {
    await scaffoldConnector('weather', testDir);

    const src = fs.readFileSync(
      path.join(testDir, 'connector-weather', 'src', 'connector.ts'), 'utf-8'
    );
    expect(src).toContain("id: 'weather'");
    expect(src).toContain("name: 'Weather'");
    expect(src).toContain('defineConnector');
  });
});
```

**Step 2–5: Implement `scaffoldConnector()` that writes template files, test, commit.**

```bash
git commit -m "feat(cli): add 'auxiora connector create' scaffold command"
```

---

### Task 2: Spotify Connector

**Files:**
- Create: `packages/connector-spotify/package.json`
- Create: `packages/connector-spotify/src/connector.ts`
- Create: `packages/connector-spotify/tests/connector.test.ts`
- Create: `packages/connector-spotify/tsconfig.json`

**Auth:** OAuth2 — Spotify Web API
- Auth URL: `https://accounts.spotify.com/authorize`
- Token URL: `https://accounts.spotify.com/api/token`
- Scopes: `user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-modify-public playlist-modify-private`

**Actions:**

| Action ID | Name | Trust | Side Effects | Params |
|-----------|------|-------|-------------|--------|
| `playback-play` | Play | 2 | yes | `uri?` (track/playlist URI) |
| `playback-pause` | Pause | 2 | yes | — |
| `playback-skip` | Skip Track | 2 | yes | `direction` (next/previous) |
| `playback-current` | Get Current Track | 1 | no | — |
| `search` | Search | 1 | no | `query`, `type` (track/album/artist/playlist) |
| `playlist-create` | Create Playlist | 2 | yes | `name`, `description?`, `public?` |
| `playlist-add` | Add to Playlist | 2 | yes | `playlistId`, `uris[]` |
| `playback-volume` | Set Volume | 2 | yes | `volumePercent` (0–100) |

**Triggers:**

| Trigger ID | Name | Type | Poll Interval |
|-----------|------|------|---------------|
| `track-changed` | Track Changed | poll | 10000ms |

**Step 1: Write the failing test**

```typescript
// packages/connector-spotify/tests/connector.test.ts
import { describe, it, expect } from 'vitest';
import { spotifyConnector } from '../src/connector.js';

describe('spotifyConnector', () => {
  it('should have correct id and name', () => {
    expect(spotifyConnector.id).toBe('spotify');
    expect(spotifyConnector.name).toBe('Spotify');
  });

  it('should use OAuth2 auth', () => {
    expect(spotifyConnector.auth.type).toBe('oauth2');
    expect(spotifyConnector.auth.oauth2?.authUrl).toContain('accounts.spotify.com');
  });

  it('should have playback and search actions', () => {
    const actionIds = spotifyConnector.actions.map(a => a.id);
    expect(actionIds).toContain('playback-play');
    expect(actionIds).toContain('playback-pause');
    expect(actionIds).toContain('playback-current');
    expect(actionIds).toContain('search');
    expect(actionIds).toContain('playlist-create');
  });

  it('should mark playback actions as having side effects', () => {
    const play = spotifyConnector.actions.find(a => a.id === 'playback-play');
    expect(play?.sideEffects).toBe(true);
    expect(play?.trustMinimum).toBeGreaterThanOrEqual(2);
  });

  it('should mark search as read-only', () => {
    const search = spotifyConnector.actions.find(a => a.id === 'search');
    expect(search?.sideEffects).toBe(false);
    expect(search?.trustMinimum).toBe(1);
  });

  it('should have track-changed trigger', () => {
    expect(spotifyConnector.triggers.map(t => t.id)).toContain('track-changed');
  });
});
```

**Step 2–5: Implement connector following the GitHub connector pattern, test, commit.**

```bash
git commit -m "feat(connector-spotify): add Spotify connector with playback, search, playlists"
```

---

### Task 3: Philips Hue Connector

**Files:**
- Create: `packages/connector-hue/package.json`
- Create: `packages/connector-hue/src/connector.ts`
- Create: `packages/connector-hue/tests/connector.test.ts`
- Create: `packages/connector-hue/tsconfig.json`

**Auth:** API key — Hue Bridge local API (user presses bridge button, then POST to `/api` to get username/key). Config stores bridge IP + username.

**Actions:**

| Action ID | Name | Trust | Side Effects | Params |
|-----------|------|-------|-------------|--------|
| `lights-list` | List Lights | 1 | no | — |
| `lights-get` | Get Light State | 1 | no | `lightId` |
| `lights-set` | Set Light | 2 | yes | `lightId`, `on?`, `brightness?` (0–254), `hue?`, `sat?`, `colorTemp?` |
| `lights-toggle` | Toggle Light | 2 | yes | `lightId` |
| `scenes-list` | List Scenes | 1 | no | — |
| `scenes-activate` | Activate Scene | 2 | yes | `sceneId` |
| `groups-list` | List Rooms/Zones | 1 | no | — |
| `groups-set` | Set Room State | 2 | yes | `groupId`, `on?`, `brightness?`, `scene?` |

**Triggers:**

| Trigger ID | Name | Type | Poll Interval |
|-----------|------|------|---------------|
| `motion-detected` | Motion Detected | poll | 5000ms |

```bash
git commit -m "feat(connector-hue): add Philips Hue connector with lights, scenes, rooms"
```

---

### Task 4: Obsidian Connector

**Files:**
- Create: `packages/connector-obsidian/package.json`
- Create: `packages/connector-obsidian/src/connector.ts`
- Create: `packages/connector-obsidian/tests/connector.test.ts`
- Create: `packages/connector-obsidian/tsconfig.json`

**Auth:** API key — Obsidian Local REST API plugin (user installs Obsidian plugin, gets API key, configures `host:port` + key in Auxiora config).

**API base:** `https://localhost:27124` (default Obsidian Local REST API port)

**Actions:**

| Action ID | Name | Trust | Side Effects | Params |
|-----------|------|-------|-------------|--------|
| `note-read` | Read Note | 1 | no | `path` (vault-relative path, e.g. `Daily/2026-02-22.md`) |
| `note-write` | Write Note | 2 | yes | `path`, `content` |
| `note-append` | Append to Note | 2 | yes | `path`, `content` |
| `note-create` | Create Note | 2 | yes | `path`, `content` |
| `notes-list` | List Notes | 1 | no | `folder?` |
| `notes-search` | Search Notes | 1 | no | `query` (full-text search) |
| `daily-note` | Get/Create Daily Note | 1 | no | `date?` (YYYY-MM-DD, defaults to today) |
| `tags-list` | List Tags | 1 | no | — |

**Triggers:**

| Trigger ID | Name | Type | Poll Interval |
|-----------|------|------|---------------|
| `note-modified` | Note Modified | poll | 30000ms |

```bash
git commit -m "feat(connector-obsidian): add Obsidian connector with notes, search, daily notes"
```

---

### Task 5: Register Connectors in Runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` — import and register the three new connectors
- Modify: root `pnpm-workspace.yaml` — ensure new packages are discovered

```bash
git commit -m "feat(runtime): register Spotify, Hue, and Obsidian connectors"
```

---

### Task 6: Integration Tests

**Files:**
- Create: `packages/connector-spotify/tests/actions.test.ts` — mock API tests for executeAction
- Create: `packages/connector-hue/tests/actions.test.ts` — mock API tests
- Create: `packages/connector-obsidian/tests/actions.test.ts` — mock API tests

Each test mocks `fetch` and verifies the correct API calls are made for each action.

```bash
git commit -m "test(connectors): add mock API tests for Spotify, Hue, and Obsidian connectors"
```
