import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JobDatabase } from '../db.js';
import type { Job } from '../types.js';

function makeDbPath(): string {
  const dir = path.join(os.tmpdir(), `auxiora-jobdb-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'jobs.db');
}

function cleanup(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('JobDatabase', () => {
  let db: JobDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeDbPath();
    db = new JobDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    cleanup(dbPath);
  });

  describe('insertJob', () => {
    it('inserts a job and returns it by id with correct fields', () => {
      const now = Date.now();
      const id = db.insertJob({
        type: 'email',
        payload: { to: 'a@b.com' },
        priority: 5,
        maxAttempts: 3,
        scheduledAt: now,
      });

      expect(id).toBeDefined();
      const job = db.getJob(id);
      expect(job).toBeDefined();
      expect(job!.type).toBe('email');
      expect(job!.status).toBe('pending');
      expect(job!.attempt).toBe(0);
      expect(job!.priority).toBe(5);
      expect(job!.maxAttempts).toBe(3);
      expect(job!.scheduledAt).toBe(now);
      expect(job!.payload).toEqual({ to: 'a@b.com' });
      expect(job!.result).toBeUndefined();
      expect(job!.startedAt).toBeUndefined();
      expect(job!.completedAt).toBeUndefined();
      expect(job!.createdAt).toBeGreaterThan(0);
      expect(job!.updatedAt).toBeGreaterThan(0);
    });

    it('returns undefined for a non-existent job id', () => {
      expect(db.getJob('non-existent')).toBeUndefined();
    });
  });

  describe('pollReady', () => {
    it('returns pending jobs whose scheduledAt has passed', () => {
      const past = Date.now() - 10_000;
      const future = Date.now() + 60_000;
      db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'b', payload: null, priority: 0, maxAttempts: 1, scheduledAt: future });

      const ready = db.pollReady(10);
      expect(ready).toHaveLength(1);
      expect(ready[0].type).toBe('a');
    });

    it('respects limit', () => {
      const past = Date.now() - 10_000;
      db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'b', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'c', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      const ready = db.pollReady(2);
      expect(ready).toHaveLength(2);
    });

    it('picks higher priority first', () => {
      const past = Date.now() - 10_000;
      db.insertJob({ type: 'low', payload: null, priority: 1, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'high', payload: null, priority: 10, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'mid', payload: null, priority: 5, maxAttempts: 1, scheduledAt: past });

      const ready = db.pollReady(10);
      expect(ready[0].type).toBe('high');
      expect(ready[1].type).toBe('mid');
      expect(ready[2].type).toBe('low');
    });

    it('sets polled jobs to running status', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      db.pollReady(10);
      const job = db.getJob(id);
      expect(job!.status).toBe('running');
      expect(job!.startedAt).toBeGreaterThan(0);
    });

    it('does not return already running jobs', () => {
      const past = Date.now() - 10_000;
      db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      db.pollReady(10);
      const second = db.pollReady(10);
      expect(second).toHaveLength(0);
    });
  });

  describe('completeJob', () => {
    it('sets status to completed with result and completedAt', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);

      db.completeJob(id, { output: 42 });
      const job = db.getJob(id);
      expect(job!.status).toBe('completed');
      expect(job!.result).toEqual({ output: 42 });
      expect(job!.completedAt).toBeGreaterThan(0);
    });
  });

  describe('failJob', () => {
    it('resets to pending with incremented attempt when retries remain', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });
      db.pollReady(1);

      db.failJob(id, 'connection timeout');
      const job = db.getJob(id);
      expect(job!.status).toBe('pending');
      expect(job!.attempt).toBe(1);
      // Backoff: scheduledAt should be in the future
      expect(job!.scheduledAt).toBeGreaterThan(Date.now() - 1000);
    });

    it('marks as dead when attempts exhausted', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);

      db.failJob(id, 'fatal error');
      const job = db.getJob(id);
      expect(job!.status).toBe('dead');
      expect(job!.completedAt).toBeGreaterThan(0);
    });

    it('applies exponential backoff to scheduledAt', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 5, scheduledAt: past });
      db.pollReady(1);

      const beforeFail = Date.now();
      db.failJob(id, 'err');
      const job = db.getJob(id);
      // attempt becomes 1, backoff = 2^1 * 1000 = 2000ms
      expect(job!.scheduledAt).toBeGreaterThanOrEqual(beforeFail + 2000 - 100);
    });
  });

  describe('killJob', () => {
    it('marks a pending job as dead', () => {
      const future = Date.now() + 60_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 3, scheduledAt: future });

      db.killJob(id);
      const job = db.getJob(id);
      expect(job!.status).toBe('dead');
      expect(job!.completedAt).toBeGreaterThan(0);
    });
  });

  describe('recoverCrashed', () => {
    it('resets running jobs to pending with incremented attempt', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });
      db.pollReady(1);

      const count = db.recoverCrashed();
      expect(count).toBe(1);
      const job = db.getJob(id);
      expect(job!.status).toBe('pending');
      expect(job!.attempt).toBe(1);
    });

    it('marks as dead if recovery would exceed max attempts', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);

      const count = db.recoverCrashed();
      expect(count).toBe(1);
      const job = db.getJob(id);
      expect(job!.status).toBe('dead');
    });

    it('returns 0 when no running jobs exist', () => {
      expect(db.recoverCrashed()).toBe(0);
    });
  });

  describe('checkpoint', () => {
    it('saves and retrieves checkpoint data', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      db.saveCheckpoint(id, { step: 3, partial: [1, 2, 3] });
      const cp = db.getCheckpoint<{ step: number; partial: number[] }>(id);
      expect(cp).toEqual({ step: 3, partial: [1, 2, 3] });
    });

    it('overwrites previous checkpoint', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      db.saveCheckpoint(id, { step: 1 });
      db.saveCheckpoint(id, { step: 5 });
      const cp = db.getCheckpoint<{ step: number }>(id);
      expect(cp).toEqual({ step: 5 });
    });

    it('returns undefined when no checkpoint exists', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'task', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      expect(db.getCheckpoint(id)).toBeUndefined();
    });
  });

  describe('listJobs', () => {
    it('filters by type', () => {
      const past = Date.now() - 10_000;
      db.insertJob({ type: 'email', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'sms', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      const emailJobs = db.listJobs({ type: 'email' });
      expect(emailJobs).toHaveLength(1);
      expect(emailJobs[0].type).toBe('email');
    });

    it('filters by status', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'b', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1); // marks first ready job as running

      const running = db.listJobs({ status: 'running' });
      expect(running).toHaveLength(1);
    });

    it('respects limit', () => {
      const past = Date.now() - 10_000;
      for (let i = 0; i < 5; i++) {
        db.insertJob({ type: 'bulk', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      }

      const limited = db.listJobs({ limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('returns all jobs when no filter is given', () => {
      const past = Date.now() - 10_000;
      db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.insertJob({ type: 'b', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });

      const all = db.listJobs();
      expect(all).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('returns counts by status', () => {
      const past = Date.now() - 10_000;

      // Create and poll a job to make it running
      const runId = db.insertJob({ type: 'run', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });
      db.pollReady(1);

      // Create and complete a job
      const compId = db.insertJob({ type: 'comp', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });
      db.pollReady(1);
      db.completeJob(compId, null);

      // Create and kill a job to make it dead
      const deadId = db.insertJob({ type: 'dead', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);
      db.failJob(deadId, 'dead');

      // Add 2 pending jobs last so they stay pending
      db.insertJob({ type: 'pend1', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });
      db.insertJob({ type: 'pend2', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });

      const stats = db.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.completed24h).toBeGreaterThanOrEqual(1);
      expect(stats.dead).toBe(1);
    });
  });

  describe('cleanupOld', () => {
    it('deletes completed and dead jobs older than cutoff', () => {
      const past = Date.now() - 10_000;
      const id1 = db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);
      db.completeJob(id1, null);

      // Force the completedAt to be old
      db.forceTimestamp(id1, 'completed_at', Date.now() - 90_000);

      const id2 = db.insertJob({ type: 'b', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);
      db.completeJob(id2, null);
      // id2 has recent completedAt

      // Cleanup jobs older than 60s
      const deleted = db.cleanupOld(60_000);
      expect(deleted).toBe(1);

      expect(db.getJob(id1)).toBeUndefined();
      expect(db.getJob(id2)).toBeDefined();
    });

    it('also deletes old dead jobs', () => {
      const past = Date.now() - 10_000;
      const id = db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 1, scheduledAt: past });
      db.pollReady(1);
      db.failJob(id, 'err'); // becomes dead

      db.forceTimestamp(id, 'completed_at', Date.now() - 90_000);

      const deleted = db.cleanupOld(60_000);
      expect(deleted).toBe(1);
      expect(db.getJob(id)).toBeUndefined();
    });

    it('does not delete pending or running jobs', () => {
      const past = Date.now() - 10_000;
      db.insertJob({ type: 'a', payload: null, priority: 0, maxAttempts: 3, scheduledAt: past });

      const deleted = db.cleanupOld(0);
      expect(deleted).toBe(0);
    });
  });
});
