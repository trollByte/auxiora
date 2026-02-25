import { describe, it, expect, beforeEach } from 'vitest';
import { DeadLetterMonitor } from '../dead-letter.js';
import type { Job } from '../types.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: overrides.id ?? 'job-1',
    type: overrides.type ?? 'email',
    status: overrides.status ?? 'dead',
    payload: overrides.payload ?? { to: 'user@example.com' },
    result: overrides.result ?? undefined,
    priority: overrides.priority ?? 0,
    attempt: overrides.attempt ?? 3,
    maxAttempts: overrides.maxAttempts ?? 3,
    scheduledAt: overrides.scheduledAt ?? 1000,
    startedAt: overrides.startedAt ?? undefined,
    completedAt: overrides.completedAt ?? undefined,
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 2000,
  };
}

describe('DeadLetterMonitor', () => {
  let monitor: DeadLetterMonitor;

  beforeEach(() => {
    monitor = new DeadLetterMonitor();
  });

  it('starts empty', () => {
    expect(monitor.size).toBe(0);
    expect(monitor.list()).toEqual([]);
  });

  it('add() stores a dead job entry', () => {
    const job = makeJob();
    monitor.add(job, 'max retries exceeded');

    expect(monitor.size).toBe(1);
    const entry = monitor.get('job-1');
    expect(entry).toBeDefined();
    expect(entry!.job.id).toBe('job-1');
    expect(entry!.reason).toBe('max retries exceeded');
    expect(entry!.retryCount).toBe(0);
    expect(entry!.diedAt).toBeGreaterThan(0);
  });

  it('get() retrieves by jobId', () => {
    monitor.add(makeJob({ id: 'abc' }), 'failed');
    const entry = monitor.get('abc');
    expect(entry).toBeDefined();
    expect(entry!.job.id).toBe('abc');
  });

  it('get() returns undefined for unknown id', () => {
    expect(monitor.get('nonexistent')).toBeUndefined();
  });

  it('list() returns all entries', () => {
    monitor.add(makeJob({ id: 'j1' }), 'reason1');
    monitor.add(makeJob({ id: 'j2' }), 'reason2');
    monitor.add(makeJob({ id: 'j3' }), 'reason3');

    const entries = monitor.list();
    expect(entries).toHaveLength(3);
    const ids = entries.map(e => e.job.id);
    expect(ids).toContain('j1');
    expect(ids).toContain('j2');
    expect(ids).toContain('j3');
  });

  it('list() filters by type', () => {
    monitor.add(makeJob({ id: 'j1', type: 'email' }), 'failed');
    monitor.add(makeJob({ id: 'j2', type: 'sms' }), 'failed');
    monitor.add(makeJob({ id: 'j3', type: 'email' }), 'failed');

    const emailEntries = monitor.list('email');
    expect(emailEntries).toHaveLength(2);
    expect(emailEntries.every(e => e.job.type === 'email')).toBe(true);

    const smsEntries = monitor.list('sms');
    expect(smsEntries).toHaveLength(1);
    expect(smsEntries[0]!.job.type).toBe('sms');
  });

  it('remove() deletes an entry', () => {
    monitor.add(makeJob({ id: 'j1' }), 'failed');
    expect(monitor.size).toBe(1);

    const removed = monitor.remove('j1');
    expect(removed).toBe(true);
    expect(monitor.size).toBe(0);
    expect(monitor.get('j1')).toBeUndefined();
  });

  it('remove() returns false for unknown id', () => {
    expect(monitor.remove('nonexistent')).toBe(false);
  });

  it('markRetried() increments retry counter', () => {
    monitor.add(makeJob({ id: 'j1' }), 'failed');
    expect(monitor.get('j1')!.retryCount).toBe(0);

    monitor.markRetried('j1');
    expect(monitor.get('j1')!.retryCount).toBe(1);

    monitor.markRetried('j1');
    expect(monitor.get('j1')!.retryCount).toBe(2);
  });

  it('markRetried() is a no-op for unknown id', () => {
    // Should not throw
    monitor.markRetried('nonexistent');
  });

  it('getStats() returns correct breakdown', () => {
    monitor.add(makeJob({ id: 'j1', type: 'email' }), 'failed');
    monitor.add(makeJob({ id: 'j2', type: 'email' }), 'failed');
    monitor.add(makeJob({ id: 'j3', type: 'sms' }), 'timeout');

    const stats = monitor.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType).toEqual({ email: 2, sms: 1 });
    expect(stats.oldestAt).toBeGreaterThan(0);
    expect(stats.newestAt).toBeGreaterThanOrEqual(stats.oldestAt);
  });

  it('getStats() returns zeros when empty', () => {
    const stats = monitor.getStats();
    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({});
    expect(stats.oldestAt).toBe(0);
    expect(stats.newestAt).toBe(0);
  });

  it('enforces maxEntries limit by evicting oldest', () => {
    const small = new DeadLetterMonitor(3);

    // Add 3 entries with controlled diedAt via sequential adds
    small.add(makeJob({ id: 'j1' }), 'r1');
    small.add(makeJob({ id: 'j2' }), 'r2');
    small.add(makeJob({ id: 'j3' }), 'r3');
    expect(small.size).toBe(3);

    // Adding a 4th should evict the oldest (j1)
    small.add(makeJob({ id: 'j4' }), 'r4');
    expect(small.size).toBe(3);
    expect(small.get('j1')).toBeUndefined();
    expect(small.get('j4')).toBeDefined();
  });

  it('clear() removes all entries', () => {
    monitor.add(makeJob({ id: 'j1' }), 'r1');
    monitor.add(makeJob({ id: 'j2' }), 'r2');
    expect(monitor.size).toBe(2);

    monitor.clear();
    expect(monitor.size).toBe(0);
    expect(monitor.list()).toEqual([]);
  });

  it('size property reflects count', () => {
    expect(monitor.size).toBe(0);
    monitor.add(makeJob({ id: 'j1' }), 'r1');
    expect(monitor.size).toBe(1);
    monitor.add(makeJob({ id: 'j2' }), 'r2');
    expect(monitor.size).toBe(2);
    monitor.remove('j1');
    expect(monitor.size).toBe(1);
  });

  it('add() copies the job to avoid mutation', () => {
    const job = makeJob({ id: 'j1' });
    monitor.add(job, 'failed');

    const entry = monitor.get('j1')!;
    expect(entry.job).not.toBe(job);
    expect(entry.job).toEqual(job);
  });
});
