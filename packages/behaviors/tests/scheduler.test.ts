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
