# Webhook Listeners Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add webhook listener support — wire HTTP routes for Telegram/Twilio channel adapters, and provide a generic webhook system that triggers behaviors from arbitrary HTTP callbacks.

**Architecture:** New `packages/webhooks/` package contains WebhookStore (persistence), signature verification (HMAC-SHA256, Twilio), and WebhookManager (route creation, request handling). The gateway exposes `mountRouter()` for the webhook routes. Generic webhooks trigger behaviors via the existing `BehaviorExecutor`. Channel webhooks delegate to existing adapter `handleWebhook()` methods.

**Tech Stack:** Express Router, `node:crypto` HMAC, JSON file storage, vitest

---

## Context for implementers

**Monorepo layout:** `packages/*` auto-discovered by pnpm. TypeScript strict ESM with `.js` extensions on all imports. Type imports use `import type { ... }`.

**Key files you'll modify:**
- `packages/core/src/index.ts` — Add `getWebhooksPath()` function
- `packages/config/src/index.ts` — Add `WebhookConfigSchema` to `ConfigSchema`
- `packages/config/tests/config.test.ts` — Add webhook config tests
- `packages/audit/src/index.ts` — Add webhook audit event types
- `packages/gateway/src/server.ts` — Add `mountRouter()` public method
- `packages/runtime/src/index.ts` — Add WebhookManager initialization
- `packages/runtime/package.json` — Add `@auxiora/webhooks` dependency
- `packages/tools/src/index.ts` — Register webhook tools
- `packages/tools/package.json` — Add `@auxiora/webhooks` dependency

**Existing patterns to follow:**
- `BehaviorStore` in `packages/behaviors/src/store.ts` — JSON file persistence (readFile/writeFile)
- `setBrowserManager()` in `packages/tools/src/browser.ts` — cross-package injection
- Tool registration in `packages/tools/src/index.ts` — import, register, export pattern
- `packages/behaviors/src/executor.ts` — `BehaviorExecutor` with `ExecutorDeps`

---

### Task 1: Add webhook path and config

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/tests/config.test.ts`
- Modify: `packages/audit/src/index.ts`

**Step 1: Add getWebhooksPath to core**

In `packages/core/src/index.ts`, after `getBehaviorsPath`:

```typescript
export function getWebhooksPath(): string {
  return path.join(getDataDir(), 'webhooks.json');
}
```

And add to the `paths` object:

```typescript
  webhooks: getWebhooksPath,
```

**Step 2: Add WebhookConfigSchema to config**

In `packages/config/src/index.ts`, after `VoiceConfigSchema`:

```typescript
const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(false),
  basePath: z.string().default('/api/v1/webhooks'),
  signatureHeader: z.string().default('x-webhook-signature'),
  maxPayloadSize: z.number().int().positive().default(65536),
});
```

Then add `webhooks: WebhookConfigSchema.default({})` to `ConfigSchema` after `voice`.

**Step 3: Add webhook config tests**

In `packages/config/tests/config.test.ts`, add after the `voice config` describe block:

```typescript
describe('webhook config', () => {
  it('should default webhooks to disabled', () => {
    const config = ConfigSchema.parse({});
    expect(config.webhooks.enabled).toBe(false);
    expect(config.webhooks.basePath).toBe('/api/v1/webhooks');
    expect(config.webhooks.signatureHeader).toBe('x-webhook-signature');
    expect(config.webhooks.maxPayloadSize).toBe(65536);
  });

  it('should accept custom webhook config', () => {
    const config = ConfigSchema.parse({
      webhooks: { enabled: true, maxPayloadSize: 131072 },
    });
    expect(config.webhooks.enabled).toBe(true);
    expect(config.webhooks.maxPayloadSize).toBe(131072);
  });
});
```

**Step 4: Add webhook audit events**

In `packages/audit/src/index.ts`, add before `| 'system.error'`:

```typescript
  | 'webhook.received'
  | 'webhook.signature_failed'
  | 'webhook.triggered'
  | 'webhook.error'
  | 'webhook.created'
  | 'webhook.deleted'
```

**Step 5: Run tests and commit**

Run: `pnpm test -- --run packages/config/ packages/audit/`

```bash
git add packages/core/src/index.ts packages/config/ packages/audit/src/index.ts
git commit -m "feat(config): add webhook configuration schema, path, and audit events"
```

---

### Task 2: Scaffold webhooks package with types and store

**Files:**
- Create: `packages/webhooks/package.json`
- Create: `packages/webhooks/tsconfig.json`
- Create: `packages/webhooks/src/types.ts`
- Create: `packages/webhooks/src/store.ts`
- Create: `packages/webhooks/src/index.ts`
- Create: `packages/webhooks/tests/store.test.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/webhooks",
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
export interface WebhookDefinition {
  id: string;
  name: string;
  type: 'channel' | 'generic';
  channelType?: string;
  secret: string;
  behaviorId?: string;
  transform?: string;
  enabled: boolean;
  createdAt: string;
}

export interface WebhookConfig {
  enabled: boolean;
  basePath: string;
  signatureHeader: string;
  maxPayloadSize: number;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  basePath: '/api/v1/webhooks',
  signatureHeader: 'x-webhook-signature',
  maxPayloadSize: 65536,
};
```

**Step 4: Create store.ts**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { WebhookDefinition } from './types.js';

const logger = getLogger('webhooks:store');

export class WebhookStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async save(webhook: WebhookDefinition): Promise<void> {
    const webhooks = await this.readFile();
    const existing = webhooks.find((w) => w.name === webhook.name && w.id !== webhook.id);
    if (existing) {
      throw new Error(`Webhook with name '${webhook.name}' already exists`);
    }

    const index = webhooks.findIndex((w) => w.id === webhook.id);
    if (index >= 0) {
      webhooks[index] = webhook;
    } else {
      webhooks.push(webhook);
    }

    await this.writeFile(webhooks);
    logger.debug('Saved webhook', { id: webhook.id, name: webhook.name });
  }

  async get(id: string): Promise<WebhookDefinition | undefined> {
    const webhooks = await this.readFile();
    return webhooks.find((w) => w.id === id);
  }

  async getByName(name: string): Promise<WebhookDefinition | undefined> {
    const webhooks = await this.readFile();
    return webhooks.find((w) => w.name === name);
  }

  async getAll(): Promise<WebhookDefinition[]> {
    return this.readFile();
  }

  async listEnabled(): Promise<WebhookDefinition[]> {
    const webhooks = await this.readFile();
    return webhooks.filter((w) => w.enabled);
  }

  async remove(id: string): Promise<boolean> {
    const webhooks = await this.readFile();
    const filtered = webhooks.filter((w) => w.id !== id);
    if (filtered.length === webhooks.length) return false;
    await this.writeFile(filtered);
    logger.debug('Removed webhook', { id });
    return true;
  }

  private async readFile(): Promise<WebhookDefinition[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as WebhookDefinition[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(webhooks: WebhookDefinition[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(webhooks, null, 2), 'utf-8');
  }
}
```

**Step 5: Create barrel exports**

```typescript
export type { WebhookDefinition, WebhookConfig } from './types.js';
export { DEFAULT_WEBHOOK_CONFIG } from './types.js';
export { WebhookStore } from './store.js';
```

**Step 6: Write store tests**

Create `packages/webhooks/tests/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WebhookStore } from '../src/store.js';
import type { WebhookDefinition } from '../src/types.js';

function makeWebhook(overrides: Partial<WebhookDefinition> = {}): WebhookDefinition {
  return {
    id: 'wh-1',
    name: 'test-webhook',
    type: 'generic',
    secret: 'test-secret',
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WebhookStore', () => {
  let store: WebhookStore;
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webhook-store-'));
    filePath = path.join(tmpDir, 'webhooks.json');
    store = new WebhookStore(filePath);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should save and retrieve a webhook', async () => {
    const webhook = makeWebhook();
    await store.save(webhook);
    const result = await store.get('wh-1');
    expect(result).toEqual(webhook);
  });

  it('should retrieve by name', async () => {
    await store.save(makeWebhook());
    const result = await store.getByName('test-webhook');
    expect(result?.id).toBe('wh-1');
  });

  it('should reject duplicate names', async () => {
    await store.save(makeWebhook());
    await expect(
      store.save(makeWebhook({ id: 'wh-2', name: 'test-webhook' }))
    ).rejects.toThrow('already exists');
  });

  it('should remove a webhook', async () => {
    await store.save(makeWebhook());
    const removed = await store.remove('wh-1');
    expect(removed).toBe(true);
    expect(await store.get('wh-1')).toBeUndefined();
  });

  it('should list only enabled webhooks', async () => {
    await store.save(makeWebhook({ id: 'wh-1', name: 'enabled', enabled: true }));
    await store.save(makeWebhook({ id: 'wh-2', name: 'disabled', enabled: false }));
    const enabled = await store.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('enabled');
  });
});
```

**Step 7: Install and run tests**

Run: `pnpm install && pnpm test -- --run packages/webhooks/`

Expected: 5 tests PASS.

**Step 8: Commit**

```bash
git add packages/webhooks/
git commit -m "feat(webhooks): scaffold webhooks package with store and types"
```

---

### Task 3: Implement signature verification

**Files:**
- Create: `packages/webhooks/src/verify.ts`
- Create: `packages/webhooks/tests/verify.test.ts`
- Modify: `packages/webhooks/src/index.ts`

**Step 1: Write tests**

Create `packages/webhooks/tests/verify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyHmacSha256, verifyTwilioSignature } from '../src/verify.js';

describe('verifyHmacSha256', () => {
  const secret = 'my-webhook-secret';

  it('should accept valid HMAC-SHA256 signature', () => {
    const body = Buffer.from('{"event":"push"}');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(body, secret, signature)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const body = Buffer.from('{"event":"push"}');
    expect(verifyHmacSha256(body, secret, 'invalid-signature')).toBe(false);
  });

  it('should reject tampered body', () => {
    const body = Buffer.from('{"event":"push"}');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const tampered = Buffer.from('{"event":"hack"}');
    expect(verifyHmacSha256(tampered, secret, signature)).toBe(false);
  });

  it('should handle sha256= prefix in signature', () => {
    const body = Buffer.from('test');
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(body, secret, `sha256=${hash}`)).toBe(true);
  });

  it('should reject empty signature', () => {
    const body = Buffer.from('test');
    expect(verifyHmacSha256(body, secret, '')).toBe(false);
  });
});

describe('verifyTwilioSignature', () => {
  const authToken = 'twilio-auth-token';

  it('should accept valid Twilio signature', () => {
    const url = 'https://example.com/api/v1/webhooks/twilio';
    const params: Record<string, string> = {
      Body: 'Hello',
      From: '+1234567890',
      To: '+0987654321',
    };

    // Build expected signature the Twilio way:
    // Sort params by key, concatenate key+value, append to URL, HMAC-SHA1, base64
    const data = url + Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
    const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');

    expect(verifyTwilioSignature(url, params, authToken, expected)).toBe(true);
  });

  it('should reject invalid Twilio signature', () => {
    expect(verifyTwilioSignature('https://example.com', {}, authToken, 'bad-sig')).toBe(false);
  });
});
```

**Step 2: Implement verify.ts**

```typescript
import * as crypto from 'node:crypto';

/**
 * Verify HMAC-SHA256 signature using timing-safe comparison.
 * Handles optional "sha256=" prefix (GitHub style).
 */
export function verifyHmacSha256(body: Buffer, secret: string, signature: string): boolean {
  if (!signature) return false;

  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  let sigBuffer: Buffer;
  try {
    sigBuffer = Buffer.from(sig, 'hex');
  } catch {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(body).digest();

  if (sigBuffer.length !== expected.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expected);
}

/**
 * Verify Twilio webhook signature (HMAC-SHA1, base64).
 * Twilio signs: URL + sorted(key+value pairs), HMAC-SHA1, base64.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  signature: string
): boolean {
  if (!signature) return false;

  const data = url + Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}
```

**Step 3: Update barrel exports**

Update `packages/webhooks/src/index.ts`:

```typescript
export type { WebhookDefinition, WebhookConfig } from './types.js';
export { DEFAULT_WEBHOOK_CONFIG } from './types.js';
export { WebhookStore } from './store.js';
export { verifyHmacSha256, verifyTwilioSignature } from './verify.js';
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/webhooks/`

Expected: 12 tests PASS (5 store + 7 verify).

**Step 5: Commit**

```bash
git add packages/webhooks/
git commit -m "feat(webhooks): implement HMAC-SHA256 and Twilio signature verification"
```

---

### Task 4: Implement WebhookManager

**Files:**
- Create: `packages/webhooks/src/webhook-manager.ts`
- Create: `packages/webhooks/tests/webhook-manager.test.ts`
- Modify: `packages/webhooks/src/index.ts`

**Step 1: Write tests**

Create `packages/webhooks/tests/webhook-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WebhookManager } from '../src/webhook-manager.js';
import type { WebhookDefinition } from '../src/types.js';
import { DEFAULT_WEBHOOK_CONFIG } from '../src/types.js';

function makeWebhook(overrides: Partial<WebhookDefinition> = {}): WebhookDefinition {
  return {
    id: 'wh-1',
    name: 'test-hook',
    type: 'generic',
    secret: 'test-secret-key',
    behaviorId: 'beh-1',
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WebhookManager', () => {
  let manager: WebhookManager;
  let tmpDir: string;
  let filePath: string;
  let mockBehaviorTrigger: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webhook-mgr-'));
    filePath = path.join(tmpDir, 'webhooks.json');
    mockBehaviorTrigger = vi.fn().mockResolvedValue({ success: true });

    manager = new WebhookManager({
      storePath: filePath,
      config: { ...DEFAULT_WEBHOOK_CONFIG, enabled: true },
      onBehaviorTrigger: mockBehaviorTrigger,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('webhook CRUD', () => {
    it('should create a webhook', async () => {
      const webhook = await manager.create({
        name: 'github-push',
        type: 'generic',
        secret: 'my-secret',
        behaviorId: 'beh-1',
      });
      expect(webhook.id).toBeDefined();
      expect(webhook.name).toBe('github-push');
      expect(webhook.enabled).toBe(true);
    });

    it('should list all webhooks', async () => {
      await manager.create({ name: 'hook-1', type: 'generic', secret: 's1' });
      await manager.create({ name: 'hook-2', type: 'generic', secret: 's2' });
      const all = await manager.list();
      expect(all).toHaveLength(2);
    });

    it('should delete a webhook', async () => {
      const wh = await manager.create({ name: 'to-delete', type: 'generic', secret: 's' });
      const deleted = await manager.delete(wh.id);
      expect(deleted).toBe(true);
      const all = await manager.list();
      expect(all).toHaveLength(0);
    });
  });

  describe('generic webhook handling', () => {
    it('should verify signature and trigger behavior', async () => {
      const secret = 'my-secret';
      await manager.create({ name: 'test', type: 'generic', secret, behaviorId: 'beh-1' });

      const body = Buffer.from('{"event":"push"}');
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      const result = await manager.handleGenericWebhook('test', body, {
        'x-webhook-signature': signature,
      });

      expect(result.accepted).toBe(true);
      expect(mockBehaviorTrigger).toHaveBeenCalledWith('beh-1', expect.stringContaining('push'));
    });

    it('should reject invalid signature', async () => {
      await manager.create({ name: 'test', type: 'generic', secret: 'real-secret' });

      const body = Buffer.from('{}');
      const result = await manager.handleGenericWebhook('test', body, {
        'x-webhook-signature': 'bad-sig',
      });

      expect(result.accepted).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should reject unknown webhook name', async () => {
      const result = await manager.handleGenericWebhook('nonexistent', Buffer.from('{}'), {});
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should reject disabled webhook', async () => {
      const wh = await manager.create({ name: 'disabled', type: 'generic', secret: 's', enabled: false });

      const result = await manager.handleGenericWebhook('disabled', Buffer.from('{}'), {});
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should handle missing behavior gracefully', async () => {
      mockBehaviorTrigger.mockRejectedValueOnce(new Error('Behavior not found'));
      const secret = 'my-secret';
      await manager.create({ name: 'orphan', type: 'generic', secret, behaviorId: 'missing' });

      const body = Buffer.from('{}');
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      const result = await manager.handleGenericWebhook('orphan', body, {
        'x-webhook-signature': signature,
      });

      // Still accepted (202) — don't leak internal state
      expect(result.accepted).toBe(true);
    });
  });

  describe('payload size', () => {
    it('should reject oversized payloads', async () => {
      await manager.create({ name: 'test', type: 'generic', secret: 's' });
      const oversized = Buffer.alloc(DEFAULT_WEBHOOK_CONFIG.maxPayloadSize + 1);

      const result = await manager.handleGenericWebhook('test', oversized, {});
      expect(result.accepted).toBe(false);
      expect(result.status).toBe(413);
    });
  });
});
```

**Step 2: Implement webhook-manager.ts**

```typescript
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { WebhookStore } from './store.js';
import type { WebhookDefinition, WebhookConfig } from './types.js';
import { DEFAULT_WEBHOOK_CONFIG } from './types.js';
import { verifyHmacSha256 } from './verify.js';

const logger = getLogger('webhooks:manager');

export interface WebhookManagerOptions {
  storePath: string;
  config?: WebhookConfig;
  onBehaviorTrigger?: (behaviorId: string, payload: string) => Promise<{ success: boolean; error?: string }>;
}

export interface CreateWebhookOptions {
  name: string;
  type: 'channel' | 'generic';
  secret: string;
  channelType?: string;
  behaviorId?: string;
  enabled?: boolean;
}

export interface WebhookResult {
  accepted: boolean;
  status: number;
  error?: string;
}

export class WebhookManager {
  private store: WebhookStore;
  private config: WebhookConfig;
  private behaviorTrigger?: (behaviorId: string, payload: string) => Promise<{ success: boolean; error?: string }>;

  constructor(options: WebhookManagerOptions) {
    this.store = new WebhookStore(options.storePath);
    this.config = options.config ?? DEFAULT_WEBHOOK_CONFIG;
    this.behaviorTrigger = options.onBehaviorTrigger;
  }

  async create(options: CreateWebhookOptions): Promise<WebhookDefinition> {
    const webhook: WebhookDefinition = {
      id: crypto.randomUUID(),
      name: options.name,
      type: options.type,
      secret: options.secret,
      channelType: options.channelType,
      behaviorId: options.behaviorId,
      enabled: options.enabled ?? true,
      createdAt: new Date().toISOString(),
    };

    await this.store.save(webhook);
    audit('webhook.created', { name: webhook.name, type: webhook.type });
    logger.info('Webhook created', { id: webhook.id, name: webhook.name });
    return webhook;
  }

  async list(): Promise<WebhookDefinition[]> {
    return this.store.getAll();
  }

  async delete(id: string): Promise<boolean> {
    const webhook = await this.store.get(id);
    const removed = await this.store.remove(id);
    if (removed && webhook) {
      audit('webhook.deleted', { name: webhook.name });
      logger.info('Webhook deleted', { id, name: webhook.name });
    }
    return removed;
  }

  async handleGenericWebhook(
    name: string,
    body: Buffer,
    headers: Record<string, string>
  ): Promise<WebhookResult> {
    // Check payload size
    if (body.length > this.config.maxPayloadSize) {
      logger.warn('Webhook payload too large', { name, size: body.length });
      return { accepted: false, status: 413, error: 'Payload too large' };
    }

    // Find webhook
    const webhook = await this.store.getByName(name);
    if (!webhook || !webhook.enabled) {
      return { accepted: false, status: 404, error: 'Not found' };
    }

    // Verify signature
    const signature = headers[this.config.signatureHeader] ?? '';
    if (!verifyHmacSha256(body, webhook.secret, signature)) {
      audit('webhook.signature_failed', { name });
      logger.warn('Webhook signature verification failed', { name });
      return { accepted: false, status: 401, error: 'Unauthorized' };
    }

    audit('webhook.received', {
      name,
      type: webhook.type,
      payloadSize: body.length,
    });

    // Trigger behavior asynchronously
    if (webhook.behaviorId && this.behaviorTrigger) {
      const payload = body.toString('utf-8');
      this.triggerBehavior(webhook.name, webhook.behaviorId, payload);
    }

    return { accepted: true, status: 202 };
  }

  private triggerBehavior(webhookName: string, behaviorId: string, payload: string): void {
    if (!this.behaviorTrigger) return;

    this.behaviorTrigger(behaviorId, payload)
      .then(() => {
        audit('webhook.triggered', { name: webhookName, behaviorId });
        logger.info('Webhook triggered behavior', { webhookName, behaviorId });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        audit('webhook.error', { name: webhookName, error: message });
        logger.error('Webhook behavior trigger failed', { error: new Error(message), webhookName, behaviorId });
      });
  }

  setBehaviorTrigger(trigger: (behaviorId: string, payload: string) => Promise<{ success: boolean; error?: string }>): void {
    this.behaviorTrigger = trigger;
  }
}
```

**Step 3: Update barrel exports**

```typescript
export type { WebhookDefinition, WebhookConfig } from './types.js';
export { DEFAULT_WEBHOOK_CONFIG } from './types.js';
export { WebhookStore } from './store.js';
export { verifyHmacSha256, verifyTwilioSignature } from './verify.js';
export { WebhookManager, type WebhookManagerOptions, type CreateWebhookOptions, type WebhookResult } from './webhook-manager.js';
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/webhooks/`

Expected: 20 tests PASS (5 store + 7 verify + 8 manager).

**Step 5: Commit**

```bash
git add packages/webhooks/
git commit -m "feat(webhooks): implement WebhookManager with CRUD and generic webhook handling"
```

---

### Task 5: Add mountRouter to gateway

**Files:**
- Modify: `packages/gateway/src/server.ts`

**Step 1: Add mountRouter method**

In `packages/gateway/src/server.ts`, add after the `sendBinary` method:

```typescript
  public mountRouter(path: string, router: import('express').Router): void {
    this.app.use(path, router);
  }
```

**Step 2: Run tests**

Run: `pnpm test -- --run packages/gateway/`

Expected: All pass (no behavior change).

**Step 3: Commit**

```bash
git add packages/gateway/src/server.ts
git commit -m "feat(gateway): add mountRouter for external route registration"
```

---

### Task 6: Create webhook tools

**Files:**
- Create: `packages/tools/src/webhooks.ts`
- Modify: `packages/tools/src/index.ts`
- Modify: `packages/tools/package.json`
- Modify: `packages/tools/tsconfig.json`
- Create: `packages/tools/tests/webhook-tools.test.ts`

**Step 1: Create webhooks.ts**

```typescript
import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';

const logger = getLogger('tools:webhooks');

let webhookManager: any = null;

export function setWebhookManager(manager: any): void {
  webhookManager = manager;
  logger.info('Webhook manager connected to tools');
}

function requireManager(): any {
  if (!webhookManager) {
    throw new Error('Webhook system not initialized');
  }
  return webhookManager;
}

export const WebhookListTool: Tool = {
  name: 'webhook_list',
  description: 'List all registered webhooks with their names, types, and enabled status.',
  parameters: [],
  getPermission: () => ToolPermission.AUTO_APPROVE,
  execute: async (): Promise<ToolResult> => {
    const manager = requireManager();
    const webhooks = await manager.list();

    if (webhooks.length === 0) {
      return { success: true, output: 'No webhooks registered.' };
    }

    const lines = webhooks.map((w: any) =>
      `- **${w.name}** (${w.type}) — ${w.enabled ? 'enabled' : 'disabled'}${w.behaviorId ? ` → behavior:${w.behaviorId}` : ''}`
    );

    return { success: true, output: lines.join('\n') };
  },
};

export const WebhookCreateTool: Tool = {
  name: 'webhook_create',
  description: 'Create a new generic webhook that triggers a behavior when called. Returns the webhook URL.',
  parameters: [
    { name: 'name', type: 'string', description: 'URL-safe slug for the webhook (e.g. github-push)', required: true },
    { name: 'secret', type: 'string', description: 'HMAC secret for signature verification', required: true },
    { name: 'behaviorId', type: 'string', description: 'ID of the behavior to trigger', required: true },
  ],
  getPermission: () => ToolPermission.USER_APPROVAL,
  validateParams: (params: any) => {
    if (!params.name || typeof params.name !== 'string') return 'name is required';
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(params.name) && params.name.length > 1) {
      if (!/^[a-z0-9]+$/.test(params.name)) return 'name must be URL-safe (lowercase alphanumeric and hyphens)';
    }
    if (!params.secret || typeof params.secret !== 'string') return 'secret is required';
    if (!params.behaviorId || typeof params.behaviorId !== 'string') return 'behaviorId is required';
    return null;
  },
  execute: async (params: any): Promise<ToolResult> => {
    const manager = requireManager();
    const webhook = await manager.create({
      name: params.name,
      type: 'generic' as const,
      secret: params.secret,
      behaviorId: params.behaviorId,
    });

    return {
      success: true,
      output: `Webhook created: ${webhook.name}\nURL: /api/v1/webhooks/custom/${webhook.name}\nLinked to behavior: ${webhook.behaviorId}`,
    };
  },
};

export const WebhookDeleteTool: Tool = {
  name: 'webhook_delete',
  description: 'Delete a webhook by name.',
  parameters: [
    { name: 'name', type: 'string', description: 'Name of the webhook to delete', required: true },
  ],
  getPermission: () => ToolPermission.USER_APPROVAL,
  execute: async (params: any): Promise<ToolResult> => {
    const manager = requireManager();
    const webhooks = await manager.list();
    const webhook = webhooks.find((w: any) => w.name === params.name);

    if (!webhook) {
      return { success: false, error: `Webhook '${params.name}' not found` };
    }

    await manager.delete(webhook.id);
    return { success: true, output: `Webhook '${params.name}' deleted.` };
  },
};
```

**Step 2: Write tool tests**

Create `packages/tools/tests/webhook-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookListTool, WebhookCreateTool, WebhookDeleteTool, setWebhookManager } from '../src/webhooks.js';
import type { ExecutionContext } from '../src/index.js';

const context: ExecutionContext = { sessionId: 'test' };

describe('Webhook tools', () => {
  let mockManager: any;

  beforeEach(() => {
    mockManager = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'wh-1',
        name: 'test-hook',
        type: 'generic',
        behaviorId: 'beh-1',
        enabled: true,
      }),
      delete: vi.fn().mockResolvedValue(true),
    };
    setWebhookManager(mockManager);
  });

  it('should list webhooks', async () => {
    mockManager.list.mockResolvedValue([
      { name: 'hook-1', type: 'generic', enabled: true, behaviorId: 'b1' },
    ]);
    const result = await WebhookListTool.execute({}, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('hook-1');
  });

  it('should create a webhook', async () => {
    const result = await WebhookCreateTool.execute(
      { name: 'test-hook', secret: 'secret', behaviorId: 'beh-1' },
      context
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('test-hook');
    expect(mockManager.create).toHaveBeenCalledOnce();
  });

  it('should delete a webhook', async () => {
    mockManager.list.mockResolvedValue([{ id: 'wh-1', name: 'test-hook' }]);
    const result = await WebhookDeleteTool.execute({ name: 'test-hook' }, context);
    expect(result.success).toBe(true);
    expect(mockManager.delete).toHaveBeenCalledWith('wh-1');
  });

  it('should return error when deleting non-existent webhook', async () => {
    const result = await WebhookDeleteTool.execute({ name: 'missing' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
```

**Step 3: Register tools in index.ts**

In `packages/tools/src/index.ts`, after the browser tools section, add:

```typescript
// Import and register webhook tools
import { WebhookListTool, WebhookCreateTool, WebhookDeleteTool } from './webhooks.js';

toolRegistry.register(WebhookListTool);
toolRegistry.register(WebhookCreateTool);
toolRegistry.register(WebhookDeleteTool);

// Export webhook tools
export { WebhookListTool, WebhookCreateTool, WebhookDeleteTool } from './webhooks.js';
export { setWebhookManager } from './webhooks.js';
```

**Step 4: Add dependency to tools package**

In `packages/tools/package.json`, add to `dependencies`:

```json
"@auxiora/webhooks": "workspace:*"
```

In `packages/tools/tsconfig.json`, add to `references`:

```json
{ "path": "../webhooks" }
```

**Step 5: Run tests**

Run: `pnpm install && pnpm test -- --run packages/tools/tests/webhook-tools.test.ts`

Expected: 4 tests PASS.

**Step 6: Commit**

```bash
git add packages/tools/
git commit -m "feat(tools): add webhook_list, webhook_create, and webhook_delete tools"
```

---

### Task 7: Wire webhooks into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`

**Step 1: Add dependency**

In `packages/runtime/package.json`, add to `dependencies`:

```json
"@auxiora/webhooks": "workspace:*"
```

**Step 2: Add imports**

In `packages/runtime/src/index.ts`, after the voice imports, add:

```typescript
import { WebhookManager } from '@auxiora/webhooks';
import { setWebhookManager } from '@auxiora/tools';
```

Also add at the top-level imports (for Router type):

```typescript
import { Router, type Request, type Response } from 'express';
```

**Step 3: Add webhookManager field**

After `private voiceManager?: VoiceManager;`:

```typescript
private webhookManager?: WebhookManager;
```

**Step 4: Add webhook initialization**

In `initialize()`, after the voice system block, add:

```typescript
    // Initialize webhook system (if enabled)
    if (this.config.webhooks?.enabled) {
      this.webhookManager = new WebhookManager({
        storePath: getWebhooksPath(),
        config: {
          enabled: true,
          basePath: this.config.webhooks.basePath,
          signatureHeader: this.config.webhooks.signatureHeader,
          maxPayloadSize: this.config.webhooks.maxPayloadSize,
        },
      });

      setWebhookManager(this.webhookManager);

      // Wire behavior trigger
      if (this.behaviors) {
        this.webhookManager.setBehaviorTrigger(async (behaviorId: string, payload: string) => {
          const behavior = await this.behaviors!.get(behaviorId);
          if (!behavior) {
            throw new Error(`Behavior ${behaviorId} not found`);
          }
          const execution = await this.behaviors!.executeNow(behaviorId, payload);
          return { success: execution.success, error: execution.error };
        });
      }

      // Mount webhook routes
      const webhookRouter = this.createWebhookRouter();
      this.gateway.mountRouter(this.config.webhooks.basePath, webhookRouter);
      console.log('Webhook listeners enabled');
    }
```

Also add `getWebhooksPath` to the core import:

```typescript
import {
  getWorkspacePath,
  getSoulPath,
  getAgentsPath,
  getIdentityPath,
  getUserPath,
  getBehaviorsPath,
  getScreenshotsDir,
  getWebhooksPath,
} from '@auxiora/core';
```

**Step 5: Add createWebhookRouter method**

After `handleVoiceMessage`, add:

```typescript
  private createWebhookRouter(): Router {
    const router = Router();

    // Generic webhooks
    router.post('/custom/:name', async (req: Request, res: Response) => {
      if (!this.webhookManager) {
        res.status(503).json({ error: 'Webhooks not available' });
        return;
      }

      // Collect raw body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const body = Buffer.concat(chunks);

      const result = await this.webhookManager.handleGenericWebhook(
        req.params.name,
        body,
        req.headers as Record<string, string>
      );

      res.status(result.status).json({
        accepted: result.accepted,
        ...(result.error && !result.accepted ? { error: result.error } : {}),
      });
    });

    // Channel webhooks — Twilio
    router.post('/twilio', async (req: Request, res: Response) => {
      if (!this.channels) {
        res.status(503).json({ error: 'Channels not available' });
        return;
      }

      const adapter = this.channels.getAdapter('twilio');
      if (!adapter) {
        res.status(503).json({ error: 'Twilio not configured' });
        return;
      }

      // Twilio sends form-encoded data
      const twilioAdapter = adapter as any;
      await twilioAdapter.handleWebhook(req.body);
      res.status(200).type('text/xml').send('<Response></Response>');
    });

    // Channel webhooks — Telegram
    router.post('/telegram', async (req: Request, res: Response) => {
      if (!this.channels) {
        res.status(503).json({ error: 'Channels not available' });
        return;
      }

      const adapter = this.channels.getAdapter('telegram');
      if (!adapter) {
        res.status(503).json({ error: 'Telegram not configured' });
        return;
      }

      const telegramAdapter = adapter as any;
      await telegramAdapter.handleWebhook(req.body);
      res.sendStatus(200);
    });

    return router;
  }
```

**Step 6: Install, run tests, commit**

Run: `pnpm install && pnpm test`

Expected: All tests pass.

```bash
git add packages/runtime/
git commit -m "feat(runtime): integrate WebhookManager with behavior triggering and HTTP routes"
```

---

### Task 8: Write integration tests

**Files:**
- Create: `packages/webhooks/tests/integration.test.ts`

**Step 1: Write integration tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WebhookManager } from '../src/webhook-manager.js';
import { DEFAULT_WEBHOOK_CONFIG } from '../src/types.js';

describe('Webhook integration', () => {
  let manager: WebhookManager;
  let tmpDir: string;
  let mockBehaviorTrigger: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webhook-int-'));
    mockBehaviorTrigger = vi.fn().mockResolvedValue({ success: true });

    manager = new WebhookManager({
      storePath: path.join(tmpDir, 'webhooks.json'),
      config: { ...DEFAULT_WEBHOOK_CONFIG, enabled: true },
      onBehaviorTrigger: mockBehaviorTrigger,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should handle full create → receive → trigger flow', async () => {
    // 1. Create webhook
    const secret = 'integration-test-secret';
    const webhook = await manager.create({
      name: 'github-push',
      type: 'generic',
      secret,
      behaviorId: 'summarize-commits',
    });
    expect(webhook.name).toBe('github-push');

    // 2. Simulate incoming webhook
    const payload = JSON.stringify({ ref: 'refs/heads/main', commits: [{ message: 'fix bug' }] });
    const body = Buffer.from(payload);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const result = await manager.handleGenericWebhook('github-push', body, {
      'x-webhook-signature': signature,
    });

    expect(result.accepted).toBe(true);
    expect(result.status).toBe(202);

    // 3. Wait for async behavior trigger
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockBehaviorTrigger).toHaveBeenCalledWith('summarize-commits', payload);
  });

  it('should reject webhook after deletion', async () => {
    const secret = 'temp-secret';
    const webhook = await manager.create({ name: 'temp', type: 'generic', secret });
    await manager.delete(webhook.id);

    const body = Buffer.from('{}');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const result = await manager.handleGenericWebhook('temp', body, {
      'x-webhook-signature': signature,
    });

    expect(result.accepted).toBe(false);
    expect(result.status).toBe(404);
  });

  it('should handle signature failure with audit trail', async () => {
    await manager.create({ name: 'secure', type: 'generic', secret: 'real-secret' });

    const result = await manager.handleGenericWebhook('secure', Buffer.from('{}'), {
      'x-webhook-signature': 'forged-signature',
    });

    expect(result.accepted).toBe(false);
    expect(result.status).toBe(401);
  });
});
```

**Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass (~270 total).

**Step 3: Commit**

```bash
git add packages/webhooks/tests/integration.test.ts
git commit -m "test(webhooks): add integration tests for full webhook flow"
```

---

### Task 9: Version bump and final verification

**Files:**
- Modify: `package.json` (root)

**Step 1: Bump version**

In root `package.json`, change version from `"1.5.0"` to `"1.6.0"`.

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All ~270 tests pass across ~26 test files.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.6.0"
```
