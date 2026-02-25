import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JobQueue } from '../queue.js';
import { NonRetryableError } from '../errors.js';
import type { JobContext } from '../types.js';

function makeDbPath(): string {
  const dir = path.join(os.tmpdir(), `auxiora-queue-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'jobs.db');
}

function cleanup(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('JobQueue', () => {
  let queue: JobQueue;
  let dbPath: string;

  afterEach(async () => {
    try {
      await queue.stop(2000);
    } catch {
      // already stopped
    }
    cleanup(dbPath);
  });

  function createQueue(opts?: { pollIntervalMs?: number; concurrency?: number }): JobQueue {
    dbPath = makeDbPath();
    queue = new JobQueue(dbPath, { pollIntervalMs: 50, concurrency: 2, ...opts });
    return queue;
  }

  describe('register and enqueue', () => {
    it('handler runs for enqueued job', async () => {
      const q = createQueue();
      const results: unknown[] = [];

      q.register('greet', async (payload: { name: string }) => {
        results.push(payload.name);
        return `hello ${payload.name}`;
      });

      const id = q.enqueue('greet', { name: 'world' });
      expect(id).toBeDefined();

      q.start();

      await vi.waitFor(() => {
        const job = q.getJob(id);
        expect(job?.status).toBe('completed');
      }, { timeout: 3000 });

      expect(results).toEqual(['world']);
      const job = q.getJob(id);
      expect(job?.result).toBe('hello world');
    });

    it('throws on unregistered type', () => {
      const q = createQueue();
      expect(() => q.enqueue('unknown', {})).toThrow();
    });
  });

  describe('scheduling', () => {
    it('job delayed until scheduledAt', async () => {
      const q = createQueue();
      q.register('delayed', async () => 'done');

      const scheduledAt = Date.now() + 500;
      const id = q.enqueue('delayed', {}, { scheduledAt });
      q.start();

      // Should still be pending immediately
      const jobEarly = q.getJob(id);
      expect(jobEarly?.status).toBe('pending');

      await vi.waitFor(() => {
        const job = q.getJob(id);
        expect(job?.status).toBe('completed');
      }, { timeout: 3000 });
    });
  });

  describe('priority', () => {
    it('higher priority jobs processed first', async () => {
      const q = createQueue({ concurrency: 1 });
      const order: string[] = [];

      q.register('ordered', async (payload: { label: string }) => {
        order.push(payload.label);
      });

      q.enqueue('ordered', { label: 'low' }, { priority: 1 });
      q.enqueue('ordered', { label: 'high' }, { priority: 10 });
      q.enqueue('ordered', { label: 'mid' }, { priority: 5 });

      q.start();

      await vi.waitFor(() => {
        expect(order).toHaveLength(3);
      }, { timeout: 3000 });

      expect(order).toEqual(['high', 'mid', 'low']);
    });
  });

  describe('retry on failure', () => {
    it('failing job retries up to maxAttempts, then succeeds', { timeout: 15000 }, async () => {
      const q = createQueue();
      let callCount = 0;

      q.register('flaky', async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('transient');
        }
        return 'ok';
      });

      const id = q.enqueue('flaky', {}, { maxAttempts: 5 });
      q.start();

      await vi.waitFor(() => {
        const job = q.getJob(id);
        expect(job?.status).toBe('completed');
      }, { timeout: 10000 });

      expect(callCount).toBe(3);
    });
  });

  describe('NonRetryableError', () => {
    it('skips retries, goes straight to dead', async () => {
      const q = createQueue();
      let callCount = 0;

      q.register('fatal', async () => {
        callCount++;
        throw new NonRetryableError('permanent failure');
      });

      const id = q.enqueue('fatal', {}, { maxAttempts: 5 });
      q.start();

      await vi.waitFor(() => {
        const job = q.getJob(id);
        expect(job?.status).toBe('dead');
      }, { timeout: 3000 });

      expect(callCount).toBe(1);
    });
  });

  describe('concurrency', () => {
    it('runs up to N jobs in parallel, not more', { timeout: 15000 }, async () => {
      const q = createQueue({ concurrency: 2 });
      let concurrent = 0;
      let maxConcurrent = 0;
      let completedCount = 0;

      q.register('slow', async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 100));
        concurrent--;
        completedCount++;
        return 'done';
      });

      for (let i = 0; i < 6; i++) {
        q.enqueue('slow', { i });
      }

      q.start();

      await vi.waitFor(() => {
        expect(completedCount).toBe(6);
      }, { timeout: 10000 });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(maxConcurrent).toBeGreaterThanOrEqual(1);
    });
  });

  describe('events', () => {
    it('emits job:started and job:completed', async () => {
      const q = createQueue();
      const events: string[] = [];

      q.register('evented', async () => 'result');

      q.on('job:started', () => events.push('started'));
      q.on('job:completed', () => events.push('completed'));

      const id = q.enqueue('evented', {});
      q.start();

      await vi.waitFor(() => {
        expect(events).toContain('completed');
      }, { timeout: 3000 });

      expect(events).toContain('started');
      expect(events).toContain('completed');
    });

    it('emits job:dead on NonRetryableError', async () => {
      const q = createQueue();
      const deadJobs: string[] = [];

      q.register('doomed', async () => {
        throw new NonRetryableError('nope');
      });

      q.on('job:dead', (data: unknown) => deadJobs.push((data as { job: { id: string } }).job.id));

      const id = q.enqueue('doomed', {});
      q.start();

      await vi.waitFor(() => {
        expect(deadJobs).toContain(id);
      }, { timeout: 3000 });
    });
  });

  describe('checkpoint', () => {
    it('handler writes checkpoint, on retry reads it back', async () => {
      const q = createQueue();
      let callCount = 0;
      const checkpointValues: unknown[] = [];

      q.register('checkpointed', async (_payload: unknown, ctx: JobContext) => {
        callCount++;
        const prev = ctx.getCheckpoint<{ step: number }>();
        checkpointValues.push(prev);

        if (callCount === 1) {
          ctx.checkpoint({ step: 1 });
          throw new Error('retry me');
        }
        return 'done';
      });

      const id = q.enqueue('checkpointed', {}, { maxAttempts: 3 });
      q.start();

      await vi.waitFor(() => {
        const job = q.getJob(id);
        expect(job?.status).toBe('completed');
      }, { timeout: 10000 });

      expect(callCount).toBe(2);
      expect(checkpointValues[0]).toBeUndefined();
      expect(checkpointValues[1]).toEqual({ step: 1 });
    });
  });

  describe('graceful shutdown', () => {
    it('stop() waits for running jobs to complete', async () => {
      const q = createQueue({ concurrency: 1 });
      let finished = false;

      q.register('longish', async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        finished = true;
        return 'done';
      });

      q.enqueue('longish', {});
      q.start();

      // Give tick time to pick up the job
      await new Promise(resolve => setTimeout(resolve, 100));

      await q.stop(5000);
      expect(finished).toBe(true);
    });
  });

  describe('crash recovery', () => {
    it('first attempt throws, retry succeeds', async () => {
      const q = createQueue();
      let callCount = 0;

      q.register('recoverable', async () => {
        callCount++;
        if (callCount === 1) throw new Error('crash');
        return 'recovered';
      });

      const id = q.enqueue('recoverable', {}, { maxAttempts: 3 });
      q.start();

      await vi.waitFor(() => {
        const job = q.getJob(id);
        expect(job?.status).toBe('completed');
      }, { timeout: 10000 });

      expect(callCount).toBe(2);
      expect(q.getJob(id)?.result).toBe('recovered');
    });
  });

  describe('getStats', () => {
    it('returns pending/running counts', () => {
      const q = createQueue();
      q.register('stat-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
      });

      q.enqueue('stat-test', {});
      q.enqueue('stat-test', {});

      const stats = q.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(0);
    });
  });

  describe('getJob', () => {
    it('returns job by id', () => {
      const q = createQueue();
      q.register('lookup', async () => 'ok');

      const id = q.enqueue('lookup', { data: 123 });
      const job = q.getJob(id);

      expect(job).toBeDefined();
      expect(job?.id).toBe(id);
      expect(job?.type).toBe('lookup');
      expect(job?.payload).toEqual({ data: 123 });
      expect(job?.status).toBe('pending');
    });

    it('returns undefined for non-existent id', () => {
      const q = createQueue();
      expect(q.getJob('nonexistent')).toBeUndefined();
    });
  });
});
