import { EventEmitter } from 'node:events';
import { JobDatabase } from './db.js';
import { NonRetryableError } from './errors.js';
import type { Job, JobOptions, JobHandler, JobContext, JobFilter, JobQueueOptions, JobQueueStats, JobEvent } from './types.js';

export class JobQueue {
  private db: JobDatabase;
  private handlers = new Map<string, JobHandler<unknown, unknown>>();
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

  register<T, R>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler as JobHandler<unknown, unknown>);
  }

  enqueue(type: string, payload: unknown, options?: JobOptions): string {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for job type "${type}"`);
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
      this.emitter.emit('recovery', { count: recovered });
    }

    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    this.tick();
  }

  async stop(timeoutMs = 30_000): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.abortController.abort();

    const runningPromises = [...this.running.values()];
    if (runningPromises.length > 0) {
      await Promise.race([
        Promise.allSettled(runningPromises),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
      ]);
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

  purgeByType(type: string, status: 'pending' | 'dead'): number {
    return this.db.purgeByType(type, status);
  }

  on(event: JobEvent | 'recovery', listener: (data: unknown) => void): void {
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
      this.db.killJob(job.id);
      this.emitter.emit('job:dead', { job: this.db.getJob(job.id)!, reason: `No handler for type "${job.type}"` });
      return;
    }

    this.emitter.emit('job:started', { job });

    const context: JobContext = {
      jobId: job.id,
      attempt: job.attempt,
      signal: this.abortController.signal,
      checkpoint: (data: unknown) => this.db.saveCheckpoint(job.id, data),
      getCheckpoint: <T = unknown>() => this.db.getCheckpoint<T>(job.id),
    };

    try {
      const result = await handler(job.payload, context);
      this.db.completeJob(job.id, result);
      this.emitter.emit('job:completed', { job: this.db.getJob(job.id)!, result });
    } catch (error) {
      if (error instanceof NonRetryableError) {
        this.db.killJob(job.id);
        this.emitter.emit('job:dead', { job: this.db.getJob(job.id)!, error });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.db.failJob(job.id, message);
        const updated = this.db.getJob(job.id)!;
        if (updated.status === 'dead') {
          this.emitter.emit('job:dead', { job: updated, error });
        } else {
          this.emitter.emit('job:failed', { job: updated, error });
        }
      }
    }
  }
}
