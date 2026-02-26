import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BatteryChangeReviewer } from '../battery-change.js';
import { TelemetryTracker } from '../tracker.js';
import { SessionReflector } from '../reflection.js';

describe('BatteryChangeReviewer', () => {
  let dir: string;
  let tracker: TelemetryTracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'battery-'));
    tracker = new TelemetryTracker(join(dir, 'telemetry.db'));
  });

  afterEach(() => {
    tracker.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('generates improvement report from telemetry', () => {
    for (let i = 0; i < 20; i++) {
      tracker.record({ tool: 'provider.complete', success: i < 14, durationMs: 500, error: i >= 14 ? 'timeout' : '' });
    }
    tracker.record({ tool: 'memory.search', success: true, durationMs: 100 });

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();

    expect(report).toContain('Self-Improvement Report');
    expect(report).toContain('provider.complete');
    expect(report.length).toBeGreaterThan(100);
  });

  it('includes recent reflections in report', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 100 });
    const reflector = new SessionReflector(tracker);
    const r = reflector.reflect('s1');
    reflector.save(r);

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();
    expect(report).toContain('Recent Session Reflections');
  });

  it('produces actionable suggestions', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'flaky', success: i < 3, durationMs: 100, error: 'rate limit' });
    }

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();
    expect(report).toContain('Suggestions');
    expect(report).toContain('flaky');
  });
});
