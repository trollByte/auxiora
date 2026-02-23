# Marketplace Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the registry backend service that powers plugin and personality discovery, installation, and publishing — the server side of the existing `RegistryClient`.

**Architecture:** A Fastify HTTP service backed by SQLite (via better-sqlite3), serving the exact API endpoints that `RegistryClient` already calls. Packages are stored as tarballs on disk (`~/.auxiora/registry/packages/`). API key auth for publish operations, open read for search/install. Runs as an optional sidecar to the gateway.

**Tech Stack:** TypeScript ESM, Fastify, better-sqlite3, vitest, existing `@auxiora/marketplace` types

---

## Background

The marketplace client (`packages/marketplace/src/registry.ts`) already exists and calls these endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/plugins/search` | Search plugins (q, keywords, author, sort, limit, offset) |
| GET | `/api/v1/plugins/:name` | Get single plugin listing |
| POST | `/api/v1/plugins/install` | Install a plugin (name, version, installDir) |
| POST | `/api/v1/plugins/publish` | Publish a plugin (path to tarball/dir) |
| GET | `/api/v1/personalities/search` | Search personalities |
| GET | `/api/v1/personalities/:name` | Get single personality listing |
| POST | `/api/v1/personalities/install` | Install a personality |
| POST | `/api/v1/personalities/publish` | Publish a personality |

### Key files to understand:
- `packages/marketplace/src/registry.ts` — `RegistryClient` (the API consumer)
- `packages/marketplace/src/types.ts` — `PluginListing`, `PersonalityListing`, `SearchResult`, etc.

---

### Task 1: Database Schema & Repository Layer

**Files:**
- Create: `packages/marketplace/src/server/db.ts`
- Test: `packages/marketplace/tests/server/db.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/marketplace/tests/server/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RegistryDatabase } from '../../src/server/db.js';

let db: RegistryDatabase;
let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-db-'));
  db = new RegistryDatabase(path.join(testDir, 'registry.db'));
});

afterEach(() => {
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('RegistryDatabase — plugins', () => {
  it('should insert and retrieve a plugin', () => {
    db.upsertPlugin({
      name: 'hello_world',
      version: '1.0.0',
      description: 'Says hello',
      author: 'tester',
      license: 'MIT',
      permissions: [],
      keywords: ['greeting'],
      homepage: 'https://example.com',
      repository: 'https://github.com/test/hello',
    });

    const plugin = db.getPlugin('hello_world');
    expect(plugin).not.toBeNull();
    expect(plugin!.name).toBe('hello_world');
    expect(plugin!.version).toBe('1.0.0');
    expect(plugin!.downloads).toBe(0);
    expect(plugin!.rating).toBe(0);
    expect(plugin!.keywords).toEqual(['greeting']);
  });

  it('should search plugins by query', () => {
    db.upsertPlugin({ name: 'weather_tool', version: '1.0.0', description: 'Gets weather data', author: 'alice', license: 'MIT', permissions: [], keywords: ['weather'] });
    db.upsertPlugin({ name: 'calendar_sync', version: '2.0.0', description: 'Syncs calendars', author: 'bob', license: 'MIT', permissions: [], keywords: ['calendar'] });

    const result = db.searchPlugins({ query: 'weather' });
    expect(result.total).toBe(1);
    expect(result.plugins[0].name).toBe('weather_tool');
  });

  it('should search plugins by author', () => {
    db.upsertPlugin({ name: 'tool_a', version: '1.0.0', description: 'A', author: 'alice', license: 'MIT', permissions: [], keywords: [] });
    db.upsertPlugin({ name: 'tool_b', version: '1.0.0', description: 'B', author: 'bob', license: 'MIT', permissions: [], keywords: [] });

    const result = db.searchPlugins({ author: 'alice' });
    expect(result.total).toBe(1);
    expect(result.plugins[0].author).toBe('alice');
  });

  it('should paginate results', () => {
    for (let i = 0; i < 25; i++) {
      db.upsertPlugin({ name: `plugin_${i}`, version: '1.0.0', description: `Plugin ${i}`, author: 'tester', license: 'MIT', permissions: [], keywords: [] });
    }

    const page1 = db.searchPlugins({ limit: 10, offset: 0 });
    expect(page1.plugins.length).toBe(10);
    expect(page1.total).toBe(25);

    const page2 = db.searchPlugins({ limit: 10, offset: 10 });
    expect(page2.plugins.length).toBe(10);

    const page3 = db.searchPlugins({ limit: 10, offset: 20 });
    expect(page3.plugins.length).toBe(5);
  });

  it('should increment download count', () => {
    db.upsertPlugin({ name: 'popular', version: '1.0.0', description: 'Popular', author: 'tester', license: 'MIT', permissions: [], keywords: [] });
    db.incrementDownloads('popular');
    db.incrementDownloads('popular');

    const plugin = db.getPlugin('popular');
    expect(plugin!.downloads).toBe(2);
  });

  it('should update version on upsert', () => {
    db.upsertPlugin({ name: 'evolving', version: '1.0.0', description: 'v1', author: 'tester', license: 'MIT', permissions: [], keywords: [] });
    db.upsertPlugin({ name: 'evolving', version: '2.0.0', description: 'v2', author: 'tester', license: 'MIT', permissions: [], keywords: [] });

    const plugin = db.getPlugin('evolving');
    expect(plugin!.version).toBe('2.0.0');
    expect(plugin!.description).toBe('v2');
  });
});

describe('RegistryDatabase — personalities', () => {
  it('should insert and retrieve a personality', () => {
    db.upsertPersonality({
      name: 'friendly_bot',
      version: '1.0.0',
      description: 'A friendly personality',
      author: 'tester',
      preview: 'Hey there! How can I help?',
      tone: { warmth: 0.9, humor: 0.5, formality: 0.2 },
      keywords: ['friendly', 'casual'],
    });

    const p = db.getPersonality('friendly_bot');
    expect(p).not.toBeNull();
    expect(p!.tone.warmth).toBe(0.9);
    expect(p!.keywords).toEqual(['friendly', 'casual']);
  });

  it('should search personalities by query', () => {
    db.upsertPersonality({ name: 'formal_assistant', version: '1.0.0', description: 'Very formal', author: 'alice', preview: 'Good day.', tone: { warmth: 0.3, humor: 0.1, formality: 0.9 }, keywords: ['formal'] });
    db.upsertPersonality({ name: 'jokester', version: '1.0.0', description: 'Loves jokes', author: 'bob', preview: 'Why did the chicken...', tone: { warmth: 0.8, humor: 0.9, formality: 0.1 }, keywords: ['funny'] });

    const result = db.searchPersonalities({ query: 'formal' });
    expect(result.total).toBe(1);
    expect(result.personalities[0].name).toBe('formal_assistant');
  });
});
```

**Step 2–5: Implement `RegistryDatabase` with SQLite tables for plugins and personalities. Test, commit.**

Database schema:

```sql
CREATE TABLE plugins (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  license TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',  -- JSON array
  keywords TEXT NOT NULL DEFAULT '[]',      -- JSON array
  downloads INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  homepage TEXT,
  repository TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE personalities (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  preview TEXT NOT NULL,
  warmth REAL NOT NULL,
  humor REAL NOT NULL,
  formality REAL NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  downloads INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```bash
git commit -m "feat(marketplace): add RegistryDatabase with SQLite schema for plugins and personalities"
```

---

### Task 2: Package Storage Service

Handles tarball storage and retrieval for published plugins/personalities.

**Files:**
- Create: `packages/marketplace/src/server/storage.ts`
- Test: `packages/marketplace/tests/server/storage.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/marketplace/tests/server/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PackageStorage } from '../../src/server/storage.js';

let storage: PackageStorage;
let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-storage-'));
  storage = new PackageStorage(testDir);
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('PackageStorage', () => {
  it('should store and retrieve a plugin package', async () => {
    const content = Buffer.from('fake-tarball-content');
    await storage.store('plugins', 'hello_world', '1.0.0', content);

    const retrieved = await storage.retrieve('plugins', 'hello_world', '1.0.0');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.equals(content)).toBe(true);
  });

  it('should return null for non-existent package', async () => {
    const result = await storage.retrieve('plugins', 'nonexistent', '1.0.0');
    expect(result).toBeNull();
  });

  it('should list versions for a package', async () => {
    await storage.store('plugins', 'multi', '1.0.0', Buffer.from('v1'));
    await storage.store('plugins', 'multi', '2.0.0', Buffer.from('v2'));

    const versions = await storage.listVersions('plugins', 'multi');
    expect(versions).toContain('1.0.0');
    expect(versions).toContain('2.0.0');
  });

  it('should delete a specific version', async () => {
    await storage.store('plugins', 'temp', '1.0.0', Buffer.from('data'));
    await storage.remove('plugins', 'temp', '1.0.0');

    const result = await storage.retrieve('plugins', 'temp', '1.0.0');
    expect(result).toBeNull();
  });

  it('should prevent path traversal in name', async () => {
    await expect(
      storage.store('plugins', '../escape', '1.0.0', Buffer.from('bad'))
    ).rejects.toThrow('Invalid package name');
  });

  it('should store personality packages in separate namespace', async () => {
    const pluginContent = Buffer.from('plugin-data');
    const personalityContent = Buffer.from('personality-data');

    await storage.store('plugins', 'shared_name', '1.0.0', pluginContent);
    await storage.store('personalities', 'shared_name', '1.0.0', personalityContent);

    const plugin = await storage.retrieve('plugins', 'shared_name', '1.0.0');
    const personality = await storage.retrieve('personalities', 'shared_name', '1.0.0');

    expect(plugin!.equals(pluginContent)).toBe(true);
    expect(personality!.equals(personalityContent)).toBe(true);
  });
});
```

**Step 2–5: Implement `PackageStorage` with filesystem-based storage under `<baseDir>/plugins/<name>/<version>.tgz`. Test, commit.**

```bash
git commit -m "feat(marketplace): add PackageStorage for tarball persistence"
```

---

### Task 3: API Routes — Plugin Endpoints

**Files:**
- Create: `packages/marketplace/src/server/routes/plugins.ts`
- Test: `packages/marketplace/tests/server/routes/plugins.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/marketplace/tests/server/routes/plugins.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { pluginRoutes } from '../../../src/server/routes/plugins.js';
import { RegistryDatabase } from '../../../src/server/db.js';
import { PackageStorage } from '../../../src/server/storage.js';

let app: FastifyInstance;
let testDir: string;
let db: RegistryDatabase;

beforeEach(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-routes-'));
  db = new RegistryDatabase(path.join(testDir, 'registry.db'));
  const storage = new PackageStorage(path.join(testDir, 'packages'));

  app = Fastify();
  await app.register(pluginRoutes, { db, storage, apiKeys: ['test-key-123'] });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('GET /api/v1/plugins/search', () => {
  it('should return empty results when no plugins exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/plugins/search' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.plugins).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('should return matching plugins', async () => {
    db.upsertPlugin({ name: 'weather', version: '1.0.0', description: 'Weather tool', author: 'alice', license: 'MIT', permissions: [], keywords: ['weather'] });

    const res = await app.inject({ method: 'GET', url: '/api/v1/plugins/search?q=weather' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.plugins.length).toBe(1);
    expect(body.plugins[0].name).toBe('weather');
  });

  it('should support pagination', async () => {
    for (let i = 0; i < 15; i++) {
      db.upsertPlugin({ name: `p${i}`, version: '1.0.0', description: `P${i}`, author: 'tester', license: 'MIT', permissions: [], keywords: [] });
    }

    const res = await app.inject({ method: 'GET', url: '/api/v1/plugins/search?limit=5&offset=10' });
    const body = JSON.parse(res.payload);
    expect(body.plugins.length).toBe(5);
    expect(body.total).toBe(15);
    expect(body.offset).toBe(10);
  });
});

describe('GET /api/v1/plugins/:name', () => {
  it('should return 404 for unknown plugin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/plugins/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('should return plugin details', async () => {
    db.upsertPlugin({ name: 'my_plugin', version: '2.0.0', description: 'My plugin', author: 'bob', license: 'MIT', permissions: ['network'], keywords: ['util'] });

    const res = await app.inject({ method: 'GET', url: '/api/v1/plugins/my_plugin' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('my_plugin');
    expect(body.version).toBe('2.0.0');
  });
});

describe('POST /api/v1/plugins/publish', () => {
  it('should reject without API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      payload: { name: 'test', version: '1.0.0', description: 'Test', author: 'tester', license: 'MIT' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should accept publish with valid API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      headers: { authorization: 'Bearer test-key-123' },
      payload: {
        name: 'new_plugin',
        version: '1.0.0',
        description: 'A new plugin',
        author: 'tester',
        license: 'MIT',
        permissions: [],
        keywords: [],
        content: Buffer.from('fake-package').toString('base64'),
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.name).toBe('new_plugin');
  });
});

describe('POST /api/v1/plugins/install', () => {
  it('should return 404 for unknown plugin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/install',
      payload: { name: 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

**Step 2–5: Implement Fastify plugin routes that delegate to `RegistryDatabase` and `PackageStorage`. Test, commit.**

```bash
git commit -m "feat(marketplace): add plugin API routes (search, get, install, publish)"
```

---

### Task 4: API Routes — Personality Endpoints

**Files:**
- Create: `packages/marketplace/src/server/routes/personalities.ts`
- Test: `packages/marketplace/tests/server/routes/personalities.test.ts`

Mirrors the plugin routes for personality-specific endpoints. Same pattern: search, get, install, publish.

**Step 1: Write the failing test**

```typescript
// packages/marketplace/tests/server/routes/personalities.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { personalityRoutes } from '../../../src/server/routes/personalities.js';
import { RegistryDatabase } from '../../../src/server/db.js';
import { PackageStorage } from '../../../src/server/storage.js';

let app: FastifyInstance;
let testDir: string;
let db: RegistryDatabase;

beforeEach(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-personality-'));
  db = new RegistryDatabase(path.join(testDir, 'registry.db'));
  const storage = new PackageStorage(path.join(testDir, 'packages'));

  app = Fastify();
  await app.register(personalityRoutes, { db, storage, apiKeys: ['test-key-123'] });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('GET /api/v1/personalities/search', () => {
  it('should return empty results when no personalities exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/personalities/search' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.personalities).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('should return matching personalities', async () => {
    db.upsertPersonality({ name: 'comedian', version: '1.0.0', description: 'Always joking', author: 'alice', preview: 'Ha!', tone: { warmth: 0.7, humor: 0.95, formality: 0.1 }, keywords: ['funny'] });

    const res = await app.inject({ method: 'GET', url: '/api/v1/personalities/search?q=comedian' });
    const body = JSON.parse(res.payload);
    expect(body.personalities.length).toBe(1);
    expect(body.personalities[0].name).toBe('comedian');
  });
});

describe('GET /api/v1/personalities/:name', () => {
  it('should return 404 for unknown personality', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/personalities/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('should return personality details with tone', async () => {
    db.upsertPersonality({ name: 'formal', version: '1.0.0', description: 'Formal', author: 'bob', preview: 'Good day.', tone: { warmth: 0.3, humor: 0.1, formality: 0.9 }, keywords: [] });

    const res = await app.inject({ method: 'GET', url: '/api/v1/personalities/formal' });
    const body = JSON.parse(res.payload);
    expect(body.tone.formality).toBe(0.9);
  });
});

describe('POST /api/v1/personalities/publish', () => {
  it('should reject without API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/personalities/publish',
      payload: { name: 'test', version: '1.0.0' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

**Step 2–5: Implement personality routes following same pattern as plugin routes. Test, commit.**

```bash
git commit -m "feat(marketplace): add personality API routes (search, get, install, publish)"
```

---

### Task 5: Registry Server Entrypoint

**Files:**
- Create: `packages/marketplace/src/server/index.ts`
- Test: `packages/marketplace/tests/server/server.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/marketplace/tests/server/server.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createRegistryServer } from '../../src/server/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let testDir: string;

afterEach(() => {
  if (testDir) fs.rmSync(testDir, { recursive: true, force: true });
});

describe('createRegistryServer', () => {
  it('should create a configured server instance', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-server-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0, // random port
      apiKeys: ['key-1'],
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
    await server.close();
  });

  it('should respond to health check', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-health-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0,
      apiKeys: [],
    });

    const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');

    await server.close();
  });
});
```

**Step 2–5: Implement `createRegistryServer()` that wires `RegistryDatabase`, `PackageStorage`, and both route modules into a Fastify instance. Test, commit.**

```typescript
// packages/marketplace/src/server/index.ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RegistryDatabase } from './db.js';
import { PackageStorage } from './storage.js';
import { pluginRoutes } from './routes/plugins.js';
import { personalityRoutes } from './routes/personalities.js';

export interface RegistryServerConfig {
  dataDir: string;
  port: number;
  host?: string;
  apiKeys: string[];
}

export async function createRegistryServer(config: RegistryServerConfig): Promise<FastifyInstance> {
  fs.mkdirSync(config.dataDir, { recursive: true });

  const db = new RegistryDatabase(path.join(config.dataDir, 'registry.db'));
  const storage = new PackageStorage(path.join(config.dataDir, 'packages'));

  const app = Fastify({ logger: false });

  app.get('/api/v1/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(pluginRoutes, { db, storage, apiKeys: config.apiKeys });
  await app.register(personalityRoutes, { db, storage, apiKeys: config.apiKeys });

  app.addHook('onClose', () => {
    db.close();
  });

  await app.ready();
  return app;
}
```

```bash
git commit -m "feat(marketplace): add createRegistryServer entrypoint wiring all routes"
```

---

### Task 6: Wire into Gateway as Optional Sidecar

**Files:**
- Modify: `packages/gateway/src/server.ts` — optionally start registry server
- Modify: `packages/marketplace/src/index.ts` — export `createRegistryServer`

The gateway starts the registry server when `config.marketplace.enabled` is true. The registry runs on a separate port (default 18801) or as a route prefix on the same gateway.

```typescript
// In gateway startup, after main server listen:
if (config.marketplace?.enabled) {
  const { createRegistryServer } = await import('@auxiora/marketplace/server');
  const registryServer = await createRegistryServer({
    dataDir: config.marketplace.dataDir ?? path.join(getDataDir(), 'registry'),
    port: config.marketplace.port ?? 18801,
    apiKeys: config.marketplace.apiKeys ?? [],
  });
  await registryServer.listen({ port: config.marketplace.port ?? 18801, host: '127.0.0.1' });
}
```

```bash
git commit -m "feat(gateway): optionally start marketplace registry as sidecar"
```

---

### Task 7: Integration Test — Full Publish/Search/Install Flow

**Files:**
- Create: `packages/marketplace/tests/server/integration.test.ts`

End-to-end test: start server → publish plugin → search → get → install → verify download count incremented.

```typescript
// packages/marketplace/tests/server/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createRegistryServer } from '../../src/server/index.js';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let testDir: string;

beforeEach(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-integration-'));
  server = await createRegistryServer({
    dataDir: testDir,
    port: 0,
    apiKeys: ['integration-key'],
  });
});

afterEach(async () => {
  await server.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('registry integration', () => {
  it('should support full publish → search → install flow', async () => {
    // Publish
    const publishRes = await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      headers: { authorization: 'Bearer integration-key' },
      payload: {
        name: 'greeting_tool',
        version: '1.0.0',
        description: 'Says hello',
        author: 'tester',
        license: 'MIT',
        permissions: [],
        keywords: ['greeting', 'hello'],
        content: Buffer.from('fake-plugin-content').toString('base64'),
      },
    });
    expect(publishRes.statusCode).toBe(200);
    expect(JSON.parse(publishRes.payload).success).toBe(true);

    // Search
    const searchRes = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/search?q=greeting',
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.payload);
    expect(searchBody.total).toBe(1);
    expect(searchBody.plugins[0].name).toBe('greeting_tool');

    // Get details
    const getRes = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/greeting_tool',
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.payload).version).toBe('1.0.0');

    // Install
    const installRes = await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/install',
      payload: { name: 'greeting_tool' },
    });
    expect(installRes.statusCode).toBe(200);
    expect(JSON.parse(installRes.payload).success).toBe(true);

    // Verify download count incremented
    const afterInstall = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/greeting_tool',
    });
    expect(JSON.parse(afterInstall.payload).downloads).toBeGreaterThanOrEqual(1);
  });
});
```

```bash
git commit -m "test(marketplace): add integration test for full publish/search/install flow"
```
