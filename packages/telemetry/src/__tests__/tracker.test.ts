import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TelemetryTracker } from '../tracker.js';

describe('TelemetryTracker', () => {
  let dir: string;
  let tracker: TelemetryTracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'telemetry-'));
    tracker = new TelemetryTracker(join(dir, 'telemetry.db'));
  });

  afterEach(() => {
    tracker.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records and retrieves tool stats', () => {
    tracker.record({ tool: 'provider.complete', success: true, durationMs: 1200, context: 'chat' });
    tracker.record({ tool: 'provider.complete', success: true, durationMs: 800, context: 'chat' });
    tracker.record({ tool: 'provider.complete', success: false, durationMs: 100, context: 'chat', error: 'timeout' });

    const stats = tracker.getToolStats('provider.complete');
    expect(stats.totalCalls).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.667, 2);
    expect(stats.avgDurationMs).toBeCloseTo(700, 0);
    expect(stats.lastError).toBe('timeout');
  });

  it('returns empty stats for unknown tool', () => {
    const stats = tracker.getToolStats('unknown');
    expect(stats.totalCalls).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('lists all tool stats sorted by success rate ascending', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 10 });
    tracker.record({ tool: 'b', success: false, durationMs: 10 });
    tracker.record({ tool: 'b', success: true, durationMs: 10 });

    const all = tracker.getAllStats();
    expect(all.length).toBe(2);
    expect(all[0].tool).toBe('b'); // 50% < 100%
    expect(all[1].tool).toBe('a'); // 100%
  });

  it('gets flagged tools below threshold', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'flaky', success: i < 4, durationMs: 10 });
    }
    tracker.record({ tool: 'solid', success: true, durationMs: 10 });

    const flagged = tracker.getFlaggedTools(0.7, 5);
    expect(flagged.length).toBe(1);
    expect(flagged[0].tool).toBe('flaky');
  });

  it('records job outcomes', () => {
    tracker.recordJob({ type: 'behavior', success: true, durationMs: 5000, jobId: 'j1' });
    tracker.recordJob({ type: 'behavior', success: false, durationMs: 200, jobId: 'j2', error: 'handler error' });

    const stats = tracker.getJobStats('behavior');
    expect(stats.totalJobs).toBe(2);
    expect(stats.successRate).toBe(0.5);
  });

  it('persists across close/reopen', () => {
    tracker.record({ tool: 'x', success: true, durationMs: 100 });
    tracker.close();

    const tracker2 = new TelemetryTracker(join(dir, 'telemetry.db'));
    const stats = tracker2.getToolStats('x');
    expect(stats.totalCalls).toBe(1);
    tracker2.close();
  });
});
