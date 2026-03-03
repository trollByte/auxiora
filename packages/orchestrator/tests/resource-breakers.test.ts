import { describe, it, expect } from 'vitest';
import { ResourceBreakers } from '../src/resource-breakers.js';
import type { ResourceSnapshotLike } from '../src/resource-types.js';

function makeSnapshot(overrides: {
  cpuUtil?: number;
  ramPercent?: number;
  swapPercent?: number;
} = {}): ResourceSnapshotLike {
  return {
    cpu: { cores: 8, utilization: overrides.cpuUtil ?? 0.3, loadAvg1m: 2.0 },
    memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: overrides.ramPercent ?? 40 },
    swap: { usedPercent: overrides.swapPercent ?? 5 },
    timestamp: Date.now(),
  };
}

describe('ResourceBreakers', () => {
  it('returns ok when all metrics are within safe limits', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot());
    expect(result.action).toBe('ok');
    expect(result.reasons).toHaveLength(0);
  });

  it('returns throttle when CPU utilization exceeds 90%', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot({ cpuUtil: 0.95 }));
    expect(result.action).toBe('throttle');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('CPU utilization');
  });

  it('returns pause when RAM exceeds 85%', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot({ ramPercent: 87 }));
    expect(result.action).toBe('pause');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('RAM usage');
  });

  it('returns kill when RAM exceeds 90%', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot({ ramPercent: 92 }));
    expect(result.action).toBe('kill');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('kill threshold');
  });

  it('returns kill when swap exceeds 50%', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot({ swapPercent: 60 }));
    expect(result.action).toBe('kill');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('Swap usage');
  });

  it('kill takes priority over pause when both RAM triggers fire', () => {
    const breakers = new ResourceBreakers();
    // 92% > both 85 (pause) and 90 (kill) — kill wins
    const result = breakers.evaluate(makeSnapshot({ ramPercent: 92 }));
    expect(result.action).toBe('kill');
  });

  it('pause takes priority over throttle', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot({ ramPercent: 87, cpuUtil: 0.95 }));
    expect(result.action).toBe('pause');
    expect(result.reasons).toHaveLength(2);
  });

  it('respects custom thresholds', () => {
    const breakers = new ResourceBreakers({
      ramPausePercent: 70,
      ramKillPercent: 80,
      cpuThrottlePercent: 50,
      swapEmergencyPercent: 30,
    });

    // 75% RAM should pause with custom 70% threshold
    const result = breakers.evaluate(makeSnapshot({ ramPercent: 75 }));
    expect(result.action).toBe('pause');

    // 55% CPU should throttle with custom 50% threshold
    const result2 = breakers.evaluate(makeSnapshot({ cpuUtil: 0.55 }));
    expect(result2.action).toBe('throttle');
  });

  it('does not trigger at exact boundary values', () => {
    const breakers = new ResourceBreakers();

    // Exactly 85% RAM — not above, so no pause
    const pauseEdge = breakers.evaluate(makeSnapshot({ ramPercent: 85 }));
    expect(pauseEdge.action).toBe('ok');

    // Exactly 90% RAM — not above, so no kill
    const killEdge = breakers.evaluate(makeSnapshot({ ramPercent: 90 }));
    // 90 is not > 90 but 90 > 85, so pause
    expect(killEdge.action).toBe('pause');

    // Exactly 0.9 CPU — 90% is not > 90, so no throttle
    const cpuEdge = breakers.evaluate(makeSnapshot({ cpuUtil: 0.9 }));
    expect(cpuEdge.action).toBe('ok');
  });

  it('collects multiple reasons when multiple thresholds are exceeded', () => {
    const breakers = new ResourceBreakers();
    const result = breakers.evaluate(makeSnapshot({ ramPercent: 92, swapPercent: 60, cpuUtil: 0.95 }));
    expect(result.action).toBe('kill');
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    expect(result.reasons.some((r) => r.includes('RAM'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('Swap'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('CPU'))).toBe(true);
  });
});
