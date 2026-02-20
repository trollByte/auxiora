import { describe, expect, it } from 'vitest';
import { EvalStore } from '../src/eval-store.js';
import type { EvalSuiteResult } from '../src/types.js';

function makeSuiteResult(overrides?: Partial<EvalSuiteResult>): EvalSuiteResult {
  return {
    suiteId: 'suite-1',
    name: 'test-suite',
    results: [],
    summary: {
      totalCases: 1,
      passed: 1,
      failed: 0,
      averageScores: { exact: 0.8, relevance: 0.6 },
      averageDurationMs: 50,
      p50DurationMs: 50,
      p95DurationMs: 50,
    },
    runAt: 1000,
    ...overrides,
  };
}

describe('EvalStore', () => {
  describe('record and getHistory', () => {
    it('stores and retrieves results by suite name', () => {
      const store = new EvalStore();
      const result = makeSuiteResult();
      store.record(result);

      const history = store.getHistory('test-suite');
      expect(history).toHaveLength(1);
      expect(history[0]).toBe(result);
    });

    it('returns empty array for unknown suite', () => {
      const store = new EvalStore();
      expect(store.getHistory('unknown')).toEqual([]);
    });

    it('accumulates multiple runs', () => {
      const store = new EvalStore();
      store.record(makeSuiteResult({ suiteId: 'r1', runAt: 1000 }));
      store.record(makeSuiteResult({ suiteId: 'r2', runAt: 2000 }));

      expect(store.getHistory('test-suite')).toHaveLength(2);
    });
  });

  describe('getLatest', () => {
    it('returns the most recent result', () => {
      const store = new EvalStore();
      store.record(makeSuiteResult({ suiteId: 'r1', runAt: 1000 }));
      store.record(makeSuiteResult({ suiteId: 'r2', runAt: 2000 }));

      const latest = store.getLatest('test-suite');
      expect(latest?.suiteId).toBe('r2');
    });

    it('returns undefined for unknown suite', () => {
      const store = new EvalStore();
      expect(store.getLatest('unknown')).toBeUndefined();
    });
  });

  describe('getTrend', () => {
    it('returns score over time for a metric', () => {
      const store = new EvalStore();
      store.record(
        makeSuiteResult({
          suiteId: 'r1',
          runAt: 1000,
          summary: {
            totalCases: 1,
            passed: 1,
            failed: 0,
            averageScores: { exact: 0.5 },
            averageDurationMs: 10,
            p50DurationMs: 10,
            p95DurationMs: 10,
          },
        }),
      );
      store.record(
        makeSuiteResult({
          suiteId: 'r2',
          runAt: 2000,
          summary: {
            totalCases: 1,
            passed: 1,
            failed: 0,
            averageScores: { exact: 0.9 },
            averageDurationMs: 10,
            p50DurationMs: 10,
            p95DurationMs: 10,
          },
        }),
      );

      const trend = store.getTrend('test-suite', 'exact');
      expect(trend).toEqual([
        { runAt: 1000, score: 0.5 },
        { runAt: 2000, score: 0.9 },
      ]);
    });

    it('returns 0 for missing metric', () => {
      const store = new EvalStore();
      store.record(makeSuiteResult({ runAt: 1000 }));

      const trend = store.getTrend('test-suite', 'nonexistent');
      expect(trend).toEqual([{ runAt: 1000, score: 0 }]);
    });

    it('returns empty array for unknown suite', () => {
      const store = new EvalStore();
      expect(store.getTrend('unknown', 'exact')).toEqual([]);
    });
  });
});
