import type { EvalSuiteResult } from './types.js';

export class EvalStore {
  private history: Map<string, EvalSuiteResult[]> = new Map();

  record(result: EvalSuiteResult): void {
    const existing = this.history.get(result.name) ?? [];
    existing.push(result);
    this.history.set(result.name, existing);
  }

  getHistory(suiteName: string): EvalSuiteResult[] {
    return this.history.get(suiteName) ?? [];
  }

  getLatest(suiteName: string): EvalSuiteResult | undefined {
    const runs = this.history.get(suiteName);
    if (!runs || runs.length === 0) return undefined;
    return runs[runs.length - 1];
  }

  getTrend(
    suiteName: string,
    metricName: string,
  ): Array<{ runAt: number; score: number }> {
    const runs = this.history.get(suiteName) ?? [];
    return runs.map((r) => ({
      runAt: r.runAt,
      score: r.summary.averageScores[metricName] ?? 0,
    }));
  }
}
