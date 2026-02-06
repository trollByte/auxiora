# Dashboard UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a web dashboard (React + Vite SPA) for monitoring and managing behaviors, webhooks, sessions, and audit logs, with password authentication.

**Architecture:** New `packages/dashboard/` contains the REST API router (Express), auth middleware with session cookies, and a React SPA built with Vite. The gateway serves static files at `/dashboard` and the API at `/api/v1/dashboard/`. The runtime mounts the dashboard router using `mountRouter()`.

**Tech Stack:** React 19, Vite, Express Router, CSS Modules, `node:crypto`, vitest

---

## Context for implementers

**Monorepo layout:** `packages/*` auto-discovered by pnpm. TypeScript strict ESM with `.js` extensions on all imports. Type imports use `import type { ... }`.

**Key files you'll modify:**
- `packages/config/src/index.ts` — Add `DashboardConfigSchema` to `ConfigSchema`
- `packages/config/tests/config.test.ts` — Add dashboard config tests
- `packages/audit/src/index.ts` — Add dashboard audit event types
- `packages/gateway/src/server.ts` — Add `getConnections()` public method
- `packages/runtime/src/index.ts` — Add dashboard initialization
- `packages/runtime/package.json` — Add `@auxiora/dashboard` dependency

**Existing patterns to follow:**
- `WebhookManager` in `packages/webhooks/` — REST API route creation pattern
- `mountRouter()` in `packages/gateway/src/server.ts` — route mounting
- `Vault.get()` / `Vault.add()` in `packages/vault/src/vault.ts` — password storage
- `AuditLogger.getEntries()` in `packages/audit/src/index.ts` — audit log reading

---

### Task 1: Add dashboard config, audit events, and gateway accessor

**Files:**
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/tests/config.test.ts`
- Modify: `packages/audit/src/index.ts`
- Modify: `packages/gateway/src/server.ts`

**Step 1: Add DashboardConfigSchema to config**

In `packages/config/src/index.ts`, after `WebhookConfigSchema`:

```typescript
const DashboardConfigSchema = z.object({
  enabled: z.boolean().default(false),
  sessionTtlMs: z.number().int().positive().default(86_400_000),
});
```

Then add `dashboard: DashboardConfigSchema.default({})` to `ConfigSchema` after `webhooks`.

**Step 2: Add dashboard config tests**

In `packages/config/tests/config.test.ts`, add after the webhook config describe block:

```typescript
describe('dashboard config', () => {
  it('should default dashboard to disabled', () => {
    const config = ConfigSchema.parse({});
    expect(config.dashboard.enabled).toBe(false);
    expect(config.dashboard.sessionTtlMs).toBe(86_400_000);
  });

  it('should accept custom dashboard config', () => {
    const config = ConfigSchema.parse({
      dashboard: { enabled: true, sessionTtlMs: 3_600_000 },
    });
    expect(config.dashboard.enabled).toBe(true);
    expect(config.dashboard.sessionTtlMs).toBe(3_600_000);
  });
});
```

**Step 3: Add dashboard audit events**

In `packages/audit/src/index.ts`, add before `| 'system.error'`:

```typescript
  | 'dashboard.login'
  | 'dashboard.logout'
  | 'dashboard.login_failed'
```

**Step 4: Add getConnections to gateway**

In `packages/gateway/src/server.ts`, after the `getClient` method, add:

```typescript
  public getConnections(): ClientConnection[] {
    return Array.from(this.clients.values());
  }
```

**Step 5: Run tests and commit**

Run: `pnpm test -- --run packages/config/ packages/audit/ packages/gateway/`

```bash
git add packages/config/ packages/audit/src/index.ts packages/gateway/src/server.ts
git commit -m "feat(config): add dashboard configuration, audit events, and gateway connections accessor"
```

---

### Task 2: Scaffold dashboard package with auth module

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/tsconfig.json`
- Create: `packages/dashboard/src/types.ts`
- Create: `packages/dashboard/src/auth.ts`
- Create: `packages/dashboard/src/index.ts`
- Create: `packages/dashboard/tests/auth.test.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/dashboard",
  "version": "1.0.0",
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
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*",
    "@auxiora/audit": "workspace:*"
  },
  "devDependencies": {
    "@types/express": "^5.0.0"
  }
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
    { "path": "../logger" },
    { "path": "../audit" }
  ]
}
```

**Step 3: Create types.ts**

```typescript
export interface DashboardConfig {
  enabled: boolean;
  sessionTtlMs: number;
}

export interface DashboardSession {
  id: string;
  createdAt: number;
  lastActive: number;
  ip: string;
}

export interface DashboardDeps {
  vault: {
    get(name: string): string | undefined;
    has(name: string): boolean;
    add(name: string, value: string): Promise<void>;
  };
  behaviors?: {
    list(filter?: { type?: string; status?: string }): Promise<any[]>;
    update(id: string, updates: Record<string, unknown>): Promise<any>;
    remove(id: string): Promise<boolean>;
  };
  webhooks?: {
    list(): Promise<any[]>;
    delete(id: string): Promise<boolean>;
  };
  getConnections: () => Array<{
    id: string;
    authenticated: boolean;
    channelType: string;
    lastActive: number;
    voiceActive?: boolean;
  }>;
  getAuditEntries: (limit?: number) => Promise<any[]>;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  enabled: false,
  sessionTtlMs: 86_400_000,
};

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 60_000;
```

**Step 4: Create auth.ts**

```typescript
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import type { DashboardSession } from './types.js';
import { MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } from './types.js';

const logger = getLogger('dashboard:auth');

export class DashboardAuth {
  private sessions = new Map<string, DashboardSession>();
  private sessionTtlMs: number;
  private loginAttempts = new Map<string, { count: number; windowStart: number }>();

  constructor(sessionTtlMs: number) {
    this.sessionTtlMs = sessionTtlMs;
  }

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = this.loginAttempts.get(ip);

    if (!entry) return false;

    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
      this.loginAttempts.delete(ip);
      return false;
    }

    return entry.count >= MAX_LOGIN_ATTEMPTS;
  }

  recordAttempt(ip: string): void {
    const now = Date.now();
    const entry = this.loginAttempts.get(ip);

    if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
      this.loginAttempts.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count++;
    }
  }

  createSession(ip: string): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.sessions.set(id, {
      id,
      createdAt: now,
      lastActive: now,
      ip,
    });

    logger.info('Dashboard session created', { sessionId: id });
    return id;
  }

  validateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    if (now - session.lastActive > this.sessionTtlMs) {
      this.sessions.delete(sessionId);
      return false;
    }

    session.lastActive = now;
    return true;
  }

  destroySession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > this.sessionTtlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
```

**Step 5: Create barrel exports**

```typescript
export type { DashboardConfig, DashboardSession, DashboardDeps } from './types.js';
export { DEFAULT_DASHBOARD_CONFIG } from './types.js';
export { DashboardAuth } from './auth.js';
```

**Step 6: Write auth tests**

Create `packages/dashboard/tests/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardAuth } from '../src/auth.js';
import { MAX_LOGIN_ATTEMPTS } from '../src/types.js';

describe('DashboardAuth', () => {
  let auth: DashboardAuth;

  beforeEach(() => {
    auth = new DashboardAuth(3_600_000); // 1 hour TTL
  });

  it('should create and validate a session', () => {
    const sessionId = auth.createSession('127.0.0.1');
    expect(auth.validateSession(sessionId)).toBe(true);
  });

  it('should reject unknown session', () => {
    expect(auth.validateSession('nonexistent')).toBe(false);
  });

  it('should expire sessions after TTL', () => {
    const shortAuth = new DashboardAuth(1); // 1ms TTL
    const sessionId = shortAuth.createSession('127.0.0.1');

    // Wait for expiry
    vi.useFakeTimers();
    vi.advanceTimersByTime(10);
    expect(shortAuth.validateSession(sessionId)).toBe(false);
    vi.useRealTimers();
  });

  it('should destroy a session on logout', () => {
    const sessionId = auth.createSession('127.0.0.1');
    expect(auth.destroySession(sessionId)).toBe(true);
    expect(auth.validateSession(sessionId)).toBe(false);
  });

  it('should rate limit after max attempts', () => {
    const ip = '192.168.1.1';
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      auth.recordAttempt(ip);
    }
    expect(auth.isRateLimited(ip)).toBe(true);
  });

  it('should not rate limit under the threshold', () => {
    const ip = '192.168.1.1';
    auth.recordAttempt(ip);
    expect(auth.isRateLimited(ip)).toBe(false);
  });
});
```

**Step 7: Install and run tests**

Run: `pnpm install && pnpm test -- --run packages/dashboard/`

Expected: 6 tests PASS.

**Step 8: Commit**

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): scaffold dashboard package with auth session management"
```

---

### Task 3: Build dashboard REST API router

**Files:**
- Create: `packages/dashboard/src/router.ts`
- Modify: `packages/dashboard/src/index.ts`
- Create: `packages/dashboard/tests/router.test.ts`

**Step 1: Write tests**

Create `packages/dashboard/tests/router.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as crypto from 'node:crypto';
import { createDashboardRouter } from '../src/router.js';
import type { DashboardDeps } from '../src/types.js';

function createMockDeps(): DashboardDeps {
  return {
    vault: {
      get: vi.fn((name: string) => {
        if (name === 'DASHBOARD_PASSWORD') return 'hashed-pw';
        return undefined;
      }),
      has: vi.fn((name: string) => name === 'DASHBOARD_PASSWORD'),
      add: vi.fn(),
    },
    behaviors: {
      list: vi.fn().mockResolvedValue([
        { id: 'bh-1', type: 'scheduled', status: 'active', action: 'test', runCount: 5, failCount: 0 },
      ]),
      update: vi.fn().mockResolvedValue({ id: 'bh-1', status: 'paused' }),
      remove: vi.fn().mockResolvedValue(true),
    },
    webhooks: {
      list: vi.fn().mockResolvedValue([
        { id: 'wh-1', name: 'hook-1', type: 'generic', enabled: true, secret: 'real-secret' },
      ]),
      delete: vi.fn().mockResolvedValue(true),
    },
    getConnections: vi.fn().mockReturnValue([
      { id: 'conn-1', authenticated: true, channelType: 'webchat', lastActive: Date.now(), voiceActive: false },
    ]),
    getAuditEntries: vi.fn().mockResolvedValue([
      { timestamp: '2026-01-01T00:00:00Z', event: 'system.startup', details: {} },
    ]),
  };
}

function createApp(deps: DashboardDeps) {
  const app = express();
  app.use(express.json());
  const { router, auth } = createDashboardRouter({
    deps,
    config: { enabled: true, sessionTtlMs: 86_400_000 },
    verifyPassword: (input: string) => input === 'correct-password',
  });
  app.use('/api/v1/dashboard', router);
  return { app, auth };
}

function loginAndGetCookie(app: express.Express): Promise<string> {
  return request(app)
    .post('/api/v1/dashboard/auth/login')
    .send({ password: 'correct-password' })
    .then((res) => {
      const cookie = res.headers['set-cookie'];
      return Array.isArray(cookie) ? cookie[0] : cookie;
    });
}

describe('Dashboard Router', () => {
  let deps: DashboardDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    ({ app } = createApp(deps));
  });

  describe('auth', () => {
    it('should login with correct password', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/auth/login')
        .send({ password: 'correct-password' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/auth/login')
        .send({ password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should rate limit login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/dashboard/auth/login')
          .send({ password: 'wrong' });
      }
      const res = await request(app)
        .post('/api/v1/dashboard/auth/login')
        .send({ password: 'wrong' });
      expect(res.status).toBe(429);
    });

    it('should check auth status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/auth/check')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
    });

    it('should logout and invalidate session', async () => {
      const cookie = await loginAndGetCookie(app);
      await request(app)
        .post('/api/v1/dashboard/auth/logout')
        .set('Cookie', cookie);

      const res = await request(app)
        .get('/api/v1/dashboard/auth/check')
        .set('Cookie', cookie);
      expect(res.body.authenticated).toBe(false);
    });

    it('should reject unauthenticated API requests', async () => {
      const res = await request(app).get('/api/v1/dashboard/behaviors');
      expect(res.status).toBe(401);
    });
  });

  describe('behaviors API', () => {
    it('should list behaviors', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/behaviors')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should patch behavior status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .patch('/api/v1/dashboard/behaviors/bh-1')
        .set('Cookie', cookie)
        .send({ status: 'paused' });
      expect(res.status).toBe(200);
    });

    it('should delete a behavior', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .delete('/api/v1/dashboard/behaviors/bh-1')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/behaviors');
      expect(res.status).toBe(401);
    });
  });

  describe('webhooks API', () => {
    it('should list webhooks with redacted secrets', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/webhooks')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data[0].secret).toBe('***');
    });

    it('should delete a webhook', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .delete('/api/v1/dashboard/webhooks/wh-1')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
    });
  });

  describe('sessions API', () => {
    it('should list active connections', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/sessions')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('audit API', () => {
    it('should return audit entries', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/audit')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('status API', () => {
    it('should return system status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/status')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.uptime).toBeDefined();
      expect(res.body.data.connections).toBe(1);
    });
  });
});
```

**Step 2: Add supertest dependency**

In `packages/dashboard/package.json`, add to `devDependencies`:

```json
"supertest": "^7.1.0",
"@types/supertest": "^6.0.0",
"express": "^5.1.0"
```

And add `express` to `dependencies`:

```json
"express": "^5.1.0"
```

**Step 3: Implement router.ts**

```typescript
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { DashboardAuth } from './auth.js';
import type { DashboardConfig, DashboardDeps } from './types.js';

const logger = getLogger('dashboard:router');

const COOKIE_NAME = 'auxiora_dash_session';

export interface DashboardRouterOptions {
  deps: DashboardDeps;
  config: DashboardConfig;
  verifyPassword: (input: string) => boolean;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  }
  return cookies;
}

export function createDashboardRouter(options: DashboardRouterOptions) {
  const { deps, config, verifyPassword } = options;
  const router = Router();
  const auth = new DashboardAuth(config.sessionTtlMs);

  // --- Auth middleware ---
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];

    if (!sessionId || !auth.validateSession(sessionId)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  }

  // --- Auth routes (no auth required) ---
  router.post('/auth/login', (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (auth.isRateLimited(ip)) {
      res.status(429).json({ error: 'Too many login attempts' });
      return;
    }

    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    auth.recordAttempt(ip);

    if (!verifyPassword(password)) {
      void audit('dashboard.login_failed', { ip });
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const sessionId = auth.createSession(ip);
    void audit('dashboard.login', { ip });

    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
    res.json({ success: true });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];

    if (sessionId) {
      auth.destroySession(sessionId);
      void audit('dashboard.logout', {});
    }

    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ success: true });
  });

  router.get('/auth/check', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    const authenticated = !!sessionId && auth.validateSession(sessionId);
    res.json({ authenticated });
  });

  // --- Protected routes ---
  router.use(requireAuth);

  // Behaviors
  router.get('/behaviors', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.json({ data: [] });
      return;
    }
    const behaviors = await deps.behaviors.list();
    res.json({ data: behaviors });
  });

  router.patch('/behaviors/:id', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.status(503).json({ error: 'Behaviors not available' });
      return;
    }
    const { id } = req.params;
    const updates = req.body;
    const result = await deps.behaviors.update(id, updates);
    if (!result) {
      res.status(404).json({ error: 'Behavior not found' });
      return;
    }
    res.json({ data: result });
  });

  router.delete('/behaviors/:id', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.status(503).json({ error: 'Behaviors not available' });
      return;
    }
    const removed = await deps.behaviors.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Behavior not found' });
      return;
    }
    res.json({ data: { deleted: true } });
  });

  // Webhooks
  router.get('/webhooks', async (req: Request, res: Response) => {
    if (!deps.webhooks) {
      res.json({ data: [] });
      return;
    }
    const webhooks = await deps.webhooks.list();
    // Redact secrets
    const redacted = webhooks.map((w: any) => ({ ...w, secret: '***' }));
    res.json({ data: redacted });
  });

  router.delete('/webhooks/:id', async (req: Request, res: Response) => {
    if (!deps.webhooks) {
      res.status(503).json({ error: 'Webhooks not available' });
      return;
    }
    const removed = await deps.webhooks.delete(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json({ data: { deleted: true } });
  });

  // Sessions
  router.get('/sessions', (req: Request, res: Response) => {
    const connections = deps.getConnections();
    res.json({ data: connections });
  });

  // Audit
  router.get('/audit', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const entries = await deps.getAuditEntries(limit);

    // Filter by type if provided
    const type = req.query.type as string | undefined;
    const filtered = type
      ? entries.filter((e: any) => e.event.startsWith(type))
      : entries;

    res.json({ data: filtered });
  });

  // Status
  router.get('/status', async (req: Request, res: Response) => {
    const connections = deps.getConnections();
    const behaviors = deps.behaviors ? await deps.behaviors.list() : [];
    const webhooks = deps.webhooks ? await deps.webhooks.list() : [];
    const activeBehaviors = behaviors.filter((b: any) => b.status === 'active');

    res.json({
      data: {
        uptime: process.uptime(),
        connections: connections.length,
        activeBehaviors: activeBehaviors.length,
        totalBehaviors: behaviors.length,
        webhooks: webhooks.length,
      },
    });
  });

  return { router, auth };
}
```

**Step 4: Update barrel exports**

```typescript
export type { DashboardConfig, DashboardSession, DashboardDeps } from './types.js';
export { DEFAULT_DASHBOARD_CONFIG } from './types.js';
export { DashboardAuth } from './auth.js';
export { createDashboardRouter, type DashboardRouterOptions } from './router.js';
```

**Step 5: Install and run tests**

Run: `pnpm install && pnpm test -- --run packages/dashboard/`

Expected: ~17 tests PASS (6 auth + ~11 router).

**Step 6: Commit**

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): implement REST API router with auth, CRUD, and status endpoints"
```

---

### Task 4: Build React SPA

**Files:**
- Create: `packages/dashboard/ui/package.json`
- Create: `packages/dashboard/ui/vite.config.ts`
- Create: `packages/dashboard/ui/tsconfig.json`
- Create: `packages/dashboard/ui/index.html`
- Create: `packages/dashboard/ui/src/main.tsx`
- Create: `packages/dashboard/ui/src/App.tsx`
- Create: `packages/dashboard/ui/src/api.ts`
- Create: `packages/dashboard/ui/src/hooks/useApi.ts`
- Create: `packages/dashboard/ui/src/hooks/usePolling.ts`
- Create: `packages/dashboard/ui/src/pages/Login.tsx`
- Create: `packages/dashboard/ui/src/pages/Behaviors.tsx`
- Create: `packages/dashboard/ui/src/pages/Webhooks.tsx`
- Create: `packages/dashboard/ui/src/pages/Sessions.tsx`
- Create: `packages/dashboard/ui/src/pages/AuditLog.tsx`
- Create: `packages/dashboard/ui/src/components/Layout.tsx`
- Create: `packages/dashboard/ui/src/components/DataTable.tsx`
- Create: `packages/dashboard/ui/src/components/StatusBadge.tsx`
- Create: `packages/dashboard/ui/src/styles/global.css`

This is a large task. The implementer should create the complete React SPA with all pages. The SPA lives in `packages/dashboard/ui/` with its own `package.json` and Vite config.

**Step 1: Create ui/package.json**

```json
{
  "name": "@auxiora/dashboard-ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "typescript": "^5.9.3",
    "vite": "^6.3.0"
  }
}
```

**Step 2: Create ui/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  build: {
    outDir: '../dist-ui',
    emptyDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:18800',
    },
  },
});
```

**Step 3: Create ui/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

**Step 4: Create ui/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auxiora Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 5: Create src/main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/dashboard">
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

**Step 6: Create src/api.ts**

```typescript
const BASE = '/api/v1/dashboard';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/dashboard/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  checkAuth: () => fetchApi<{ authenticated: boolean }>('/auth/check'),
  login: (password: string) =>
    fetchApi<{ success: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => fetchApi<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  getBehaviors: () => fetchApi<{ data: any[] }>('/behaviors'),
  patchBehavior: (id: string, updates: Record<string, unknown>) =>
    fetchApi<{ data: any }>(`/behaviors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteBehavior: (id: string) =>
    fetchApi<{ data: any }>(`/behaviors/${id}`, { method: 'DELETE' }),
  getWebhooks: () => fetchApi<{ data: any[] }>('/webhooks'),
  deleteWebhook: (id: string) =>
    fetchApi<{ data: any }>(`/webhooks/${id}`, { method: 'DELETE' }),
  getSessions: () => fetchApi<{ data: any[] }>('/sessions'),
  getAudit: (params?: { type?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<{ data: any[] }>(`/audit${qs ? `?${qs}` : ''}`);
  },
  getStatus: () => fetchApi<{ data: any }>('/status'),
};
```

**Step 7: Create src/hooks/useApi.ts**

```typescript
import { useState, useEffect, useCallback } from 'react';

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetcher()
      .then((result) => { setData(result); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
```

**Step 8: Create src/hooks/usePolling.ts**

```typescript
import { useEffect } from 'react';

export function usePolling(callback: () => void, intervalMs = 10_000) {
  useEffect(() => {
    const id = setInterval(callback, intervalMs);
    return () => clearInterval(id);
  }, [callback, intervalMs]);
}
```

**Step 9: Create src/components/Layout.tsx**

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../api.js';

export function Layout() {
  const { data: status, refresh } = useApi(() => api.getStatus(), []);
  usePolling(refresh);

  const navItems = [
    { to: '/', label: 'Behaviors' },
    { to: '/webhooks', label: 'Webhooks' },
    { to: '/sessions', label: 'Sessions' },
    { to: '/audit', label: 'Audit Log' },
  ];

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Auxiora</h1>
        </div>
        <ul className="nav-list">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        {status?.data && (
          <div className="status-bar">
            <div className="status-item">Connections: {status.data.connections}</div>
            <div className="status-item">Behaviors: {status.data.activeBehaviors}/{status.data.totalBehaviors}</div>
            <div className="status-item">Webhooks: {status.data.webhooks}</div>
          </div>
        )}
        <button className="logout-btn" onClick={() => api.logout().then(() => { window.location.href = '/dashboard/login'; })}>
          Logout
        </button>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 10: Create src/components/DataTable.tsx**

```tsx
interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: string;
  actions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({ columns, rows, keyField, actions }: DataTableProps<T>) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => <th key={col.key}>{col.label}</th>)}
          {actions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="empty-row">No data</td></tr>
        ) : (
          rows.map((row) => (
            <tr key={row[keyField]}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>
              ))}
              {actions && <td className="actions-cell">{actions(row)}</td>}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
```

**Step 11: Create src/components/StatusBadge.tsx**

```tsx
const STATUS_COLORS: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-yellow',
  deleted: 'badge-red',
  enabled: 'badge-green',
  disabled: 'badge-gray',
};

export function StatusBadge({ status }: { status: string }) {
  const className = STATUS_COLORS[status] || 'badge-gray';
  return <span className={`badge ${className}`}>{status}</span>;
}
```

**Step 12: Create src/pages/Login.tsx**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.login(password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Auxiora Dashboard</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Dashboard password"
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

**Step 13: Create src/pages/Behaviors.tsx**

```tsx
import { useApi } from '../hooks/useApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function Behaviors() {
  const { data, refresh } = useApi(() => api.getBehaviors(), []);
  usePolling(refresh);

  const behaviors = data?.data ?? [];

  const columns = [
    { key: 'action', label: 'Action', render: (b: any) => b.action?.slice(0, 60) },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', render: (b: any) => <StatusBadge status={b.status} /> },
    { key: 'runCount', label: 'Runs' },
    { key: 'failCount', label: 'Fails' },
    { key: 'lastRun', label: 'Last Run', render: (b: any) => b.lastRun ? new Date(b.lastRun).toLocaleString() : '-' },
  ];

  const handleToggle = async (b: any) => {
    const newStatus = b.status === 'active' ? 'paused' : 'active';
    await api.patchBehavior(b.id, { status: newStatus });
    refresh();
  };

  const handleDelete = async (b: any) => {
    if (confirm(`Delete behavior "${b.action?.slice(0, 40)}"?`)) {
      await api.deleteBehavior(b.id);
      refresh();
    }
  };

  return (
    <div className="page">
      <h2>Behaviors</h2>
      <DataTable
        columns={columns}
        rows={behaviors}
        keyField="id"
        actions={(b: any) => (
          <>
            <button className="btn-sm" onClick={() => handleToggle(b)}>
              {b.status === 'active' ? 'Pause' : 'Resume'}
            </button>
            <button className="btn-sm btn-danger" onClick={() => handleDelete(b)}>Delete</button>
          </>
        )}
      />
    </div>
  );
}
```

**Step 14: Create src/pages/Webhooks.tsx**

```tsx
import { useApi } from '../hooks/useApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function Webhooks() {
  const { data, refresh } = useApi(() => api.getWebhooks(), []);
  usePolling(refresh);

  const webhooks = data?.data ?? [];

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'enabled', label: 'Status', render: (w: any) => <StatusBadge status={w.enabled ? 'enabled' : 'disabled'} /> },
    { key: 'behaviorId', label: 'Behavior', render: (w: any) => w.behaviorId || '-' },
    { key: 'createdAt', label: 'Created', render: (w: any) => new Date(w.createdAt).toLocaleDateString() },
  ];

  const handleDelete = async (w: any) => {
    if (confirm(`Delete webhook "${w.name}"?`)) {
      await api.deleteWebhook(w.id);
      refresh();
    }
  };

  return (
    <div className="page">
      <h2>Webhooks</h2>
      <DataTable
        columns={columns}
        rows={webhooks}
        keyField="id"
        actions={(w: any) => (
          <button className="btn-sm btn-danger" onClick={() => handleDelete(w)}>Delete</button>
        )}
      />
    </div>
  );
}
```

**Step 15: Create src/pages/Sessions.tsx**

```tsx
import { useApi } from '../hooks/useApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';

export function Sessions() {
  const { data, refresh } = useApi(() => api.getSessions(), []);
  usePolling(refresh);

  const sessions = data?.data ?? [];

  const columns = [
    { key: 'id', label: 'Session ID', render: (s: any) => s.id.slice(0, 8) + '...' },
    { key: 'channelType', label: 'Channel' },
    { key: 'authenticated', label: 'Auth', render: (s: any) => s.authenticated ? 'Yes' : 'No' },
    { key: 'voiceActive', label: 'Voice', render: (s: any) => s.voiceActive ? 'Active' : '-' },
    { key: 'lastActive', label: 'Last Active', render: (s: any) => new Date(s.lastActive).toLocaleString() },
  ];

  return (
    <div className="page">
      <h2>Active Sessions</h2>
      <DataTable columns={columns} rows={sessions} keyField="id" />
    </div>
  );
}
```

**Step 16: Create src/pages/AuditLog.tsx**

```tsx
import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';

const EVENT_FILTERS = ['', 'behavior.', 'webhook.', 'voice.', 'system.', 'auth.', 'dashboard.'];

export function AuditLog() {
  const [typeFilter, setTypeFilter] = useState('');
  const { data, refresh } = useApi(() => api.getAudit({ type: typeFilter || undefined, limit: 200 }), [typeFilter]);
  usePolling(refresh);

  const entries = data?.data ?? [];

  const columns = [
    { key: 'timestamp', label: 'Time', render: (e: any) => new Date(e.timestamp).toLocaleString() },
    { key: 'event', label: 'Event' },
    { key: 'details', label: 'Details', render: (e: any) => JSON.stringify(e.details).slice(0, 80) },
  ];

  return (
    <div className="page">
      <h2>Audit Log</h2>
      <div className="filters">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All events</option>
          {EVENT_FILTERS.filter(Boolean).map((f) => (
            <option key={f} value={f}>{f}*</option>
          ))}
        </select>
      </div>
      <DataTable columns={columns} rows={entries} keyField="sequence" />
    </div>
  );
}
```

**Step 17: Create src/App.tsx**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Login } from './pages/Login.js';
import { Behaviors } from './pages/Behaviors.js';
import { Webhooks } from './pages/Webhooks.js';
import { Sessions } from './pages/Sessions.js';
import { AuditLog } from './pages/AuditLog.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Behaviors />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

**Step 18: Create src/styles/global.css**

Create a minimal dark-theme stylesheet with CSS variables. The implementer should create styles for: `.layout`, `.sidebar`, `.content`, `.data-table`, `.badge`, `.login-page`, `.login-card`, `.btn-sm`, `.btn-danger`, `.nav-link`, `.status-bar`, `.filters`, `.error`, `.empty-row`. Dark background (#1a1a2e), light text (#e0e0e0), accent color (#4a9eff), table with alternating row colors.

**Step 19: Build and verify**

```bash
cd packages/dashboard/ui && pnpm install && pnpm build && cd ../../..
```

Verify `packages/dashboard/dist-ui/` contains `index.html` and JS/CSS assets.

**Step 20: Commit**

```bash
git add packages/dashboard/ui/
git commit -m "feat(dashboard): build React SPA with behaviors, webhooks, sessions, and audit pages"
```

---

### Task 5: Wire dashboard into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`

**Step 1: Add dependency**

In `packages/runtime/package.json`, add to `dependencies`:

```json
"@auxiora/dashboard": "workspace:*"
```

**Step 2: Add imports**

In `packages/runtime/src/index.ts`, add after the webhook imports:

```typescript
import { createDashboardRouter } from '@auxiora/dashboard';
import { getAuditLogger } from '@auxiora/audit';
```

Import `express` static middleware:

```typescript
import express from 'express';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
```

Check which of these are already imported and only add the missing ones.

**Step 3: Add dashboard initialization**

In `initialize()`, after the webhook system block, add:

```typescript
    // Initialize dashboard (if enabled)
    if (this.config.dashboard?.enabled) {
      const { router } = createDashboardRouter({
        deps: {
          vault: this.vault,
          behaviors: this.behaviors,
          webhooks: this.webhookManager,
          getConnections: () => this.gateway.getConnections(),
          getAuditEntries: async (limit?: number) => {
            const logger = getAuditLogger();
            return logger.getEntries(limit);
          },
        },
        config: {
          enabled: true,
          sessionTtlMs: this.config.dashboard.sessionTtlMs,
        },
        verifyPassword: (input: string) => {
          const stored = this.vault.get('DASHBOARD_PASSWORD');
          return !!stored && stored === input;
        },
      });

      this.gateway.mountRouter('/api/v1/dashboard', router);

      // Serve static SPA files
      const dashboardUiPath = path.resolve(
        fileURLToPath(import.meta.url),
        '../../../dashboard/dist-ui'
      );
      this.gateway.mountRouter('/dashboard', express.static(dashboardUiPath));

      console.log('Dashboard enabled at /dashboard');
    }
```

**Step 4: Install, run tests, commit**

```bash
pnpm install && pnpm test
```

All tests should pass.

```bash
git add packages/runtime/
git commit -m "feat(runtime): integrate dashboard with auth, API routes, and static file serving"
```

---

### Task 6: Version bump to 1.7.0

**Files:**
- Modify: `package.json` (root)

**Step 1: Bump version**

In root `package.json`, change version from `"1.6.0"` to `"1.7.0"`.

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All ~297 tests pass.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.7.0"
```
