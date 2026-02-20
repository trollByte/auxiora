import crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { EvalCase, EvalMetric, EvalResult, EvalSuiteResult, EvalSummary } from './types.js';

const log = getLogger('evaluation');

export class EvalRunner {
  private readonly metrics: Record<string, EvalMetric>;
  private readonly passThreshold: number;

  constructor(metrics: Record<string, EvalMetric>, passThreshold = 0.5) {
    this.metrics = metrics;
    this.passThreshold = passThreshold;
  }

  async runCase(
    evalCase: EvalCase,
    handler: (input: string) => Promise<string>,
  ): Promise<EvalResult> {
    const start = performance.now();
    let actualOutput: string;
    try {
      actualOutput = await handler(evalCase.input);
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      log.error('Handler failed for case %s', evalCase.id, wrapped);
      return {
        caseId: evalCase.id,
        scores: {},
        actualOutput: '',
        durationMs: performance.now() - start,
        pass: false,
        feedback: `Handler error: ${wrapped.message}`,
      };
    }
    const durationMs = performance.now() - start;

    const expected = evalCase.expectedOutput ?? evalCase.reference;
    const scores: Record<string, number> = {};
    for (const [name, metric] of Object.entries(this.metrics)) {
      try {
        scores[name] = metric(evalCase.input, actualOutput, expected);
      } catch (err: unknown) {
        const wrapped: Error = err instanceof Error ? err : new Error(String(err));
        log.error('Metric %s failed for case %s', name, evalCase.id, wrapped);
        scores[name] = 0;
      }
    }

    const scoreValues = Object.values(scores);
    const avgScore = scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;
    const pass = avgScore >= this.passThreshold;

    return {
      caseId: evalCase.id,
      scores,
      actualOutput,
      durationMs,
      pass,
    };
  }

  async runSuite(
    name: string,
    cases: EvalCase[],
    handler: (input: string) => Promise<string>,
  ): Promise<EvalSuiteResult> {
    const results: EvalResult[] = [];
    for (const evalCase of cases) {
      const result = await this.runCase(evalCase, handler);
      results.push(result);
    }

    const summary = this.computeSummary(results);

    return {
      suiteId: crypto.randomUUID(),
      name,
      results,
      summary,
      runAt: Date.now(),
    };
  }

  compareSuites(
    a: EvalSuiteResult,
    b: EvalSuiteResult,
  ): { improved: string[]; regressed: string[]; unchanged: string[] } {
    const improved: string[] = [];
    const regressed: string[] = [];
    const unchanged: string[] = [];

    const allMetrics = new Set([
      ...Object.keys(a.summary.averageScores),
      ...Object.keys(b.summary.averageScores),
    ]);

    for (const metric of allMetrics) {
      const scoreA = a.summary.averageScores[metric] ?? 0;
      const scoreB = b.summary.averageScores[metric] ?? 0;
      const diff = scoreB - scoreA;

      if (diff > 0.01) {
        improved.push(metric);
      } else if (diff < -0.01) {
        regressed.push(metric);
      } else {
        unchanged.push(metric);
      }
    }

    return { improved, regressed, unchanged };
  }

  private computeSummary(results: EvalResult[]): EvalSummary {
    const totalCases = results.length;
    const passed = results.filter((r) => r.pass).length;
    const failed = totalCases - passed;

    const allMetricNames = new Set<string>();
    for (const r of results) {
      for (const name of Object.keys(r.scores)) {
        allMetricNames.add(name);
      }
    }

    const averageScores: Record<string, number> = {};
    for (const name of allMetricNames) {
      const values = results.map((r) => r.scores[name] ?? 0);
      averageScores[name] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
    const averageDurationMs =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p50DurationMs = percentile(durations, 50);
    const p95DurationMs = percentile(durations, 95);

    return {
      totalCases,
      passed,
      failed,
      averageScores,
      averageDurationMs,
      p50DurationMs,
      p95DurationMs,
    };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  const weight = idx - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}
