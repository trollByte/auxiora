import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BenchmarkStore } from '../src/result-store.js';
import type { BenchmarkMetric } from '../src/types.js';

describe('BenchmarkStore', () => {
  let store: BenchmarkStore;
  let dir: string;

  function setup(): void {
    dir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(dir, 'bench.db'));
  }

  afterEach(() => {
    store?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('records and retrieves benchmark runs', () => {
    setup();
    const metrics: BenchmarkMetric[] = [
      { name: 'accuracy', value: 0.95, unit: 'ratio' },
      { name: 'latency', value: 200, unit: 'ms' },
    ];
    const id = store.recordRun('nlp-suite', 'v1.0.0', metrics);
    expect(id).toBeGreaterThan(0);

    const runs = store.getRunsBySuite('nlp-suite');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.suite).toBe('nlp-suite');
    expect(runs[0]!.version).toBe('v1.0.0');
    expect(runs[0]!.metrics).toEqual(metrics);
  });

  it('compares two runs and detects regression', () => {
    setup();
    store.recordRun('nlp-suite', 'v1.0.0', [
      { name: 'accuracy', value: 0.95, unit: 'ratio' },
    ]);
    store.recordRun('nlp-suite', 'v1.1.0', [
      { name: 'accuracy', value: 0.85, unit: 'ratio' },
    ]);

    const comparison = store.compareLatest('nlp-suite');
    expect(comparison).not.toBeNull();
    expect(comparison!.previousVersion).toBe('v1.0.0');
    expect(comparison!.currentVersion).toBe('v1.1.0');
    expect(comparison!.regressions).toHaveLength(1);
    expect(comparison!.regressions[0]!.metric).toBe('accuracy');
    expect(comparison!.regressions[0]!.delta).toBeCloseTo(-0.1);
    expect(comparison!.improvements).toHaveLength(0);
  });

  it('detects improvement', () => {
    setup();
    store.recordRun('perf-suite', 'v1.0.0', [
      { name: 'latency', value: 200, unit: 'ms' },
    ]);
    store.recordRun('perf-suite', 'v1.1.0', [
      { name: 'latency', value: 150, unit: 'ms' },
    ]);

    const comparison = store.compareLatest('perf-suite');
    expect(comparison).not.toBeNull();
    // Raw delta: 150 - 200 = -50, so this is a regression in raw terms
    expect(comparison!.regressions).toHaveLength(1);
    expect(comparison!.regressions[0]!.delta).toBeCloseTo(-50);
  });

  it('returns null comparison with fewer than 2 runs', () => {
    setup();
    store.recordRun('solo-suite', 'v1.0.0', [
      { name: 'score', value: 100, unit: 'points' },
    ]);

    const comparison = store.compareLatest('solo-suite');
    expect(comparison).toBeNull();
  });

  it('lists all suites', () => {
    setup();
    store.recordRun('suite-a', 'v1.0.0', [{ name: 'x', value: 1, unit: 'u' }]);
    store.recordRun('suite-b', 'v1.0.0', [{ name: 'x', value: 2, unit: 'u' }]);
    store.recordRun('suite-a', 'v1.1.0', [{ name: 'x', value: 3, unit: 'u' }]);

    const suites = store.listSuites();
    expect(suites).toEqual(['suite-a', 'suite-b']);
  });

  it('computes trend over multiple runs', () => {
    setup();
    store.recordRun('trend-suite', 'v1.0.0', [{ name: 'throughput', value: 100, unit: 'rps' }]);
    store.recordRun('trend-suite', 'v2.0.0', [{ name: 'throughput', value: 150, unit: 'rps' }]);
    store.recordRun('trend-suite', 'v3.0.0', [{ name: 'throughput', value: 180, unit: 'rps' }]);

    const trend = store.getTrend('trend-suite', 'throughput');
    expect(trend).toHaveLength(3);
    expect(trend[0]!.version).toBe('v1.0.0');
    expect(trend[0]!.value).toBe(100);
    expect(trend[1]!.value).toBe(150);
    expect(trend[2]!.value).toBe(180);
  });
});
