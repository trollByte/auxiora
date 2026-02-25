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
