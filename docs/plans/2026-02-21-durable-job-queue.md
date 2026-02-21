# Durable Job Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a SQLite-backed durable job queue (`packages/job-queue/`) that all background workloads use for crash-recoverable processing.

**Architecture:** Central polling queue with one SQLite database (WAL mode). Handler registration per job type. Auto-retry with exponential backoff on crash recovery. Checkpoint support for long-running jobs. Integrates with behaviors, ReAct loops, orchestration, and ambient patterns.

**Tech Stack:** Node 22 `node:sqlite` (DatabaseSync), vitest, TypeScript strict ESM.

**Design doc:** `docs/plans/2026-02-21-durable-job-queue-design.md`

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/job-queue/package.json`
- Create: `packages/job-queue/tsconfig.json`
- Create: `packages/job-queue/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/job-queue",
  "version": "1.0.0",
  "description": "SQLite-backed durable job queue for Auxiora",
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
  "include": ["src/**/*"]
}
```

**Step 3: Create barrel export (empty for now)**

```typescript
// packages/job-queue/src/index.ts
// Exports added as modules are built.
```

**Step 4: Verify it links**

Run: `cd /home/ai-work/git/auxiora && pnpm install`
Expected: Package linked in workspace.

**Step 5: Verify TypeScript**

Run: `cd /home/ai-work/git/auxiora && npx tsc --project packages/job-queue/tsconfig.json --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add packages/job-queue/
git commit -m "chore: scaffold packages/job-queue"
```

---

### Task 2: Types

**Files:**
- Create: `packages/job-queue/src/types.ts`
- Modify: `packages/job-queue/src/index.ts`

**Step 1: Write the types file**

```typescript
// packages/job-queue/src/types.ts

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';

export interface Job {
  readonly id: string;
  readonly type: string;
  readonly status: JobStatus;
  readonly payload: unknown;
  readonly result: unknown | undefined;
  readonly priority: number;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly scheduledAt: number;
  readonly startedAt: number | undefined;
  readonly completedAt: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface JobOptions {
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: number;
}

export interface JobContext {
  readonly jobId: string;
  readonly attempt: number;
  readonly signal: AbortSignal;
  checkpoint(data: unknown): void;
  getCheckpoint<T = unknown>(): T | undefined;
}

export interface JobHandler<T = unknown, R = unknown> {
  (payload: T, context: JobContext): Promise<R>;
}

export interface JobQueueOptions {
  pollIntervalMs?: number;
  concurrency?: number;
}

export interface JobFilter {
  type?: string;
  status?: JobStatus;
  limit?: number;
}

export type JobEvent = 'job:started' | 'job:completed' | 'job:failed' | 'job:dead';

export interface JobQueueStats {
  pending: number;
  running: number;
  completed24h: number;
  failed24h: number;
  dead: number;
}
```

**Step 2: Update barrel export**

```typescript
// packages/job-queue/src/index.ts
export type {
  Job,
  JobStatus,
  JobOptions,
  JobContext,
  JobHandler,
  JobQueueOptions,
  JobFilter,
  JobEvent,
  JobQueueStats,
} from './types.js';
```

**Step 3: Typecheck**

Run: `npx tsc --project packages/job-queue/tsconfig.json --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add packages/job-queue/src/types.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add type definitions"
```

---

### Task 3: Errors Module

**Files:**
- Create: `packages/job-queue/src/errors.ts`
- Create: `packages/job-queue/src/__tests__/errors.test.ts`
- Modify: `packages/job-queue/src/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/job-queue/src/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import { NonRetryableError } from '../errors.js';

describe('NonRetryableError', () => {
  it('is an instance of Error', () => {
    const err = new NonRetryableError('bad input');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct message', () => {
    const err = new NonRetryableError('validation failed');
    expect(err.message).toBe('validation failed');
  });

  it('has name NonRetryableError', () => {
    const err = new NonRetryableError('x');
    expect(err.name).toBe('NonRetryableError');
  });

  it('can wrap a cause', () => {
    const cause = new Error('root');
    const err = new NonRetryableError('wrapped', { cause });
    expect(err.cause).toBe(cause);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/src/__tests__/errors.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// packages/job-queue/src/errors.ts
export class NonRetryableError extends Error {
  override readonly name = 'NonRetryableError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
```

**Step 4: Update barrel export**

Add to `packages/job-queue/src/index.ts`:
```typescript
export { NonRetryableError } from './errors.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/job-queue/src/__tests__/errors.test.ts`
Expected: 4 tests PASS.

**Step 6: Commit**

```bash
git add packages/job-queue/src/errors.ts packages/job-queue/src/__tests__/errors.test.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add NonRetryableError"
```

---

### Task 4: Database Layer

**Files:**
- Create: `packages/job-queue/src/db.ts`
- Create: `packages/job-queue/src/__tests__/db.test.ts`
- Modify: `packages/job-queue/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/job-queue/src/__tests__/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JobDatabase } from '../db.js';

describe('JobDatabase', () => {
  let dbPath: string;
  let db: JobDatabase;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `job-queue-test-${Date.now()}.db`);
    db = new JobDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
  });

  describe('insertJob', () => {
    it('inserts a job and returns it by id', () => {
      const id = db.insertJob({
        type: 'test',
        payload: { foo: 'bar' },
        priority: 0,
        maxAttempts: 3,
        scheduledAt: Date.now(),
      });

      const job = db.getJob(id);
      expect(job).toBeDefined();
      expect(job!.type).toBe('test');
      expect(job!.status).toBe('pending');
      expect(job!.payload).toEqual({ foo: 'bar' });
      expect(job!.attempt).toBe(0);
    });
  });

  describe('pollReady', () => {
    it('returns pending jobs whose scheduledAt has passed', () => {
      db.insertJob({ type: 'a', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 1000 });
      db.insertJob({ type: 'b', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() + 60000 });

      const ready = db.pollReady(10);
      expect(ready).toHaveLength(1);
      expect(ready[0].type).toBe('a');
      expect(ready[0].status).toBe('running');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        db.insertJob({ type: 'x', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 1000 });
      }
      const ready = db.pollReady(2);
      expect(ready).toHaveLength(2);
    });

    it('picks higher priority first', () => {
      db.insertJob({ type: 'low', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 1000 });
      db.insertJob({ type: 'high', payload: {}, priority: 10, maxAttempts: 3, scheduledAt: Date.now() - 1000 });

      const ready = db.pollReady(1);
      expect(ready[0].type).toBe('high');
    });
  });

  describe('completeJob', () => {
    it('sets status to completed with result', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 100 });
      db.pollReady(1); // move to running
      db.completeJob(id, { answer: 42 });

      const job = db.getJob(id);
      expect(job!.status).toBe('completed');
      expect(job!.result).toEqual({ answer: 42 });
      expect(job!.completedAt).toBeDefined();
    });
  });

  describe('failJob', () => {
    it('retries by resetting to pending with backoff when attempts remain', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 100 });
      db.pollReady(1);
      db.failJob(id, 'oops');

      const job = db.getJob(id);
      expect(job!.status).toBe('pending');
      expect(job!.attempt).toBe(1);
      expect(job!.scheduledAt).toBeGreaterThan(Date.now() - 100);
    });

    it('marks as dead when max attempts exhausted', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 1, scheduledAt: Date.now() - 100 });
      db.pollReady(1);
      db.failJob(id, 'fatal');

      const job = db.getJob(id);
      expect(job!.status).toBe('dead');
      expect(job!.result).toEqual({ error: 'fatal' });
    });
  });

  describe('killJob', () => {
    it('marks a pending job as dead', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() + 99999 });
      db.killJob(id);

      const job = db.getJob(id);
      expect(job!.status).toBe('dead');
    });
  });

  describe('recoverCrashed', () => {
    it('resets running jobs to pending with incremented attempt', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 100 });
      db.pollReady(1); // now running

      const recovered = db.recoverCrashed();
      expect(recovered).toBe(1);

      const job = db.getJob(id);
      expect(job!.status).toBe('pending');
      expect(job!.attempt).toBe(1);
    });

    it('marks as dead if recovery would exceed max attempts', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 1, scheduledAt: Date.now() - 100 });
      db.pollReady(1);

      db.recoverCrashed();

      const job = db.getJob(id);
      expect(job!.status).toBe('dead');
    });
  });

  describe('checkpoint', () => {
    it('saves and retrieves checkpoint data', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() });
      db.saveCheckpoint(id, { step: 3, partial: [1, 2, 3] });

      const cp = db.getCheckpoint(id);
      expect(cp).toEqual({ step: 3, partial: [1, 2, 3] });
    });

    it('overwrites previous checkpoint', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() });
      db.saveCheckpoint(id, { step: 1 });
      db.saveCheckpoint(id, { step: 2 });

      expect(db.getCheckpoint(id)).toEqual({ step: 2 });
    });

    it('returns undefined for no checkpoint', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() });
      expect(db.getCheckpoint(id)).toBeUndefined();
    });
  });

  describe('listJobs', () => {
    it('filters by type and status', () => {
      db.insertJob({ type: 'a', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() });
      db.insertJob({ type: 'b', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() });

      const aJobs = db.listJobs({ type: 'a' });
      expect(aJobs).toHaveLength(1);
      expect(aJobs[0].type).toBe('a');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        db.insertJob({ type: 'x', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() });
      }
      expect(db.listJobs({ limit: 2 })).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('returns counts by status', () => {
      db.insertJob({ type: 'a', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 100 });
      db.insertJob({ type: 'b', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 100 });
      db.pollReady(1);

      const stats = db.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
    });
  });

  describe('cleanupOld', () => {
    it('deletes completed and dead jobs older than the cutoff', () => {
      const id = db.insertJob({ type: 'test', payload: {}, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 100 });
      db.pollReady(1);
      db.completeJob(id, 'done');

      // Force completed_at into the past
      db.forceTimestamp(id, 'completed_at', Date.now() - 8 * 86400000);

      const removed = db.cleanupOld(7 * 86400000);
      expect(removed).toBe(1);
      expect(db.getJob(id)).toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/job-queue/src/__tests__/db.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the database implementation**

```typescript
// packages/job-queue/src/db.ts
import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import type { Job, JobStatus, JobFilter, JobQueueStats } from './types.js';

interface InsertJobInput {
  type: string;
  payload: unknown;
  priority: number;
  maxAttempts: number;
  scheduledAt: number;
}

export class JobDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        payload       TEXT NOT NULL,
        result        TEXT,
        priority      INTEGER NOT NULL DEFAULT 0,
        attempt       INTEGER NOT NULL DEFAULT 0,
        max_attempts  INTEGER NOT NULL DEFAULT 3,
        scheduled_at  INTEGER NOT NULL,
        started_at    INTEGER,
        completed_at  INTEGER,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs(status, scheduled_at, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type, status);

      CREATE TABLE IF NOT EXISTS job_checkpoints (
        job_id      TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        data        TEXT NOT NULL,
        updated_at  INTEGER NOT NULL
      );
    `);
  }

  insertJob(input: InsertJobInput): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO jobs (id, type, status, payload, priority, max_attempts, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, input.type, 'pending', JSON.stringify(input.payload), input.priority, input.maxAttempts, input.scheduledAt, now, now);
    return id;
  }

  getJob(id: string): Job | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToJob(row) : undefined;
  }

  pollReady(limit: number): Job[] {
    const now = Date.now();
    const rows = this.db.prepare(
      'SELECT * FROM jobs WHERE status = ? AND scheduled_at <= ? ORDER BY priority DESC, scheduled_at ASC LIMIT ?',
    ).all('pending', now, limit) as Record<string, unknown>[];

    const jobs: Job[] = [];
    for (const row of rows) {
      this.db.prepare(
        'UPDATE jobs SET status = ?, started_at = ?, updated_at = ? WHERE id = ?',
      ).run('running', now, now, row.id as string);
      jobs.push(this.rowToJob({ ...row, status: 'running', started_at: now, updated_at: now }));
    }
    return jobs;
  }

  completeJob(id: string, result: unknown): void {
    const now = Date.now();
    this.db.prepare(
      'UPDATE jobs SET status = ?, result = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    ).run('completed', JSON.stringify(result), now, now, id);
  }

  failJob(id: string, errorMsg: string): void {
    const row = this.db.prepare('SELECT attempt, max_attempts FROM jobs WHERE id = ?').get(id) as
      | { attempt: number; max_attempts: number }
      | undefined;
    if (!row) return;

    const now = Date.now();
    const nextAttempt = row.attempt + 1;

    if (nextAttempt >= row.max_attempts) {
      this.db.prepare(
        'UPDATE jobs SET status = ?, result = ?, attempt = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      ).run('dead', JSON.stringify({ error: errorMsg }), nextAttempt, now, now, id);
    } else {
      const backoffMs = Math.pow(2, nextAttempt) * 1000;
      this.db.prepare(
        'UPDATE jobs SET status = ?, attempt = ?, scheduled_at = ?, updated_at = ? WHERE id = ?',
      ).run('pending', nextAttempt, now + backoffMs, now, id);
    }
  }

  killJob(id: string): void {
    const now = Date.now();
    this.db.prepare(
      'UPDATE jobs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    ).run('dead', now, now, id);
  }

  recoverCrashed(): number {
    const now = Date.now();
    const rows = this.db.prepare('SELECT id, attempt, max_attempts FROM jobs WHERE status = ?').all('running') as
      Array<{ id: string; attempt: number; max_attempts: number }>;

    let recovered = 0;
    for (const row of rows) {
      const nextAttempt = row.attempt + 1;
      if (nextAttempt >= row.max_attempts) {
        this.db.prepare(
          'UPDATE jobs SET status = ?, result = ?, attempt = ?, completed_at = ?, updated_at = ? WHERE id = ?',
        ).run('dead', JSON.stringify({ error: 'Process crashed, max attempts exhausted' }), nextAttempt, now, now, row.id);
      } else {
        const backoffMs = Math.pow(2, nextAttempt) * 1000;
        this.db.prepare(
          'UPDATE jobs SET status = ?, attempt = ?, scheduled_at = ?, updated_at = ? WHERE id = ?',
        ).run('pending', nextAttempt, now + backoffMs, now, row.id);
      }
      recovered++;
    }
    return recovered;
  }

  saveCheckpoint(jobId: string, data: unknown): void {
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO job_checkpoints (job_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    ).run(jobId, JSON.stringify(data), now);
  }

  getCheckpoint<T = unknown>(jobId: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM job_checkpoints WHERE job_id = ?').get(jobId) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  listJobs(filter?: JobFilter): Job[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.type) {
      conditions.push('type = ?');
      params.push(filter.type);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filter?.limit ?? 100;
    params.push(limit);

    const rows = this.db.prepare(
      `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT ?`,
    ).all(...params) as Record<string, unknown>[];

    return rows.map(r => this.rowToJob(r));
  }

  getStats(): JobQueueStats {
    const now = Date.now();
    const day = 86400000;

    const pending = (this.db.prepare('SELECT COUNT(*) as c FROM jobs WHERE status = ?').get('pending') as { c: number }).c;
    const running = (this.db.prepare('SELECT COUNT(*) as c FROM jobs WHERE status = ?').get('running') as { c: number }).c;
    const completed24h = (this.db.prepare('SELECT COUNT(*) as c FROM jobs WHERE status = ? AND completed_at > ?').get('completed', now - day) as { c: number }).c;
    const failed24h = (this.db.prepare('SELECT COUNT(*) as c FROM jobs WHERE status = ? AND completed_at > ?').get('dead', now - day) as { c: number }).c;
    const dead = (this.db.prepare('SELECT COUNT(*) as c FROM jobs WHERE status = ?').get('dead') as { c: number }).c;

    return { pending, running, completed24h, failed24h, dead };
  }

  cleanupOld(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db.prepare(
      'DELETE FROM jobs WHERE status IN (?, ?) AND completed_at IS NOT NULL AND completed_at < ?',
    ).run('completed', 'dead', cutoff);
    return result.changes;
  }

  /** Test helper: force a timestamp column to a specific value. */
  forceTimestamp(id: string, column: string, value: number): void {
    // Only allow known safe column names to prevent injection
    const allowed = ['created_at', 'updated_at', 'started_at', 'completed_at', 'scheduled_at'];
    if (!allowed.includes(column)) throw new Error(`Invalid column: ${column}`);
    this.db.prepare(`UPDATE jobs SET ${column} = ? WHERE id = ?`).run(value, id);
  }

  close(): void {
    this.db.close();
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      type: row.type as string,
      status: row.status as JobStatus,
      payload: JSON.parse(row.payload as string),
      result: row.result ? JSON.parse(row.result as string) : undefined,
      priority: row.priority as number,
      attempt: row.attempt as number,
      maxAttempts: row.max_attempts as number,
      scheduledAt: row.scheduled_at as number,
      startedAt: row.started_at as number | undefined,
      completedAt: row.completed_at as number | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
```

**Step 4: Update barrel export**

Add to `packages/job-queue/src/index.ts`:
```typescript
export { JobDatabase } from './db.js';
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/job-queue/src/__tests__/db.test.ts`
Expected: All 13 tests PASS.

**Step 6: Commit**

```bash
git add packages/job-queue/src/db.ts packages/job-queue/src/__tests__/db.test.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add SQLite database layer"
```

---

### Task 5: JobQueue Class (Core)

**Files:**
- Create: `packages/job-queue/src/queue.ts`
- Create: `packages/job-queue/src/__tests__/queue.test.ts`
- Modify: `packages/job-queue/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/job-queue/src/__tests__/queue.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JobQueue } from '../queue.js';
import { NonRetryableError } from '../errors.js';

describe('JobQueue', () => {
  let dbPath: string;
  let queue: JobQueue;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `job-queue-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    queue = new JobQueue(dbPath, { pollIntervalMs: 50, concurrency: 2 });
  });

  afterEach(async () => {
    await queue.stop(1000);
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
  });

  describe('register and enqueue', () => {
    it('runs a registered handler for an enqueued job', async () => {
      const results: string[] = [];
      queue.register<{ msg: string }, void>('echo', async (payload) => {
        results.push(payload.msg);
      });

      queue.enqueue('echo', { msg: 'hello' });
      queue.start();

      await vi.waitFor(() => {
        expect(results).toEqual(['hello']);
      }, { timeout: 2000 });
    });

    it('throws if enqueuing an unregistered type', () => {
      expect(() => queue.enqueue('unknown', {})).toThrow('No handler registered');
    });
  });

  describe('scheduling', () => {
    it('delays job until scheduledAt', async () => {
      const results: number[] = [];
      queue.register('timed', async () => {
        results.push(Date.now());
      });

      const future = Date.now() + 200;
      queue.enqueue('timed', {}, { scheduledAt: future });
      queue.start();

      await vi.waitFor(() => {
        expect(results).toHaveLength(1);
        expect(results[0]).toBeGreaterThanOrEqual(future - 50);
      }, { timeout: 2000 });
    });
  });

  describe('priority', () => {
    it('processes higher priority jobs first', async () => {
      const order: string[] = [];
      queue.register('ordered', async (payload: { name: string }) => {
        order.push(payload.name);
        await new Promise(r => setTimeout(r, 10));
      });

      // Enqueue low first, high second — high should still run first
      queue.enqueue('ordered', { name: 'low' }, { priority: 0 });
      queue.enqueue('ordered', { name: 'high' }, { priority: 10 });
      queue.start();

      await vi.waitFor(() => {
        expect(order).toHaveLength(2);
      }, { timeout: 2000 });

      expect(order[0]).toBe('high');
    });
  });

  describe('retry on failure', () => {
    it('retries a failing job with exponential backoff', async () => {
      let attempts = 0;
      queue.register('flaky', async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
      });

      queue.enqueue('flaky', {}, { maxAttempts: 3 });
      queue.start();

      await vi.waitFor(() => {
        expect(attempts).toBe(3);
      }, { timeout: 10000 });

      const jobs = queue.listJobs({ type: 'flaky', status: 'completed' });
      expect(jobs).toHaveLength(1);
    });
  });

  describe('NonRetryableError', () => {
    it('skips retries and goes straight to dead', async () => {
      let attempts = 0;
      queue.register('fatal', async () => {
        attempts++;
        throw new NonRetryableError('bad config');
      });

      queue.enqueue('fatal', {}, { maxAttempts: 3 });
      queue.start();

      await vi.waitFor(() => {
        const dead = queue.listJobs({ type: 'fatal', status: 'dead' });
        expect(dead).toHaveLength(1);
      }, { timeout: 2000 });

      expect(attempts).toBe(1);
    });
  });

  describe('concurrency', () => {
    it('runs up to concurrency jobs in parallel', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      queue.register('conc', async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 100));
        concurrent--;
      });

      for (let i = 0; i < 4; i++) {
        queue.enqueue('conc', {});
      }
      queue.start();

      await vi.waitFor(() => {
        const completed = queue.listJobs({ type: 'conc', status: 'completed' });
        expect(completed).toHaveLength(4);
      }, { timeout: 5000 });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('events', () => {
    it('emits job:started and job:completed events', async () => {
      const events: string[] = [];
      queue.on('job:started', () => events.push('started'));
      queue.on('job:completed', () => events.push('completed'));

      queue.register('ev', async () => {});
      queue.enqueue('ev', {});
      queue.start();

      await vi.waitFor(() => {
        expect(events).toEqual(['started', 'completed']);
      }, { timeout: 2000 });
    });

    it('emits job:dead on NonRetryableError', async () => {
      const events: string[] = [];
      queue.on('job:dead', () => events.push('dead'));

      queue.register('die', async () => { throw new NonRetryableError('nope'); });
      queue.enqueue('die', {});
      queue.start();

      await vi.waitFor(() => {
        expect(events).toContain('dead');
      }, { timeout: 2000 });
    });
  });

  describe('checkpoint', () => {
    it('handler can write and read checkpoints', async () => {
      let checkpointValue: unknown;

      queue.register('cp', async (_payload, ctx) => {
        const existing = ctx.getCheckpoint<{ step: number }>();
        if (existing) {
          checkpointValue = existing;
          return;
        }
        ctx.checkpoint({ step: 1 });
        throw new Error('simulate crash to trigger retry');
      });

      queue.enqueue('cp', {}, { maxAttempts: 3 });
      queue.start();

      await vi.waitFor(() => {
        expect(checkpointValue).toEqual({ step: 1 });
      }, { timeout: 5000 });
    });
  });

  describe('graceful shutdown', () => {
    it('stop waits for running jobs to complete', async () => {
      let completed = false;
      queue.register('slow', async () => {
        await new Promise(r => setTimeout(r, 200));
        completed = true;
      });

      queue.enqueue('slow', {});
      queue.start();

      // Give it time to start
      await new Promise(r => setTimeout(r, 100));
      await queue.stop(5000);

      expect(completed).toBe(true);
    });
  });

  describe('crash recovery', () => {
    it('recovers crashed jobs on start', async () => {
      let firstRun = true;
      const results: string[] = [];

      queue.register('recover', async () => {
        if (firstRun) {
          firstRun = false;
          throw new Error('simulate crash');
        }
        results.push('recovered');
      });

      queue.enqueue('recover', {}, { maxAttempts: 3 });
      queue.start();

      await vi.waitFor(() => {
        expect(results).toContain('recovered');
      }, { timeout: 10000 });
    });
  });

  describe('getStats', () => {
    it('returns queue statistics', () => {
      queue.register('stat', async () => {});
      queue.enqueue('stat', {});
      queue.enqueue('stat', {});

      const stats = queue.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(0);
    });
  });

  describe('getJob', () => {
    it('returns a job by id', () => {
      queue.register('get', async () => {});
      const id = queue.enqueue('get', { x: 1 });

      const job = queue.getJob(id);
      expect(job).toBeDefined();
      expect(job!.payload).toEqual({ x: 1 });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/job-queue/src/__tests__/queue.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the JobQueue implementation**

```typescript
// packages/job-queue/src/queue.ts
import { EventEmitter } from 'node:events';
import { JobDatabase } from './db.js';
import { NonRetryableError } from './errors.js';
import type { Job, JobOptions, JobHandler, JobContext, JobFilter, JobQueueOptions, JobQueueStats, JobEvent } from './types.js';

export class JobQueue {
  private db: JobDatabase;
  private handlers = new Map<string, JobHandler<any, any>>();
  private pollIntervalMs: number;
  private concurrency: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = new Map<string, Promise<void>>();
  private abortController = new AbortController();
  private emitter = new EventEmitter();
  private ticking = false;

  constructor(dbPath: string, options?: JobQueueOptions) {
    this.db = new JobDatabase(dbPath);
    this.pollIntervalMs = options?.pollIntervalMs ?? 2000;
    this.concurrency = options?.concurrency ?? 5;
  }

  register<T = unknown, R = unknown>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler);
  }

  enqueue(type: string, payload: unknown, options?: JobOptions): string {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for job type: ${type}`);
    }
    return this.db.insertJob({
      type,
      payload,
      priority: options?.priority ?? 0,
      maxAttempts: options?.maxAttempts ?? 3,
      scheduledAt: options?.scheduledAt ?? Date.now(),
    });
  }

  start(): void {
    const recovered = this.db.recoverCrashed();
    if (recovered > 0) {
      this.emitter.emit('recovery', recovered);
    }

    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    // Run first tick immediately
    this.tick();
  }

  async stop(timeoutMs = 30000): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.abortController.abort();

    if (this.running.size > 0) {
      const deadline = Date.now() + timeoutMs;
      while (this.running.size > 0 && Date.now() < deadline) {
        await Promise.race([
          Promise.allSettled(this.running.values()),
          new Promise(r => setTimeout(r, 100)),
        ]);
      }
    }

    this.db.close();
  }

  getJob(id: string): Job | undefined {
    return this.db.getJob(id);
  }

  listJobs(filter?: JobFilter): Job[] {
    return this.db.listJobs(filter);
  }

  getStats(): JobQueueStats {
    return this.db.getStats();
  }

  on(event: JobEvent | 'recovery', listener: (data: any) => void): void {
    this.emitter.on(event, listener);
  }

  private tick(): void {
    if (this.ticking) return;
    this.ticking = true;

    try {
      const slotsAvailable = this.concurrency - this.running.size;
      if (slotsAvailable <= 0) return;

      const jobs = this.db.pollReady(slotsAvailable);

      for (const job of jobs) {
        const promise = this.processJob(job).finally(() => {
          this.running.delete(job.id);
        });
        this.running.set(job.id, promise);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.db.failJob(job.id, `No handler for type: ${job.type}`);
      return;
    }

    this.emitter.emit('job:started', job);

    const context: JobContext = {
      jobId: job.id,
      attempt: job.attempt,
      signal: this.abortController.signal,
      checkpoint: (data: unknown) => this.db.saveCheckpoint(job.id, data),
      getCheckpoint: <T = unknown>() => this.db.getCheckpoint<T>(job.id),
    };

    try {
      const result = await handler(job.payload, context);
      this.db.completeJob(job.id, result ?? null);
      this.emitter.emit('job:completed', this.db.getJob(job.id));
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);

      if (thrown instanceof NonRetryableError) {
        this.db.killJob(job.id);
        this.emitter.emit('job:dead', this.db.getJob(job.id));
      } else {
        this.db.failJob(job.id, message);
        const updated = this.db.getJob(job.id);
        if (updated?.status === 'dead') {
          this.emitter.emit('job:dead', updated);
        } else {
          this.emitter.emit('job:failed', updated);
        }
      }
    }
  }
}
```

**Step 4: Update barrel export**

Add to `packages/job-queue/src/index.ts`:
```typescript
export { JobQueue } from './queue.js';
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/job-queue/src/__tests__/queue.test.ts`
Expected: All 13 tests PASS.

**Step 6: Commit**

```bash
git add packages/job-queue/src/queue.ts packages/job-queue/src/__tests__/queue.test.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add JobQueue with polling, retry, checkpoint, and events"
```

---

### Task 6: Integration Test

**Files:**
- Create: `packages/job-queue/src/__tests__/integration.test.ts`

**Step 1: Write the integration test**

```typescript
// packages/job-queue/src/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JobQueue } from '../queue.js';
import { JobDatabase } from '../db.js';

describe('integration: crash recovery', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `job-queue-int-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
  });

  it('recovers a job left in running state by a previous process', async () => {
    // Simulate previous process: insert a job and mark it running
    const oldDb = new JobDatabase(dbPath);
    oldDb.insertJob({ type: 'task', payload: { value: 42 }, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 1000 });
    oldDb.pollReady(1); // sets status to running
    oldDb.close(); // simulate crash — running job left behind

    // New process starts
    const results: unknown[] = [];
    const queue = new JobQueue(dbPath, { pollIntervalMs: 50, concurrency: 2 });
    queue.register<{ value: number }, void>('task', async (payload) => {
      results.push(payload.value);
    });
    queue.start(); // should recover the crashed job

    await vi.waitFor(() => {
      expect(results).toEqual([42]);
    }, { timeout: 5000 });

    await queue.stop(1000);
  });

  it('resumes from checkpoint after simulated crash', async () => {
    // First run: handler checkpoints step 1 then crashes
    const db1 = new JobDatabase(dbPath);
    const jobId = db1.insertJob({ type: 'multi-step', payload: { totalSteps: 3 }, priority: 0, maxAttempts: 3, scheduledAt: Date.now() - 1000 });
    db1.pollReady(1);
    db1.saveCheckpoint(jobId, { completedSteps: [1] });
    db1.close(); // simulate crash mid-run

    // Second run: handler reads checkpoint and continues
    const completedSteps: number[][] = [];
    const queue = new JobQueue(dbPath, { pollIntervalMs: 50, concurrency: 2 });
    queue.register<{ totalSteps: number }, void>('multi-step', async (payload, ctx) => {
      const cp = ctx.getCheckpoint<{ completedSteps: number[] }>();
      const done = cp?.completedSteps ?? [];
      for (let i = done.length + 1; i <= payload.totalSteps; i++) {
        done.push(i);
        ctx.checkpoint({ completedSteps: done });
      }
      completedSteps.push(done);
    });
    queue.start();

    await vi.waitFor(() => {
      expect(completedSteps).toHaveLength(1);
      expect(completedSteps[0]).toEqual([1, 2, 3]);
    }, { timeout: 5000 });

    await queue.stop(1000);
  });
});

describe('integration: multiple job types', () => {
  let dbPath: string;
  let queue: JobQueue;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `job-queue-multi-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    queue = new JobQueue(dbPath, { pollIntervalMs: 50, concurrency: 5 });
  });

  afterEach(async () => {
    await queue.stop(1000);
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
  });

  it('handles multiple job types concurrently', async () => {
    const log: string[] = [];

    queue.register('type-a', async (payload: { id: string }) => {
      log.push(`a:${payload.id}`);
    });
    queue.register('type-b', async (payload: { id: string }) => {
      log.push(`b:${payload.id}`);
    });

    queue.enqueue('type-a', { id: '1' });
    queue.enqueue('type-b', { id: '2' });
    queue.enqueue('type-a', { id: '3' });
    queue.start();

    await vi.waitFor(() => {
      expect(log).toHaveLength(3);
    }, { timeout: 2000 });

    expect(log).toContain('a:1');
    expect(log).toContain('b:2');
    expect(log).toContain('a:3');
  });
});
```

**Step 2: Run all job-queue tests together**

Run: `npx vitest run packages/job-queue/`
Expected: All tests PASS across all test files.

**Step 3: Commit**

```bash
git add packages/job-queue/src/__tests__/integration.test.ts
git commit -m "test(job-queue): add integration tests for crash recovery and multi-type jobs"
```

---

### Task 7: Wire into Runtime — Initialization & Gateway Endpoint

**Files:**
- Modify: `packages/runtime/package.json` — add `@auxiora/job-queue` dependency
- Modify: `packages/runtime/src/index.ts` — initialize `JobQueue`, expose via gateway

**Reference:** Read `packages/runtime/src/index.ts` to find the `initialize()` and `shutdown()` methods. The queue should be initialized early (after config load, before behaviors start).

**Step 1: Add dependency**

Add `"@auxiora/job-queue": "workspace:^"` to `packages/runtime/package.json` dependencies.

Run: `cd /home/ai-work/git/auxiora && pnpm install`

**Step 2: Add import and field**

In `packages/runtime/src/index.ts`, add import:
```typescript
import { JobQueue } from '@auxiora/job-queue';
```

Add field to the runtime class:
```typescript
private jobQueue?: JobQueue;
```

**Step 3: Initialize in `initialize()`**

After config is loaded but before behaviors start:
```typescript
const jobQueueDbPath = path.join(this.dataDir, 'jobs.db');
this.jobQueue = new JobQueue(jobQueueDbPath, {
  pollIntervalMs: 2000,
  concurrency: 5,
});
```

Call `this.jobQueue.start()` after all handlers are registered.

**Step 4: Add shutdown**

In the `shutdown()` method:
```typescript
if (this.jobQueue) {
  await this.jobQueue.stop(30000);
}
```

**Step 5: Add gateway endpoint**

```typescript
this.app.get('/api/v1/jobs/status', (_req, res) => {
  if (!this.jobQueue) {
    res.status(503).json({ error: 'Job queue not initialized' });
    return;
  }
  res.json(this.jobQueue.getStats());
});
```

**Step 6: TypeScript check**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors.

**Step 7: Commit**

```bash
git add packages/runtime/package.json packages/runtime/src/index.ts
git commit -m "feat(runtime): wire job queue initialization and status endpoint"
```

---

### Task 8: Wire Behaviors into Job Queue

**Files:**
- Modify: `packages/behaviors/package.json` — add `@auxiora/job-queue` dependency
- Modify: `packages/behaviors/src/behavior-manager.ts` — accept optional `JobQueue`, use it in `enqueueExecution()`
- Modify: `packages/runtime/src/index.ts` — register behavior handler, pass queue to BehaviorManager

**Step 1: Add dependency**

Add `"@auxiora/job-queue": "workspace:^"` to `packages/behaviors/package.json`.

Run: `pnpm install`

**Step 2: Add jobQueue option to BehaviorManagerOptions**

In `packages/behaviors/src/behavior-manager.ts`, add to `BehaviorManagerOptions`:
```typescript
jobQueue?: {
  enqueue(type: string, payload: unknown, options?: { priority?: number; maxAttempts?: number; scheduledAt?: number }): string;
};
```

Store in constructor:
```typescript
private jobQueue?: BehaviorManagerOptions['jobQueue'];
// In constructor body:
this.jobQueue = options.jobQueue;
```

**Step 3: Replace enqueueExecution**

```typescript
private enqueueExecution(behaviorId: string): void {
  if (this.jobQueue) {
    this.jobQueue.enqueue('behavior', { behaviorId }, { maxAttempts: 2 });
    return;
  }
  // Fallback: in-memory queue (for backward compat / tests without job queue)
  this.executionQueue = this.executionQueue.then(async () => {
    await this.executeWithRetry(behaviorId);
  }).catch((err) => {
    logger.error('Run queue error', { behaviorId, error: err instanceof Error ? err : new Error(String(err)) });
  });
}
```

**Step 4: Update one-shot activation for job queue**

In the `activate()` method's `one-shot` case, add a job-queue path before the setTimeout fallback:
```typescript
case 'one-shot':
  if (behavior.delay) {
    if (this.jobQueue) {
      const fireAt = new Date(behavior.delay.fireAt).getTime();
      this.jobQueue.enqueue('behavior', { behaviorId: behavior.id }, {
        maxAttempts: 2,
        scheduledAt: fireAt,
      });
      return;
    }
    // Fallback: in-memory setTimeout (existing code)
    const delayMs = new Date(behavior.delay.fireAt).getTime() - Date.now();
    // ... rest of existing code ...
  }
  break;
```

**Step 5: Register behavior handler in runtime**

In `packages/runtime/src/index.ts`, after creating the job queue and before starting it:

```typescript
this.jobQueue.register<{ behaviorId: string }, void>('behavior', async (payload) => {
  if (this.behaviorManager) {
    await this.behaviorManager.executeNow(payload.behaviorId);
  }
});
```

Pass the job queue to `BehaviorManager`:
```typescript
jobQueue: this.jobQueue,
```

**Step 6: TypeScript check and existing tests**

Run: `npx tsc --project packages/behaviors/tsconfig.json --noEmit && npx vitest run packages/behaviors/`
Expected: No errors, all existing tests PASS.

**Step 7: Commit**

```bash
git add packages/behaviors/package.json packages/behaviors/src/behavior-manager.ts packages/runtime/src/index.ts
git commit -m "feat(behaviors): wire behavior runs through durable job queue"
```

---

### Task 9: Wire ReAct Loops into Job Queue

**Files:**
- Modify: `packages/runtime/src/index.ts` — register `react-loop` handler, enqueue ReAct jobs

**Reference:** Read the runtime source to find how ReAct loops are currently started. Look for `ReActLoop` usage or `reactLoops` Map.

**Step 1: Register react-loop handler**

In the runtime initialization, after the behavior handler:

```typescript
this.jobQueue.register<{
  goal: string;
  sessionId: string;
  maxSteps?: number;
}, void>('react-loop', async (payload, ctx) => {
  const checkpoint = ctx.getCheckpoint<{ completedSteps: Array<{ type: string; content: string }> }>();
  const resumeSteps = checkpoint?.completedSteps ?? [];

  const loop = new ReActLoop({
    maxSteps: payload.maxSteps ?? 10,
    callbacks: {
      think: async (goal, history) => {
        return this.thinkForReAct(goal, history, payload.sessionId);
      },
      runTool: async (toolName, args) => {
        return this.runToolForReAct(toolName, args, payload.sessionId);
      },
      onStep: (step) => {
        const steps = [...resumeSteps, { type: step.type, content: step.content }];
        ctx.checkpoint({ completedSteps: steps });
      },
    },
  });

  await loop.run(payload.goal);
});
```

**Note:** Adapt callback names to match the actual `ReActCallbacks` interface. The key pattern: checkpoint after each step, restore from checkpoint on retry.

**Step 2: Replace inline ReAct loop creation with enqueue**

Where the runtime currently creates and runs `ReActLoop` inline, change to:
```typescript
const jobId = this.jobQueue!.enqueue('react-loop', {
  goal,
  sessionId: session.id,
  maxSteps,
});
```

**Step 3: TypeScript check**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire ReAct loops through durable job queue with checkpointing"
```

---

### Task 10: Wire Orchestration into Job Queue

**Files:**
- Modify: `packages/runtime/src/index.ts` — register `orchestration` handler

**Step 1: Register orchestration handler**

```typescript
this.jobQueue.register<{
  workflowId: string;
  pattern: string;
  tasks: Array<{ id: string; prompt: string; agent?: string }>;
  systemPrompt?: string;
}, void>('orchestration', async (payload, ctx) => {
  const checkpoint = ctx.getCheckpoint<{ completedAgents: string[] }>();
  const completedAgents = new Set(checkpoint?.completedAgents ?? []);

  const remainingTasks = payload.tasks.filter(t => !completedAgents.has(t.id));
  if (remainingTasks.length === 0) return;

  const workflow = {
    id: payload.workflowId,
    pattern: payload.pattern,
    tasks: remainingTasks,
    systemPrompt: payload.systemPrompt,
  };

  const engine = this.orchestrationEngine;
  if (!engine) throw new NonRetryableError('Orchestration engine not initialized');

  for await (const event of engine.run(workflow)) {
    if (event.type === 'agent_completed') {
      completedAgents.add(event.taskId);
      ctx.checkpoint({ completedAgents: [...completedAgents] });
    }
  }
});
```

**Note:** Adapt the workflow construction and `engine.run()` call to match the actual `OrchestrationEngine` API (it uses `execute()` as an AsyncGenerator). The key: checkpoint after each agent completion, skip completed agents on retry.

**Step 2: Where orchestration is started inline, change to enqueue**

```typescript
const jobId = this.jobQueue!.enqueue('orchestration', {
  workflowId: workflow.id,
  pattern: workflow.pattern,
  tasks: workflow.tasks,
  systemPrompt: workflow.systemPrompt,
});
```

**Step 3: TypeScript check**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire orchestration through durable job queue"
```

---

### Task 11: Wire Ambient Pattern Persistence

**Files:**
- Modify: `packages/runtime/src/index.ts` — register `ambient-flush` handler, enqueue recurring flush

**Step 1: Register ambient flush handler**

```typescript
this.jobQueue.register<Record<string, never>, void>('ambient-flush', async (_payload, ctx) => {
  if (this.ambientPatternEngine) {
    const serialized = this.ambientPatternEngine.serialize();
    ctx.checkpoint(serialized);
  }
  // Re-enqueue for next flush (5 minutes from now)
  this.jobQueue!.enqueue('ambient-flush', {}, { scheduledAt: Date.now() + 5 * 60 * 1000 });
});
```

**Step 2: Enqueue first flush on startup and restore state**

After ambient pattern engine initialization:
```typescript
this.jobQueue.enqueue('ambient-flush', {}, { scheduledAt: Date.now() + 5 * 60 * 1000 });
```

**Step 3: TypeScript check**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire ambient pattern persistence through job queue"
```

---

### Task 12: Full Build & Test Verification

**Step 1: Run all job-queue tests**

Run: `npx vitest run packages/job-queue/`
Expected: All tests PASS.

**Step 2: Run full workspace build**

Run: `pnpm -r build`
Expected: No errors.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (existing + new).

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: adjust tests for job queue integration"
```
