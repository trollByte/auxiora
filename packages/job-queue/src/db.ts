import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import type { Job, JobStatus, JobFilter, JobQueueStats } from './types.js';

export interface InsertJobInput {
  type: string;
  payload: unknown;
  priority: number;
  maxAttempts: number;
  scheduledAt: number;
}

const ALLOWED_TIMESTAMP_COLUMNS = new Set([
  'scheduled_at',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
]);

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
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT NOT NULL,
        result TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        scheduled_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs(status, scheduled_at, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type, status);

      CREATE TABLE IF NOT EXISTS job_checkpoints (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  insertJob(input: InsertJobInput): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO jobs (id, type, status, payload, priority, max_attempts, scheduled_at, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.type, JSON.stringify(input.payload), input.priority, input.maxAttempts, input.scheduledAt, now, now);
    return id;
  }

  getJob(id: string): Job | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToJob(row) : undefined;
  }

  pollReady(limit: number): Job[] {
    const now = Date.now();
    const rows = this.db.prepare(
      `SELECT * FROM jobs
       WHERE status = 'pending' AND scheduled_at <= ?
       ORDER BY priority DESC, scheduled_at ASC
       LIMIT ?`,
    ).all(now, limit) as Record<string, unknown>[];

    const jobs: Job[] = [];
    for (const row of rows) {
      const id = row.id as string;
      this.db.prepare(
        `UPDATE jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?`,
      ).run(now, now, id);
      jobs.push(this.rowToJob({ ...row, status: 'running', started_at: now, updated_at: now }));
    }
    return jobs;
  }

  completeJob(id: string, result: unknown): void {
    const now = Date.now();
    this.db.prepare(
      `UPDATE jobs SET status = 'completed', result = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(result), now, now, id);
  }

  failJob(id: string, errorMsg: string): void {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return;

    const now = Date.now();
    const nextAttempt = (row.attempt as number) + 1;
    const maxAttempts = row.max_attempts as number;

    if (nextAttempt >= maxAttempts) {
      this.db.prepare(
        `UPDATE jobs SET status = 'dead', result = ?, attempt = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      ).run(JSON.stringify(errorMsg), nextAttempt, now, now, id);
    } else {
      const backoff = Math.pow(2, nextAttempt) * 1000;
      const nextScheduledAt = now + backoff;
      this.db.prepare(
        `UPDATE jobs SET status = 'pending', result = ?, attempt = ?, scheduled_at = ?, started_at = NULL, updated_at = ? WHERE id = ?`,
      ).run(JSON.stringify(errorMsg), nextAttempt, nextScheduledAt, now, id);
    }
  }

  killJob(id: string): void {
    const now = Date.now();
    this.db.prepare(
      `UPDATE jobs SET status = 'dead', completed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, id);
  }

  recoverCrashed(): number {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'running'`,
    ).all() as Record<string, unknown>[];

    const now = Date.now();
    let count = 0;

    for (const row of rows) {
      const id = row.id as string;
      const nextAttempt = (row.attempt as number) + 1;
      const maxAttempts = row.max_attempts as number;

      if (nextAttempt >= maxAttempts) {
        this.db.prepare(
          `UPDATE jobs SET status = 'dead', completed_at = ?, updated_at = ? WHERE id = ?`,
        ).run(now, now, id);
      } else {
        this.db.prepare(
          `UPDATE jobs SET status = 'pending', attempt = ?, started_at = NULL, updated_at = ? WHERE id = ?`,
        ).run(nextAttempt, now, id);
      }
      count++;
    }

    return count;
  }

  saveCheckpoint(jobId: string, data: unknown): void {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO job_checkpoints (job_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(jobId, JSON.stringify(data), now);
  }

  getCheckpoint<T = unknown>(jobId: string): T | undefined {
    const row = this.db.prepare(
      'SELECT data FROM job_checkpoints WHERE job_id = ?',
    ).get(jobId) as Record<string, unknown> | undefined;
    return row ? JSON.parse(row.data as string) as T : undefined;
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 100;
    params.push(limit);

    const rows = this.db.prepare(
      `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT ?`,
    ).all(...(params as Array<string | number>)) as Record<string, unknown>[];

    return rows.map(r => this.rowToJob(r));
  }

  getStats(): JobQueueStats {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    const pending = (this.db.prepare(
      `SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'`,
    ).get() as Record<string, number>).count;

    const running = (this.db.prepare(
      `SELECT COUNT(*) as count FROM jobs WHERE status = 'running'`,
    ).get() as Record<string, number>).count;

    const completed24h = (this.db.prepare(
      `SELECT COUNT(*) as count FROM jobs WHERE status = 'completed' AND completed_at >= ?`,
    ).get(twentyFourHoursAgo) as Record<string, number>).count;

    const failed24h = (this.db.prepare(
      `SELECT COUNT(*) as count FROM jobs WHERE status = 'failed' AND completed_at >= ?`,
    ).get(twentyFourHoursAgo) as Record<string, number>).count;

    const dead = (this.db.prepare(
      `SELECT COUNT(*) as count FROM jobs WHERE status = 'dead'`,
    ).get() as Record<string, number>).count;

    return { pending, running, completed24h, failed24h, dead };
  }

  cleanupOld(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db.prepare(
      `DELETE FROM jobs WHERE status IN ('completed', 'dead') AND completed_at < ?`,
    ).run(cutoff);
    return Number(result.changes);
  }

  /** Test helper: force a timestamp column to a specific value. */
  forceTimestamp(id: string, column: string, value: number): void {
    if (!ALLOWED_TIMESTAMP_COLUMNS.has(column)) {
      throw new Error(`Column "${column}" is not an allowed timestamp column`);
    }
    // Column name is validated against whitelist above, safe to interpolate
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
      payload: row.payload ? JSON.parse(row.payload as string) : undefined,
      result: row.result != null ? JSON.parse(row.result as string) : undefined,
      priority: row.priority as number,
      attempt: row.attempt as number,
      maxAttempts: row.max_attempts as number,
      scheduledAt: row.scheduled_at as number,
      startedAt: (row.started_at as number | null) ?? undefined,
      completedAt: (row.completed_at as number | null) ?? undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
