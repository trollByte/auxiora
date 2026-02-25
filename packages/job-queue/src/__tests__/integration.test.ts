import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JobQueue } from '../queue.js';
import { JobDatabase } from '../db.js';
import type { JobContext } from '../types.js';

function makeDbPath(): string {
  const dir = path.join(os.tmpdir(), `auxiora-integ-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'jobs.db');
}

function cleanup(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('integration', () => {
  let dbPath: string;
  let queue: JobQueue | undefined;

  afterEach(async () => {
    if (queue) {
      try {
        await queue.stop(2000);
      } catch {
        // already stopped
      }
      queue = undefined;
    }
    if (dbPath) cleanup(dbPath);
  });

  it('recovers a job left in running state by a previous process', async () => {
    dbPath = makeDbPath();

    // Simulate process 1: insert job, poll it to running, then crash (close DB)
    const db1 = new JobDatabase(dbPath);
    db1.insertJob({
      type: 'email',
      payload: { to: 'test@example.com' },
      priority: 0,
      maxAttempts: 3,
      scheduledAt: Date.now(),
    });
    const polled = db1.pollReady(1);
    expect(polled).toHaveLength(1);
    expect(polled[0].status).toBe('running');
    db1.close();

    // Simulate process 2: new JobQueue picks up the crashed job
    const received: unknown[] = [];
    queue = new JobQueue(dbPath, { pollIntervalMs: 50 });
    queue.register<{ to: string }, string>('email', async (payload) => {
      received.push(payload);
      return 'sent';
    });
    queue.start();

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    }, { timeout: 2000 });

    expect(received[0]).toEqual({ to: 'test@example.com' });
  });

  it('resumes from checkpoint after simulated crash', async () => {
    dbPath = makeDbPath();

    // Process 1: insert job, poll to running, save checkpoint at step 2, crash
    const db1 = new JobDatabase(dbPath);
    const jobId = db1.insertJob({
      type: 'batch',
      payload: { steps: ['a', 'b', 'c', 'd'] },
      priority: 0,
      maxAttempts: 3,
      scheduledAt: Date.now(),
    });
    db1.pollReady(1);
    db1.saveCheckpoint(jobId, { completedSteps: ['a', 'b'] });
    db1.close();

    // Process 2: handler reads checkpoint and continues
    const executedSteps: string[] = [];
    queue = new JobQueue(dbPath, { pollIntervalMs: 50 });
    queue.register<{ steps: string[] }, string>('batch', async (payload, ctx: JobContext) => {
      const checkpoint = ctx.getCheckpoint<{ completedSteps: string[] }>();
      const alreadyDone = new Set(checkpoint?.completedSteps ?? []);
      for (const step of payload.steps) {
        if (!alreadyDone.has(step)) {
          executedSteps.push(step);
        }
      }
      return 'done';
    });
    queue.start();

    await vi.waitFor(() => {
      expect(executedSteps.length).toBeGreaterThan(0);
    }, { timeout: 2000 });

    // Only steps c and d should have been executed (a and b were checkpointed)
    expect(executedSteps).toEqual(['c', 'd']);
  });

  it('runs multiple job types concurrently', async () => {
    dbPath = makeDbPath();
    queue = new JobQueue(dbPath, { pollIntervalMs: 50, concurrency: 5 });

    const aCalls: unknown[] = [];
    const bCalls: unknown[] = [];

    queue.register<{ idx: number }, string>('type-a', async (payload) => {
      aCalls.push(payload);
      return 'a-done';
    });
    queue.register<{ idx: number }, string>('type-b', async (payload) => {
      bCalls.push(payload);
      return 'b-done';
    });

    queue.enqueue('type-a', { idx: 1 });
    queue.enqueue('type-b', { idx: 2 });
    queue.enqueue('type-a', { idx: 3 });

    queue.start();

    await vi.waitFor(() => {
      expect(aCalls.length + bCalls.length).toBe(3);
    }, { timeout: 2000 });

    expect(aCalls).toHaveLength(2);
    expect(bCalls).toHaveLength(1);
    expect(aCalls.map((c: unknown) => (c as { idx: number }).idx).sort()).toEqual([1, 3]);
    expect(bCalls[0]).toEqual({ idx: 2 });

    // Verify all jobs completed
    const stats = queue.getStats();
    expect(stats.pending).toBe(0);
    expect(stats.running).toBe(0);
  });
});
