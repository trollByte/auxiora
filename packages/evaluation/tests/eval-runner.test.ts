import { describe, expect, it } from 'vitest';
import { EvalRunner } from '../src/eval-runner.js';
import { exactMatch, containsExpected } from '../src/metrics.js';
import type { EvalCase, EvalMetric, EvalSuiteResult } from '../src/types.js';

function makeMetrics(): Record<string, EvalMetric> {
  return {
    exact: (_input, output, expected) => exactMatch(output, expected ?? ''),
    contains: (_input, output, expected) => containsExpected(output, expected ?? ''),
  };
}

function makeCase(overrides?: Partial<EvalCase>): EvalCase {
  return {
    id: 'test-1',
    input: 'What is 2+2?',
    expectedOutput: '4',
    ...overrides,
  };
}

describe('EvalRunner', () => {
  describe('runCase', () => {
    it('runs handler and computes metric scores', async () => {
      const runner = new EvalRunner(makeMetrics());
      const result = await runner.runCase(makeCase(), async () => '4');

      expect(result.caseId).toBe('test-1');
      expect(result.scores['exact']).toBe(1);
      expect(result.scores['contains']).toBe(1);
      expect(result.pass).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('marks case as failed when average score below threshold', async () => {
      const runner = new EvalRunner(makeMetrics(), 0.9);
      const result = await runner.runCase(makeCase(), async () => 'The answer is 4');

      expect(result.scores['exact']).toBe(0);
      expect(result.scores['contains']).toBe(1);
      expect(result.pass).toBe(false);
    });

    it('handles handler errors gracefully', async () => {
      const runner = new EvalRunner(makeMetrics());
      const result = await runner.runCase(makeCase(), async () => {
        throw new Error('boom');
      });

      expect(result.pass).toBe(false);
      expect(result.feedback).toContain('Handler error');
      expect(result.actualOutput).toBe('');
    });
  });

  describe('runSuite', () => {
    it('runs all cases and computes summary', async () => {
      const runner = new EvalRunner(makeMetrics());
      const cases: EvalCase[] = [
        makeCase({ id: 'c1', input: 'Q1', expectedOutput: 'A' }),
        makeCase({ id: 'c2', input: 'Q2', expectedOutput: 'B' }),
        makeCase({ id: 'c3', input: 'Q3', expectedOutput: 'C' }),
      ];

      const suite = await runner.runSuite('test-suite', cases, async (input) => {
        if (input === 'Q1') return 'A';
        if (input === 'Q2') return 'B';
        return 'wrong';
      });

      expect(suite.name).toBe('test-suite');
      expect(suite.suiteId).toBeTruthy();
      expect(suite.results).toHaveLength(3);
      expect(suite.summary.totalCases).toBe(3);
      expect(suite.summary.passed).toBe(2);
      expect(suite.summary.failed).toBe(1);
      expect(suite.summary.averageDurationMs).toBeGreaterThanOrEqual(0);
      expect(suite.summary.p50DurationMs).toBeGreaterThanOrEqual(0);
      expect(suite.summary.p95DurationMs).toBeGreaterThanOrEqual(0);
      expect(suite.runAt).toBeGreaterThan(0);
    });

    it('computes per-metric averages in summary', async () => {
      const runner = new EvalRunner(makeMetrics());
      const cases: EvalCase[] = [
        makeCase({ id: 'c1', expectedOutput: 'yes' }),
        makeCase({ id: 'c2', expectedOutput: 'yes' }),
      ];

      const suite = await runner.runSuite('avg-test', cases, async () => 'yes');

      expect(suite.summary.averageScores['exact']).toBe(1);
      expect(suite.summary.averageScores['contains']).toBe(1);
    });
  });

  describe('compareSuites', () => {
    it('identifies improved, regressed, and unchanged metrics', () => {
      const runner = new EvalRunner(makeMetrics());

      const suiteA: EvalSuiteResult = {
        suiteId: 'a',
        name: 'test',
        results: [],
        summary: {
          totalCases: 1,
          passed: 1,
          failed: 0,
          averageScores: { exact: 0.5, contains: 0.8, length: 0.7 },
          averageDurationMs: 10,
          p50DurationMs: 10,
          p95DurationMs: 10,
        },
        runAt: 1000,
      };

      const suiteB: EvalSuiteResult = {
        suiteId: 'b',
        name: 'test',
        results: [],
        summary: {
          totalCases: 1,
          passed: 1,
          failed: 0,
          averageScores: { exact: 0.9, contains: 0.5, length: 0.7 },
          averageDurationMs: 10,
          p50DurationMs: 10,
          p95DurationMs: 10,
        },
        runAt: 2000,
      };

      const comparison = runner.compareSuites(suiteA, suiteB);

      expect(comparison.improved).toContain('exact');
      expect(comparison.regressed).toContain('contains');
      expect(comparison.unchanged).toContain('length');
    });
  });
});
