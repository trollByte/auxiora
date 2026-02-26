import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionReflector } from '../reflection.js';
import { TelemetryTracker } from '../tracker.js';

describe('SessionReflector', () => {
  let dir: string;
  let tracker: TelemetryTracker;
  let reflector: SessionReflector;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reflect-'));
    tracker = new TelemetryTracker(join(dir, 'telemetry.db'));
    reflector = new SessionReflector(tracker);
  });

  afterEach(() => {
    tracker.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reflects on a successful session', () => {
    tracker.record({ tool: 'provider.complete', success: true, durationMs: 500 });
    tracker.record({ tool: 'memory.search', success: true, durationMs: 200 });

    const reflection = reflector.reflect('session-1');
    expect(reflection.sessionId).toBe('session-1');
    expect(reflection.toolsUsed).toBe(2);
    expect(reflection.overallSuccessRate).toBe(1.0);
    expect(reflection.issues.length).toBe(0);
    expect(reflection.summary).toContain('All tools performing well');
  });

  it('identifies degraded tools in reflection', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'flaky', success: i < 3, durationMs: 100, error: i >= 3 ? 'timeout' : '' });
    }
    tracker.record({ tool: 'solid', success: true, durationMs: 50 });

    const reflection = reflector.reflect('session-2');
    expect(reflection.issues.length).toBeGreaterThan(0);
    expect(reflection.issues[0]).toContain('flaky');
  });

  it('generates a structured 3-question reflection', () => {
    // 'a' needs >= 3 calls with >= 90% success to appear in whatWorked
    for (let i = 0; i < 4; i++) {
      tracker.record({ tool: 'a', success: true, durationMs: 100 });
    }
    // 'b' needs avgDurationMs > 3000 for whatWasSlow,
    // and >= 3 calls with < 70% success for whatToChange
    for (let i = 0; i < 4; i++) {
      tracker.record({ tool: 'b', success: false, durationMs: 5000, error: 'slow' });
    }

    const reflection = reflector.reflect('session-3');
    expect(reflection.whatWorked.length).toBeGreaterThan(0);
    expect(reflection.whatWasSlow.length).toBeGreaterThan(0);
    expect(reflection.whatToChange.length).toBeGreaterThan(0);
  });

  it('persists reflection for later retrieval', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 100 });
    const r = reflector.reflect('session-4');
    reflector.save(r);

    const history = reflector.getRecentReflections(5);
    expect(history.length).toBe(1);
    expect(history[0].sessionId).toBe('session-4');
  });
});
