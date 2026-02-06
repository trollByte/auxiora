# Proactive Behaviors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add scheduled tasks, conditional monitors, and one-shot reminders to Auxiora so it can act autonomously.

**Architecture:** New `packages/behaviors/` package with scheduler (node-cron), polling monitor, AI-powered executor, and JSON file persistence. Four new tools (`create_behavior`, `list_behaviors`, `update_behavior`, `delete_behaviors`) registered in the tool system. Runtime integration in `packages/runtime/`.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), node-cron, nanoid, vitest

**Design Doc:** `docs/plans/2026-02-05-proactive-behaviors-design.md`

---

## Conventions (READ FIRST)

These conventions apply to ALL code in this plan:

- **Imports use `.js` extensions:** `import { Foo } from './foo.js'` (not `.ts`)
- **Type imports use `type` keyword:** `import type { Bar } from './bar.js'`
- **Cross-package imports:** `import { getLogger } from '@auxiora/logger'`
- **Package scope:** `@auxiora/behaviors`
- **Logger namespace:** `getLogger('behaviors')`, `getLogger('behaviors:scheduler')`, etc.
- **Error codes:** Use `ErrorCode.INTERNAL_ERROR` from `@auxiora/errors` (no new error codes needed for MVP)
- **Tests:** vitest with `describe/it/expect/beforeEach/afterEach`, temp dirs, `.js` imports from `../src/`
- **All files are ESM** (`"type": "module"` in package.json)

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/behaviors/package.json`
- Create: `packages/behaviors/tsconfig.json`
- Create: `packages/behaviors/src/types.ts`
- Create: `packages/behaviors/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/behaviors",
  "version": "1.0.0",
  "description": "Proactive behaviors: scheduled tasks, monitors, and one-shot reminders",
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
    "@auxiora/core": "workspace:*",
    "@auxiora/errors": "workspace:*",
    "@auxiora/logger": "workspace:*",
    "@auxiora/audit": "workspace:*",
    "node-cron": "^3.0.3",
    "nanoid": "^5.1.2"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11"
  },
  "engines": {
    "node": ">=22.0.0"
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
    { "path": "../core" },
    { "path": "../errors" },
    { "path": "../logger" },
    { "path": "../audit" }
  ]
}
```

**Step 3: Create types.ts**

```typescript
import type { ChannelType } from '@auxiora/channels';

export type BehaviorType = 'scheduled' | 'monitor' | 'one-shot';
export type BehaviorStatus = 'active' | 'paused' | 'deleted' | 'missed';

export interface BehaviorSchedule {
  cron: string;
  timezone: string;
}

export interface BehaviorPolling {
  intervalMs: number;
  condition: string;
}

export interface BehaviorDelay {
  fireAt: string; // ISO timestamp
}

export interface BehaviorChannel {
  type: ChannelType | 'webchat';
  id: string;
  overridden: boolean;
}

export interface Behavior {
  id: string;
  type: BehaviorType;
  status: BehaviorStatus;
  action: string;
  schedule?: BehaviorSchedule;
  polling?: BehaviorPolling;
  delay?: BehaviorDelay;
  channel: BehaviorChannel;
  createdBy: string;
  createdAt: string;
  lastRun?: string;
  lastResult?: string;
  runCount: number;
  failCount: number;
  maxFailures: number;
}

export interface BehaviorExecution {
  behaviorId: string;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  result?: string;
  error?: string;
}

export const BEHAVIOR_DEFAULTS = {
  maxFailures: 3,
  minPollingIntervalMs: 60_000,
  maxPollingIntervalMs: 86_400_000,
  maxActiveBehaviors: 50,
  executionTimeoutMs: 60_000,
  retryDelayMs: 30_000,
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
} as const;
```

**Step 4: Create index.ts (empty barrel for now)**

```typescript
export type {
  Behavior,
  BehaviorType,
  BehaviorStatus,
  BehaviorSchedule,
  BehaviorPolling,
  BehaviorDelay,
  BehaviorChannel,
  BehaviorExecution,
} from './types.js';
export { BEHAVIOR_DEFAULTS } from './types.js';
```

**Step 5: Install dependencies and verify build**

Run: `cd /home/ai-work/git/auxiora && pnpm install && pnpm -r --filter @auxiora/behaviors build`
Expected: Clean build, no errors

**Step 6: Commit**

```bash
git add packages/behaviors/
git commit -m "feat(behaviors): scaffold package with types and data model"
```

---

## Task 2: BehaviorStore (JSON Persistence)

**Files:**
- Create: `packages/behaviors/src/store.ts`
- Create: `packages/behaviors/tests/store.test.ts`
- Modify: `packages/behaviors/src/index.ts`

**Step 1: Write the store test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorStore } from '../src/store.js';
import type { Behavior } from '../src/types.js';

let testDir: string;
let storePath: string;

function makeBehavior(overrides: Partial<Behavior> = {}): Behavior {
  return {
    id: 'bh_test1',
    type: 'scheduled',
    status: 'active',
    action: 'Test action',
    schedule: { cron: '0 8 * * *', timezone: 'UTC' },
    channel: { type: 'discord', id: 'ch123', overridden: false },
    createdBy: 'user1',
    createdAt: new Date().toISOString(),
    runCount: 0,
    failCount: 0,
    maxFailures: 3,
    ...overrides,
  };
}

describe('BehaviorStore', () => {
  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      'auxiora-behaviors-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    storePath = path.join(testDir, 'behaviors.json');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create store file on first save', async () => {
    const store = new BehaviorStore(storePath);
    const behavior = makeBehavior();
    await store.save(behavior);

    const exists = await fs.access(storePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should save and load a behavior', async () => {
    const store = new BehaviorStore(storePath);
    const behavior = makeBehavior();
    await store.save(behavior);

    const loaded = await store.get('bh_test1');
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe('bh_test1');
    expect(loaded!.action).toBe('Test action');
  });

  it('should list all active behaviors', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior({ id: 'bh_1', status: 'active' }));
    await store.save(makeBehavior({ id: 'bh_2', status: 'active' }));
    await store.save(makeBehavior({ id: 'bh_3', status: 'deleted' }));

    const active = await store.listActive();
    expect(active).toHaveLength(2);
  });

  it('should update a behavior', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior());

    await store.update('bh_test1', { status: 'paused' });
    const updated = await store.get('bh_test1');
    expect(updated!.status).toBe('paused');
  });

  it('should delete a behavior', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior());

    await store.remove('bh_test1');
    const deleted = await store.get('bh_test1');
    expect(deleted).toBeUndefined();
  });

  it('should persist across instances', async () => {
    const store1 = new BehaviorStore(storePath);
    await store1.save(makeBehavior());

    const store2 = new BehaviorStore(storePath);
    const loaded = await store2.get('bh_test1');
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe('bh_test1');
  });

  it('should return all behaviors', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior({ id: 'bh_1' }));
    await store.save(makeBehavior({ id: 'bh_2' }));

    const all = await store.getAll();
    expect(all).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/store.test.ts`
Expected: FAIL — module `../src/store.js` not found

**Step 3: Write the store implementation**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { Behavior } from './types.js';

const logger = getLogger('behaviors:store');

export class BehaviorStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async save(behavior: Behavior): Promise<void> {
    const behaviors = await this.readFile();
    const index = behaviors.findIndex((b) => b.id === behavior.id);

    if (index >= 0) {
      behaviors[index] = behavior;
    } else {
      behaviors.push(behavior);
    }

    await this.writeFile(behaviors);
    logger.debug('Saved behavior', { id: behavior.id, type: behavior.type });
  }

  async get(id: string): Promise<Behavior | undefined> {
    const behaviors = await this.readFile();
    return behaviors.find((b) => b.id === id);
  }

  async getAll(): Promise<Behavior[]> {
    return this.readFile();
  }

  async listActive(): Promise<Behavior[]> {
    const behaviors = await this.readFile();
    return behaviors.filter((b) => b.status === 'active');
  }

  async update(id: string, updates: Partial<Behavior>): Promise<Behavior | undefined> {
    const behaviors = await this.readFile();
    const index = behaviors.findIndex((b) => b.id === id);

    if (index < 0) return undefined;

    behaviors[index] = { ...behaviors[index], ...updates, id };
    await this.writeFile(behaviors);
    logger.debug('Updated behavior', { id, updates: Object.keys(updates) });
    return behaviors[index];
  }

  async remove(id: string): Promise<boolean> {
    const behaviors = await this.readFile();
    const filtered = behaviors.filter((b) => b.id !== id);

    if (filtered.length === behaviors.length) return false;

    await this.writeFile(filtered);
    logger.debug('Removed behavior', { id });
    return true;
  }

  private async readFile(): Promise<Behavior[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as Behavior[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(behaviors: Behavior[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(behaviors, null, 2), 'utf-8');
  }
}
```

**Step 4: Update index.ts to export store**

Add to `packages/behaviors/src/index.ts`:
```typescript
export { BehaviorStore } from './store.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/store.test.ts`
Expected: All 7 tests PASS

**Step 6: Commit**

```bash
git add packages/behaviors/src/store.ts packages/behaviors/tests/store.test.ts packages/behaviors/src/index.ts
git commit -m "feat(behaviors): add BehaviorStore with JSON persistence"
```

---

## Task 3: Scheduler (node-cron wrapper)

**Files:**
- Create: `packages/behaviors/src/scheduler.ts`
- Create: `packages/behaviors/tests/scheduler.test.ts`
- Modify: `packages/behaviors/src/index.ts`

**Step 1: Write the scheduler test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from '../src/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  afterEach(() => {
    scheduler.stopAll();
  });

  it('should schedule a cron job', () => {
    const callback = vi.fn();
    scheduler.schedule('test-1', '* * * * *', callback);
    expect(scheduler.isScheduled('test-1')).toBe(true);
  });

  it('should stop a scheduled job', () => {
    const callback = vi.fn();
    scheduler.schedule('test-1', '* * * * *', callback);
    scheduler.stop('test-1');
    expect(scheduler.isScheduled('test-1')).toBe(false);
  });

  it('should stop all jobs', () => {
    scheduler.schedule('test-1', '* * * * *', vi.fn());
    scheduler.schedule('test-2', '* * * * *', vi.fn());
    scheduler.stopAll();
    expect(scheduler.isScheduled('test-1')).toBe(false);
    expect(scheduler.isScheduled('test-2')).toBe(false);
  });

  it('should validate cron expressions', () => {
    expect(Scheduler.isValidCron('0 8 * * *')).toBe(true);
    expect(Scheduler.isValidCron('not-a-cron')).toBe(false);
    expect(Scheduler.isValidCron('*/5 * * * *')).toBe(true);
  });

  it('should list scheduled job IDs', () => {
    scheduler.schedule('test-1', '* * * * *', vi.fn());
    scheduler.schedule('test-2', '* * * * *', vi.fn());
    const ids = scheduler.listScheduled();
    expect(ids).toContain('test-1');
    expect(ids).toContain('test-2');
    expect(ids).toHaveLength(2);
  });

  it('should replace existing job with same ID', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    scheduler.schedule('test-1', '* * * * *', callback1);
    scheduler.schedule('test-1', '0 9 * * *', callback2);
    expect(scheduler.listScheduled()).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/scheduler.test.ts`
Expected: FAIL — module not found

**Step 3: Write the scheduler implementation**

```typescript
import cron from 'node-cron';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('behaviors:scheduler');

export class Scheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  schedule(id: string, cronExpression: string, callback: () => void, timezone?: string): void {
    // Stop existing job with same ID
    this.stop(id);

    const options: cron.ScheduleOptions = {
      scheduled: true,
      timezone: timezone || undefined,
    };

    const task = cron.schedule(cronExpression, () => {
      logger.debug('Cron job fired', { id, cron: cronExpression });
      callback();
    }, options);

    this.jobs.set(id, task);
    logger.info('Scheduled cron job', { id, cron: cronExpression, timezone });
  }

  stop(id: string): void {
    const task = this.jobs.get(id);
    if (task) {
      task.stop();
      this.jobs.delete(id);
      logger.debug('Stopped cron job', { id });
    }
  }

  stopAll(): void {
    for (const [id, task] of this.jobs) {
      task.stop();
      logger.debug('Stopped cron job', { id });
    }
    this.jobs.clear();
  }

  isScheduled(id: string): boolean {
    return this.jobs.has(id);
  }

  listScheduled(): string[] {
    return Array.from(this.jobs.keys());
  }

  static isValidCron(expression: string): boolean {
    return cron.validate(expression);
  }
}
```

**Step 4: Update index.ts**

Add to `packages/behaviors/src/index.ts`:
```typescript
export { Scheduler } from './scheduler.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/scheduler.test.ts`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add packages/behaviors/src/scheduler.ts packages/behaviors/tests/scheduler.test.ts packages/behaviors/src/index.ts
git commit -m "feat(behaviors): add Scheduler with node-cron wrapper"
```

---

## Task 4: MonitorEngine (Polling)

**Files:**
- Create: `packages/behaviors/src/monitor.ts`
- Create: `packages/behaviors/tests/monitor.test.ts`
- Modify: `packages/behaviors/src/index.ts`

**Step 1: Write the monitor test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MonitorEngine } from '../src/monitor.js';

describe('MonitorEngine', () => {
  let monitor: MonitorEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new MonitorEngine();
  });

  afterEach(() => {
    monitor.stopAll();
    vi.useRealTimers();
  });

  it('should start a polling monitor', () => {
    monitor.start('mon-1', 60_000, vi.fn());
    expect(monitor.isRunning('mon-1')).toBe(true);
  });

  it('should call callback at polling interval', async () => {
    const callback = vi.fn();
    monitor.start('mon-1', 1000, callback);

    await vi.advanceTimersByTimeAsync(3500);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('should stop a monitor', () => {
    monitor.start('mon-1', 1000, vi.fn());
    monitor.stop('mon-1');
    expect(monitor.isRunning('mon-1')).toBe(false);
  });

  it('should stop all monitors', () => {
    monitor.start('mon-1', 1000, vi.fn());
    monitor.start('mon-2', 1000, vi.fn());
    monitor.stopAll();
    expect(monitor.isRunning('mon-1')).toBe(false);
    expect(monitor.isRunning('mon-2')).toBe(false);
  });

  it('should list running monitor IDs', () => {
    monitor.start('mon-1', 1000, vi.fn());
    monitor.start('mon-2', 1000, vi.fn());
    const ids = monitor.listRunning();
    expect(ids).toContain('mon-1');
    expect(ids).toContain('mon-2');
    expect(ids).toHaveLength(2);
  });

  it('should replace existing monitor with same ID', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    monitor.start('mon-1', 1000, callback1);
    monitor.start('mon-1', 1000, callback2);
    expect(monitor.listRunning()).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/monitor.test.ts`
Expected: FAIL — module not found

**Step 3: Write the monitor implementation**

```typescript
import { getLogger } from '@auxiora/logger';

const logger = getLogger('behaviors:monitor');

export class MonitorEngine {
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  start(id: string, intervalMs: number, callback: () => void): void {
    // Stop existing monitor with same ID
    this.stop(id);

    const timer = setInterval(() => {
      logger.debug('Monitor poll fired', { id, intervalMs });
      callback();
    }, intervalMs);

    this.timers.set(id, timer);
    logger.info('Started monitor', { id, intervalMs });
  }

  stop(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
      logger.debug('Stopped monitor', { id });
    }
  }

  stopAll(): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
      logger.debug('Stopped monitor', { id });
    }
    this.timers.clear();
  }

  isRunning(id: string): boolean {
    return this.timers.has(id);
  }

  listRunning(): string[] {
    return Array.from(this.timers.keys());
  }
}
```

**Step 4: Update index.ts**

Add to `packages/behaviors/src/index.ts`:
```typescript
export { MonitorEngine } from './monitor.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/monitor.test.ts`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add packages/behaviors/src/monitor.ts packages/behaviors/tests/monitor.test.ts packages/behaviors/src/index.ts
git commit -m "feat(behaviors): add MonitorEngine for polling-based behaviors"
```

---

## Task 5: BehaviorExecutor (AI Execution + Delivery)

**Files:**
- Create: `packages/behaviors/src/executor.ts`
- Create: `packages/behaviors/tests/executor.test.ts`
- Modify: `packages/behaviors/src/index.ts`

**Step 1: Write the executor test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BehaviorExecutor } from '../src/executor.js';
import type { Behavior } from '../src/types.js';

function makeBehavior(overrides: Partial<Behavior> = {}): Behavior {
  return {
    id: 'bh_test1',
    type: 'scheduled',
    status: 'active',
    action: 'Summarize today\'s news',
    schedule: { cron: '0 8 * * *', timezone: 'UTC' },
    channel: { type: 'discord', id: 'ch123', overridden: false },
    createdBy: 'user1',
    createdAt: new Date().toISOString(),
    runCount: 0,
    failCount: 0,
    maxFailures: 3,
    ...overrides,
  };
}

describe('BehaviorExecutor', () => {
  it('should execute a behavior and return the result', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Here is your summary',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: true });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(true);
    expect(result.result).toBe('Here is your summary');
    expect(mockProvider.complete).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('should return failure when provider throws', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('API down')),
      stream: vi.fn(),
    };

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: vi.fn(),
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(false);
    expect(result.error).toContain('API down');
  });

  it('should return failure when channel send fails', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Result',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: false, error: 'Channel offline' });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Channel offline');
  });

  it('should format monitor results with condition info', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Bitcoin is at $59,000',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: true });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const behavior = makeBehavior({
      type: 'monitor',
      polling: { intervalMs: 60_000, condition: 'Bitcoin price below $60k' },
    });

    await executor.execute(behavior);

    // Verify the prompt includes the condition
    const callArgs = mockProvider.complete.mock.calls[0];
    const messages = callArgs[0];
    const userMessage = messages.find((m: any) => m.role === 'user');
    expect(userMessage.content).toContain('Bitcoin price below $60k');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/executor.test.ts`
Expected: FAIL — module not found

**Step 3: Write the executor implementation**

```typescript
import { getLogger } from '@auxiora/logger';
import type { Behavior, BehaviorExecution } from './types.js';

const logger = getLogger('behaviors:executor');

export interface ExecutorDeps {
  getProvider: () => {
    name: string;
    complete: (messages: Array<{ role: string; content: string }>, options?: any) => Promise<{
      content: string;
      usage: { inputTokens: number; outputTokens: number };
      model: string;
      finishReason: string;
    }>;
  };
  sendToChannel: (
    channelType: string,
    channelId: string,
    message: { content: string }
  ) => Promise<{ success: boolean; error?: string }>;
  getSystemPrompt: () => string;
}

export class BehaviorExecutor {
  private deps: ExecutorDeps;

  constructor(deps: ExecutorDeps) {
    this.deps = deps;
  }

  async execute(behavior: Behavior): Promise<BehaviorExecution> {
    const startedAt = new Date().toISOString();
    logger.info('Executing behavior', { id: behavior.id, type: behavior.type, action: behavior.action });

    try {
      const provider = this.deps.getProvider();
      const messages = this.buildMessages(behavior);
      const systemPrompt = this.buildSystemPrompt(behavior);

      const result = await provider.complete(messages, { systemPrompt });
      const content = result.content;

      logger.debug('Behavior AI response received', {
        id: behavior.id,
        tokens: result.usage,
      });

      // Deliver to channel
      const label = this.getLabel(behavior);
      const formattedContent = `${label}\n${content}`;

      const sendResult = await this.deps.sendToChannel(
        behavior.channel.type,
        behavior.channel.id,
        { content: formattedContent }
      );

      if (!sendResult.success) {
        logger.warn('Failed to deliver behavior result', {
          id: behavior.id,
          channelType: behavior.channel.type,
          error: sendResult.error,
        });

        return {
          behaviorId: behavior.id,
          startedAt,
          completedAt: new Date().toISOString(),
          success: false,
          error: `Delivery failed: ${sendResult.error}`,
        };
      }

      logger.info('Behavior executed successfully', { id: behavior.id });

      return {
        behaviorId: behavior.id,
        startedAt,
        completedAt: new Date().toISOString(),
        success: true,
        result: content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Behavior execution failed', { id: behavior.id, error: errorMessage });

      return {
        behaviorId: behavior.id,
        startedAt,
        completedAt: new Date().toISOString(),
        success: false,
        error: errorMessage,
      };
    }
  }

  private buildMessages(behavior: Behavior): Array<{ role: string; content: string }> {
    if (behavior.type === 'monitor' && behavior.polling?.condition) {
      return [
        {
          role: 'user',
          content: `${behavior.action}\n\nIMPORTANT: Only provide a result if this condition is met: ${behavior.polling.condition}\nIf the condition is NOT met, respond with exactly: [CONDITION_NOT_MET]`,
        },
      ];
    }

    return [{ role: 'user', content: behavior.action }];
  }

  private buildSystemPrompt(behavior: Behavior): string {
    const base = this.deps.getSystemPrompt();
    const context = `\n\n---\nThis is an automated proactive behavior execution. Behavior ID: ${behavior.id}. Be concise and direct in your response.`;
    return base + context;
  }

  private getLabel(behavior: Behavior): string {
    switch (behavior.type) {
      case 'scheduled':
        return `**[Scheduled]** _${behavior.action.slice(0, 50)}_`;
      case 'monitor':
        return `**[Monitor Alert]** _${behavior.polling?.condition || behavior.action.slice(0, 50)}_`;
      case 'one-shot':
        return `**[Reminder]**`;
      default:
        return `**[Behavior]**`;
    }
  }
}
```

**Step 4: Update index.ts**

Add to `packages/behaviors/src/index.ts`:
```typescript
export { BehaviorExecutor, type ExecutorDeps } from './executor.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/executor.test.ts`
Expected: All 4 tests PASS

**Step 6: Commit**

```bash
git add packages/behaviors/src/executor.ts packages/behaviors/tests/executor.test.ts packages/behaviors/src/index.ts
git commit -m "feat(behaviors): add BehaviorExecutor for AI-powered execution and delivery"
```

---

## Task 6: BehaviorManager (Orchestration + Lifecycle)

**Files:**
- Create: `packages/behaviors/src/behavior-manager.ts`
- Create: `packages/behaviors/tests/behavior-manager.test.ts`
- Modify: `packages/behaviors/src/index.ts`

**Step 1: Write the manager test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorManager } from '../src/behavior-manager.js';
import { BehaviorStore } from '../src/store.js';
import { Scheduler } from '../src/scheduler.js';
import { MonitorEngine } from '../src/monitor.js';
import type { ExecutorDeps } from '../src/executor.js';

let testDir: string;

function mockExecutorDeps(): ExecutorDeps {
  return {
    getProvider: () => ({
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Mock result',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
    }),
    sendToChannel: vi.fn().mockResolvedValue({ success: true }),
    getSystemPrompt: () => 'Test prompt',
  };
}

describe('BehaviorManager', () => {
  let manager: BehaviorManager;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      'auxiora-bm-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    await fs.mkdir(testDir, { recursive: true });

    manager = new BehaviorManager({
      storePath: path.join(testDir, 'behaviors.json'),
      executorDeps: mockExecutorDeps(),
      auditFn: vi.fn(),
    });
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create a scheduled behavior', async () => {
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Check news',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    expect(behavior.id).toMatch(/^bh_/);
    expect(behavior.status).toBe('active');
    expect(behavior.type).toBe('scheduled');
  });

  it('should create a one-shot behavior', async () => {
    const fireAt = new Date(Date.now() + 3600_000).toISOString();
    const behavior = await manager.create({
      type: 'one-shot',
      action: 'Remind me to call dentist',
      delay: { fireAt },
      channel: { type: 'webchat', id: 'wc1', overridden: false },
      createdBy: 'user1',
    });

    expect(behavior.type).toBe('one-shot');
  });

  it('should create a monitor behavior', async () => {
    const behavior = await manager.create({
      type: 'monitor',
      action: 'Check Bitcoin price',
      polling: { intervalMs: 60_000, condition: 'Below $60k' },
      channel: { type: 'telegram', id: 'tg1', overridden: false },
      createdBy: 'user1',
    });

    expect(behavior.type).toBe('monitor');
  });

  it('should list behaviors', async () => {
    await manager.create({
      type: 'scheduled',
      action: 'Task 1',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });
    await manager.create({
      type: 'scheduled',
      action: 'Task 2',
      schedule: { cron: '0 9 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    const list = await manager.list();
    expect(list).toHaveLength(2);
  });

  it('should pause and resume a behavior', async () => {
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Task 1',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    const paused = await manager.update(behavior.id, { status: 'paused' });
    expect(paused!.status).toBe('paused');

    const resumed = await manager.update(behavior.id, { status: 'active' });
    expect(resumed!.status).toBe('active');
  });

  it('should delete a behavior', async () => {
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Task 1',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    const deleted = await manager.remove(behavior.id);
    expect(deleted).toBe(true);

    const list = await manager.list();
    expect(list).toHaveLength(0);
  });

  it('should reject invalid cron expression', async () => {
    await expect(
      manager.create({
        type: 'scheduled',
        action: 'Task 1',
        schedule: { cron: 'not-valid', timezone: 'UTC' },
        channel: { type: 'discord', id: 'ch1', overridden: false },
        createdBy: 'user1',
      })
    ).rejects.toThrow('Invalid cron');
  });

  it('should reject polling interval below minimum', async () => {
    await expect(
      manager.create({
        type: 'monitor',
        action: 'Check something',
        polling: { intervalMs: 1000, condition: 'something' },
        channel: { type: 'discord', id: 'ch1', overridden: false },
        createdBy: 'user1',
      })
    ).rejects.toThrow('Polling interval');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/behavior-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write the manager implementation**

```typescript
import { nanoid } from 'nanoid';
import { getLogger } from '@auxiora/logger';
import type {
  Behavior,
  BehaviorType,
  BehaviorStatus,
  BehaviorSchedule,
  BehaviorPolling,
  BehaviorDelay,
  BehaviorChannel,
} from './types.js';
import { BEHAVIOR_DEFAULTS } from './types.js';
import { BehaviorStore } from './store.js';
import { Scheduler } from './scheduler.js';
import { MonitorEngine } from './monitor.js';
import { BehaviorExecutor, type ExecutorDeps } from './executor.js';

const logger = getLogger('behaviors:manager');

export interface CreateBehaviorInput {
  type: BehaviorType;
  action: string;
  schedule?: BehaviorSchedule;
  polling?: BehaviorPolling;
  delay?: BehaviorDelay;
  channel: BehaviorChannel;
  createdBy: string;
}

export interface BehaviorManagerOptions {
  storePath: string;
  executorDeps: ExecutorDeps;
  auditFn: (event: string, details: Record<string, unknown>) => Promise<void> | void;
}

export class BehaviorManager {
  private store: BehaviorStore;
  private scheduler: Scheduler;
  private monitor: MonitorEngine;
  private executor: BehaviorExecutor;
  private auditFn: (event: string, details: Record<string, unknown>) => Promise<void> | void;
  private executionQueue: Promise<void> = Promise.resolve();
  private oneshotTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: BehaviorManagerOptions) {
    this.store = new BehaviorStore(options.storePath);
    this.scheduler = new Scheduler();
    this.monitor = new MonitorEngine();
    this.executor = new BehaviorExecutor(options.executorDeps);
    this.auditFn = options.auditFn;
  }

  async start(): Promise<void> {
    const behaviors = await this.store.listActive();
    logger.info('Starting behavior manager', { activeBehaviors: behaviors.length });

    for (const behavior of behaviors) {
      this.activate(behavior);
    }
  }

  async stop(): Promise<void> {
    this.scheduler.stopAll();
    this.monitor.stopAll();
    for (const [id, timer] of this.oneshotTimers) {
      clearTimeout(timer);
    }
    this.oneshotTimers.clear();
    logger.info('Behavior manager stopped');
  }

  async create(input: CreateBehaviorInput): Promise<Behavior> {
    this.validate(input);

    const behavior: Behavior = {
      id: `bh_${nanoid(8)}`,
      type: input.type,
      status: 'active',
      action: input.action,
      schedule: input.schedule,
      polling: input.polling,
      delay: input.delay,
      channel: input.channel,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      runCount: 0,
      failCount: 0,
      maxFailures: BEHAVIOR_DEFAULTS.maxFailures,
    };

    await this.store.save(behavior);
    this.activate(behavior);

    this.auditFn('system.startup', {
      action: 'behavior.created',
      behaviorId: behavior.id,
      type: behavior.type,
    });

    logger.info('Created behavior', { id: behavior.id, type: behavior.type, action: behavior.action });
    return behavior;
  }

  async list(filter?: { type?: BehaviorType; status?: BehaviorStatus }): Promise<Behavior[]> {
    const all = await this.store.getAll();
    return all.filter((b) => {
      if (filter?.type && b.type !== filter.type) return false;
      if (filter?.status && b.status !== filter.status) return false;
      return true;
    });
  }

  async get(id: string): Promise<Behavior | undefined> {
    return this.store.get(id);
  }

  async update(id: string, updates: Partial<Behavior>): Promise<Behavior | undefined> {
    const current = await this.store.get(id);
    if (!current) return undefined;

    const wasActive = current.status === 'active';
    const updated = await this.store.update(id, updates);
    if (!updated) return undefined;

    const isActive = updated.status === 'active';

    // Handle status transitions
    if (wasActive && !isActive) {
      this.deactivate(id);
    } else if (!wasActive && isActive) {
      this.activate(updated);
    } else if (wasActive && isActive) {
      // Re-activate with new settings
      this.deactivate(id);
      this.activate(updated);
    }

    logger.info('Updated behavior', { id, updates: Object.keys(updates) });
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.deactivate(id);
    const removed = await this.store.remove(id);

    if (removed) {
      this.auditFn('system.startup', {
        action: 'behavior.deleted',
        behaviorId: id,
      });
      logger.info('Removed behavior', { id });
    }

    return removed;
  }

  private validate(input: CreateBehaviorInput): void {
    if (input.type === 'scheduled') {
      if (!input.schedule?.cron) {
        throw new Error('Scheduled behaviors require a cron expression');
      }
      if (!Scheduler.isValidCron(input.schedule.cron)) {
        throw new Error(`Invalid cron expression: ${input.schedule.cron}`);
      }
    }

    if (input.type === 'monitor') {
      if (!input.polling?.intervalMs || !input.polling?.condition) {
        throw new Error('Monitor behaviors require polling interval and condition');
      }
      if (input.polling.intervalMs < BEHAVIOR_DEFAULTS.minPollingIntervalMs) {
        throw new Error(
          `Polling interval must be at least ${BEHAVIOR_DEFAULTS.minPollingIntervalMs}ms (${BEHAVIOR_DEFAULTS.minPollingIntervalMs / 1000}s)`
        );
      }
    }

    if (input.type === 'one-shot') {
      if (!input.delay?.fireAt) {
        throw new Error('One-shot behaviors require a fireAt timestamp');
      }
      const fireAt = new Date(input.delay.fireAt);
      if (fireAt.getTime() <= Date.now()) {
        throw new Error('One-shot fireAt must be in the future');
      }
    }
  }

  private activate(behavior: Behavior): void {
    switch (behavior.type) {
      case 'scheduled':
        if (behavior.schedule) {
          this.scheduler.schedule(
            behavior.id,
            behavior.schedule.cron,
            () => this.enqueueExecution(behavior.id),
            behavior.schedule.timezone
          );
        }
        break;

      case 'monitor':
        if (behavior.polling) {
          this.monitor.start(
            behavior.id,
            behavior.polling.intervalMs,
            () => this.enqueueExecution(behavior.id)
          );
        }
        break;

      case 'one-shot':
        if (behavior.delay) {
          const delayMs = new Date(behavior.delay.fireAt).getTime() - Date.now();
          if (delayMs > 0) {
            const timer = setTimeout(() => {
              this.oneshotTimers.delete(behavior.id);
              this.enqueueExecution(behavior.id);
            }, delayMs);
            this.oneshotTimers.set(behavior.id, timer);
          } else {
            // Missed one-shot
            this.store.update(behavior.id, { status: 'missed' });
          }
        }
        break;
    }
  }

  private deactivate(id: string): void {
    this.scheduler.stop(id);
    this.monitor.stop(id);
    const timer = this.oneshotTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.oneshotTimers.delete(id);
    }
  }

  private enqueueExecution(behaviorId: string): void {
    this.executionQueue = this.executionQueue.then(async () => {
      await this.executeWithRetry(behaviorId);
    }).catch((error) => {
      logger.error('Execution queue error', { behaviorId, error: String(error) });
    });
  }

  private async executeWithRetry(behaviorId: string): Promise<void> {
    const behavior = await this.store.get(behaviorId);
    if (!behavior || behavior.status !== 'active') return;

    let result = await this.executor.execute(behavior);

    // Retry once on transient failure
    if (!result.success) {
      logger.info('Retrying behavior execution', { id: behaviorId });
      await new Promise((resolve) => setTimeout(resolve, BEHAVIOR_DEFAULTS.retryDelayMs));
      result = await this.executor.execute(behavior);
    }

    // Update behavior state
    const updates: Partial<Behavior> = {
      lastRun: new Date().toISOString(),
      lastResult: result.success ? result.result?.slice(0, 500) : result.error,
      runCount: behavior.runCount + 1,
    };

    if (result.success) {
      updates.failCount = 0;

      // Auto-remove completed one-shots
      if (behavior.type === 'one-shot') {
        updates.status = 'deleted';
        this.deactivate(behaviorId);
      }
    } else {
      updates.failCount = behavior.failCount + 1;

      // Auto-pause on repeated failures
      if (updates.failCount >= behavior.maxFailures) {
        updates.status = 'paused';
        this.deactivate(behaviorId);
        logger.warn('Auto-paused behavior due to repeated failures', {
          id: behaviorId,
          failCount: updates.failCount,
        });
      }
    }

    await this.store.update(behaviorId, updates);

    this.auditFn('system.startup', {
      action: 'behavior.executed',
      behaviorId,
      success: result.success,
      error: result.error,
    });
  }
}
```

**Step 4: Update index.ts**

Add to `packages/behaviors/src/index.ts`:
```typescript
export { BehaviorManager, type CreateBehaviorInput, type BehaviorManagerOptions } from './behavior-manager.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose packages/behaviors/tests/behavior-manager.test.ts`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add packages/behaviors/src/behavior-manager.ts packages/behaviors/tests/behavior-manager.test.ts packages/behaviors/src/index.ts
git commit -m "feat(behaviors): add BehaviorManager for lifecycle orchestration"
```

---

## Task 7: Behavior Tools (4 tools for the tool system)

**Files:**
- Create: `packages/tools/src/behaviors.ts`
- Modify: `packages/tools/src/index.ts`
- Modify: `packages/tools/package.json`

**Step 1: Create the behavior tools**

Create `packages/tools/src/behaviors.ts`:

```typescript
import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:behaviors');

// These will be set by the runtime when behaviors are initialized
let behaviorManager: any = null;

export function setBehaviorManager(manager: any): void {
  behaviorManager = manager;
  logger.info('Behavior manager connected to tools');
}

function requireManager(): any {
  if (!behaviorManager) {
    throw new Error('Behavior system not initialized');
  }
  return behaviorManager;
}

export const CreateBehaviorTool: Tool = {
  name: 'create_behavior',
  description: 'Create a proactive behavior: scheduled task, condition monitor, or one-shot reminder. The AI assistant calls this when a user asks it to do something periodically, monitor something, or remind them later.',

  parameters: [
    {
      name: 'type',
      type: 'string',
      description: 'Behavior type: "scheduled" (cron), "monitor" (polling with condition), or "one-shot" (delayed once)',
      required: true,
    },
    {
      name: 'action',
      type: 'string',
      description: 'What to do when triggered (natural language prompt for the AI)',
      required: true,
    },
    {
      name: 'cron',
      type: 'string',
      description: 'Cron expression for scheduled behaviors (e.g., "0 8 * * *" for daily at 8am)',
      required: false,
    },
    {
      name: 'timezone',
      type: 'string',
      description: 'IANA timezone (e.g., "America/New_York"). Defaults to system timezone.',
      required: false,
    },
    {
      name: 'intervalMs',
      type: 'number',
      description: 'Polling interval in milliseconds for monitors (minimum 60000)',
      required: false,
    },
    {
      name: 'condition',
      type: 'string',
      description: 'Condition for monitors: only deliver when this is true (natural language)',
      required: false,
    },
    {
      name: 'delay',
      type: 'string',
      description: 'ISO timestamp for one-shot behaviors (when to fire)',
      required: false,
    },
    {
      name: 'channelOverride',
      type: 'string',
      description: 'Override delivery channel (e.g., "telegram", "discord")',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();

      const input: any = {
        type: params.type,
        action: params.action,
        channel: {
          type: params.channelOverride || context.environment?.channelType || 'webchat',
          id: context.environment?.channelId || context.sessionId || 'default',
          overridden: !!params.channelOverride,
        },
        createdBy: context.userId || 'unknown',
      };

      if (params.type === 'scheduled') {
        input.schedule = {
          cron: params.cron,
          timezone: params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      } else if (params.type === 'monitor') {
        input.polling = {
          intervalMs: params.intervalMs,
          condition: params.condition,
        };
      } else if (params.type === 'one-shot') {
        input.delay = { fireAt: params.delay };
      }

      const behavior = await manager.create(input);

      return {
        success: true,
        output: JSON.stringify({
          id: behavior.id,
          type: behavior.type,
          action: behavior.action,
          status: behavior.status,
          message: `Behavior created: ${behavior.id}`,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const ListBehaviorsTool: Tool = {
  name: 'list_behaviors',
  description: 'List all proactive behaviors for the current user. Shows scheduled tasks, monitors, and reminders with their status.',

  parameters: [
    {
      name: 'type',
      type: 'string',
      description: 'Filter by type: "scheduled", "monitor", or "one-shot"',
      required: false,
    },
    {
      name: 'status',
      type: 'string',
      description: 'Filter by status: "active", "paused"',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const behaviors = await manager.list({
        type: params.type,
        status: params.status,
      });

      const summary = behaviors.map((b: any) => ({
        id: b.id,
        type: b.type,
        status: b.status,
        action: b.action,
        lastRun: b.lastRun || 'never',
        runCount: b.runCount,
      }));

      return {
        success: true,
        output: JSON.stringify(summary, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const UpdateBehaviorTool: Tool = {
  name: 'update_behavior',
  description: 'Update an existing behavior: change schedule, pause, resume, or modify the action.',

  parameters: [
    {
      name: 'id',
      type: 'string',
      description: 'Behavior ID (e.g., "bh_a3xK9m")',
      required: true,
    },
    {
      name: 'status',
      type: 'string',
      description: 'New status: "active" (resume), "paused"',
      required: false,
    },
    {
      name: 'action',
      type: 'string',
      description: 'New action prompt',
      required: false,
    },
    {
      name: 'cron',
      type: 'string',
      description: 'New cron expression (scheduled behaviors only)',
      required: false,
    },
    {
      name: 'intervalMs',
      type: 'number',
      description: 'New polling interval (monitor behaviors only)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const updates: any = {};

      if (params.status) updates.status = params.status;
      if (params.action) updates.action = params.action;
      if (params.cron) updates.schedule = { cron: params.cron, timezone: params.timezone };
      if (params.intervalMs) updates.polling = { intervalMs: params.intervalMs };

      const updated = await manager.update(params.id, updates);

      if (!updated) {
        return { success: false, error: `Behavior not found: ${params.id}` };
      }

      return {
        success: true,
        output: JSON.stringify({
          id: updated.id,
          status: updated.status,
          message: `Behavior updated: ${updated.id}`,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const DeleteBehaviorsTool: Tool = {
  name: 'delete_behaviors',
  description: 'Delete one or more behaviors by ID or type.',

  parameters: [
    {
      name: 'id',
      type: 'string',
      description: 'Specific behavior ID to delete',
      required: false,
    },
    {
      name: 'type',
      type: 'string',
      description: 'Delete all behaviors of this type: "scheduled", "monitor", or "one-shot"',
      required: false,
    },
    {
      name: 'all',
      type: 'boolean',
      description: 'Delete all behaviors',
      required: false,
      default: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const manager = requireManager();
      let deleted = 0;

      if (params.id) {
        const removed = await manager.remove(params.id);
        deleted = removed ? 1 : 0;
      } else if (params.type || params.all) {
        const behaviors = await manager.list(params.type ? { type: params.type } : undefined);
        for (const b of behaviors) {
          await manager.remove(b.id);
          deleted++;
        }
      } else {
        return { success: false, error: 'Provide id, type, or all=true' };
      }

      return {
        success: true,
        output: JSON.stringify({ deleted, message: `Deleted ${deleted} behavior(s)` }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
```

**Step 2: Update tools package.json to add dependency**

Add `"@auxiora/behaviors": "workspace:*"` is NOT needed — the tools don't import from behaviors directly. The manager is injected at runtime via `setBehaviorManager()`. No package.json change needed.

**Step 3: Register tools in tools/src/index.ts**

Add at the bottom of `packages/tools/src/index.ts`, before the closing log:

```typescript
import { CreateBehaviorTool, ListBehaviorsTool, UpdateBehaviorTool, DeleteBehaviorsTool, setBehaviorManager } from './behaviors.js';

toolRegistry.register(CreateBehaviorTool);
toolRegistry.register(ListBehaviorsTool);
toolRegistry.register(UpdateBehaviorTool);
toolRegistry.register(DeleteBehaviorsTool);

export { CreateBehaviorTool, ListBehaviorsTool, UpdateBehaviorTool, DeleteBehaviorsTool, setBehaviorManager } from './behaviors.js';
```

**Step 4: Build to verify no type errors**

Run: `cd /home/ai-work/git/auxiora && pnpm build`
Expected: Clean build

**Step 5: Commit**

```bash
git add packages/tools/src/behaviors.ts packages/tools/src/index.ts
git commit -m "feat(tools): add behavior management tools (create, list, update, delete)"
```

---

## Task 8: Runtime Integration

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`
- Modify: `packages/runtime/tsconfig.json`
- Modify: `packages/core/src/index.ts`

**Step 1: Add behaviors path to core**

Add to `packages/core/src/index.ts`, before the `paths` export:

```typescript
export function getBehaviorsPath(): string {
  return path.join(getDataDir(), 'behaviors.json');
}
```

And add `behaviors: getBehaviorsPath` to the `paths` object.

**Step 2: Add @auxiora/behaviors dependency to runtime**

Add to `packages/runtime/package.json` dependencies:
```json
"@auxiora/behaviors": "workspace:*"
```

Add to `packages/runtime/tsconfig.json` references:
```json
{ "path": "../behaviors" }
```

**Step 3: Wire BehaviorManager into the Auxiora class**

In `packages/runtime/src/index.ts`:

1. Add imports at the top:
```typescript
import { BehaviorManager } from '@auxiora/behaviors';
import { setBehaviorManager } from '@auxiora/tools';
import { getBehaviorsPath } from '@auxiora/core';
import { audit } from '@auxiora/audit';
```

2. Add field to the Auxiora class:
```typescript
private behaviors?: BehaviorManager;
```

3. At the end of `initialize()` method, after `this.gateway.onMessage(...)`:
```typescript
// Initialize behavior system
if (this.providers) {
  this.behaviors = new BehaviorManager({
    storePath: getBehaviorsPath(),
    executorDeps: {
      getProvider: () => this.providers.getPrimaryProvider(),
      sendToChannel: async (channelType: string, channelId: string, message: { content: string }) => {
        if (this.channels) {
          return this.channels.send(channelType as any, channelId, message);
        }
        // For webchat, we can't proactively send (no persistent connection)
        return { success: false, error: 'Channel not available for proactive delivery' };
      },
      getSystemPrompt: () => this.systemPrompt,
    },
    auditFn: (event: string, details: Record<string, unknown>) => {
      audit(event as any, details);
    },
  });
  setBehaviorManager(this.behaviors);
  await this.behaviors.start();
}
```

4. In the `stop()` method, before `this.vault.lock()`:
```typescript
if (this.behaviors) {
  await this.behaviors.stop();
}
```

**Step 4: Install dependencies and build**

Run: `cd /home/ai-work/git/auxiora && pnpm install && pnpm build`
Expected: Clean build

**Step 5: Run all tests to verify no regressions**

Run: `cd /home/ai-work/git/auxiora && pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/runtime/src/index.ts packages/runtime/package.json packages/runtime/tsconfig.json
git commit -m "feat(runtime): integrate BehaviorManager into Auxiora lifecycle"
```

---

## Task 9: Add Behavior Audit Event Types

**Files:**
- Modify: `packages/audit/src/index.ts`

**Step 1: Add new audit event types**

In `packages/audit/src/index.ts`, add to the `AuditEventType` union (before the last semicolon):

```typescript
  | 'behavior.created'
  | 'behavior.updated'
  | 'behavior.deleted'
  | 'behavior.executed'
  | 'behavior.paused'
  | 'behavior.failed'
```

**Step 2: Build and test**

Run: `cd /home/ai-work/git/auxiora && pnpm build && pnpm test`
Expected: Clean build, all tests pass

**Step 3: Update the BehaviorManager to use proper event types**

In `packages/behaviors/src/behavior-manager.ts`, replace the `system.startup` audit event strings with the proper behavior event types. The `auditFn` type should accept any string — the runtime will cast to `AuditEventType`.

**Step 4: Commit**

```bash
git add packages/audit/src/index.ts packages/behaviors/src/behavior-manager.ts
git commit -m "feat(audit): add behavior lifecycle audit event types"
```

---

## Task 10: Final Integration Test + Version Bump

**Files:**
- Create: `packages/behaviors/tests/integration.test.ts`
- Modify: root `package.json`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorManager } from '../src/behavior-manager.js';
import type { ExecutorDeps } from '../src/executor.js';

let testDir: string;

describe('Behaviors Integration', () => {
  let manager: BehaviorManager;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      'auxiora-behaviors-int-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    await fs.mkdir(testDir, { recursive: true });

    const deps: ExecutorDeps = {
      getProvider: () => ({
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          content: 'Test result',
          usage: { inputTokens: 5, outputTokens: 10 },
          model: 'mock',
          finishReason: 'end_turn',
        }),
      }),
      sendToChannel: vi.fn().mockResolvedValue({ success: true }),
      getSystemPrompt: () => 'Test',
    };

    manager = new BehaviorManager({
      storePath: path.join(testDir, 'behaviors.json'),
      executorDeps: deps,
      auditFn: vi.fn(),
    });
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should persist behaviors across manager restarts', async () => {
    await manager.create({
      type: 'scheduled',
      action: 'Check news',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });
    await manager.stop();

    // Create new manager with same store path
    const deps2: ExecutorDeps = {
      getProvider: () => ({
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          content: 'Test result',
          usage: { inputTokens: 5, outputTokens: 10 },
          model: 'mock',
          finishReason: 'end_turn',
        }),
      }),
      sendToChannel: vi.fn().mockResolvedValue({ success: true }),
      getSystemPrompt: () => 'Test',
    };

    const manager2 = new BehaviorManager({
      storePath: path.join(testDir, 'behaviors.json'),
      executorDeps: deps2,
      auditFn: vi.fn(),
    });
    await manager2.start();

    const list = await manager2.list();
    expect(list).toHaveLength(1);
    expect(list[0].action).toBe('Check news');

    await manager2.stop();
  });

  it('should support full CRUD lifecycle', async () => {
    // Create
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Do something',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'webchat', id: 'wc1', overridden: false },
      createdBy: 'user1',
    });
    expect(behavior.status).toBe('active');

    // Read
    const fetched = await manager.get(behavior.id);
    expect(fetched).toBeDefined();

    // Update (pause)
    const paused = await manager.update(behavior.id, { status: 'paused' });
    expect(paused!.status).toBe('paused');

    // Update (resume)
    const resumed = await manager.update(behavior.id, { status: 'active' });
    expect(resumed!.status).toBe('active');

    // Delete
    const deleted = await manager.remove(behavior.id);
    expect(deleted).toBe(true);

    const list = await manager.list();
    expect(list).toHaveLength(0);
  });

  it('should handle all three behavior types', async () => {
    await manager.create({
      type: 'scheduled',
      action: 'Scheduled task',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    await manager.create({
      type: 'monitor',
      action: 'Monitor task',
      polling: { intervalMs: 60_000, condition: 'some condition' },
      channel: { type: 'telegram', id: 'tg1', overridden: false },
      createdBy: 'user1',
    });

    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    await manager.create({
      type: 'one-shot',
      action: 'Reminder',
      delay: { fireAt: futureDate },
      channel: { type: 'webchat', id: 'wc1', overridden: false },
      createdBy: 'user1',
    });

    const all = await manager.list();
    expect(all).toHaveLength(3);

    const types = all.map((b) => b.type).sort();
    expect(types).toEqual(['monitor', 'one-shot', 'scheduled']);
  });
});
```

**Step 2: Run all tests**

Run: `cd /home/ai-work/git/auxiora && pnpm test -- --reporter verbose`
Expected: All tests pass (existing + new)

**Step 3: Bump version to 1.3.0**

In root `package.json`, change version to `"1.3.0"`.

**Step 4: Commit**

```bash
git add packages/behaviors/tests/integration.test.ts package.json
git commit -m "feat(behaviors): add integration tests and bump version to 1.3.0"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Package scaffolding + types | `packages/behaviors/{package.json,tsconfig.json,src/types.ts,src/index.ts}` |
| 2 | BehaviorStore | `packages/behaviors/src/store.ts`, tests |
| 3 | Scheduler | `packages/behaviors/src/scheduler.ts`, tests |
| 4 | MonitorEngine | `packages/behaviors/src/monitor.ts`, tests |
| 5 | BehaviorExecutor | `packages/behaviors/src/executor.ts`, tests |
| 6 | BehaviorManager | `packages/behaviors/src/behavior-manager.ts`, tests |
| 7 | 4 behavior tools | `packages/tools/src/behaviors.ts`, modify `index.ts` |
| 8 | Runtime integration | `packages/runtime/src/index.ts`, `packages/core/src/index.ts` |
| 9 | Audit event types | `packages/audit/src/index.ts` |
| 10 | Integration tests + version bump | `packages/behaviors/tests/integration.test.ts` |
