import type { BenchmarkMetric, BenchmarkScenario, ScenarioResult } from './types.js';

export class BenchmarkRunner {
  private readonly scenarios: BenchmarkScenario[];

  constructor(scenarios: BenchmarkScenario[]) {
    this.scenarios = scenarios;
  }

  async run(handler: (input: string) => Promise<string>): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of this.scenarios) {
      const start = performance.now();
      try {
        const output = await handler(scenario.input);
        const latencyMs = performance.now() - start;
        const score = scenario.evaluate(output);
        results.push({ scenario: scenario.name, output, score, latencyMs });
      } catch (err: unknown) {
        const latencyMs = performance.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        results.push({ scenario: scenario.name, output: '', score: 0, latencyMs, error: message });
      }
    }

    return results;
  }

  computeMetrics(results: ScenarioResult[]): BenchmarkMetric[] {
    if (results.length === 0) return [];
    const scores = results.map((r) => r.score);
    const accuracy = scores.reduce((a, b) => a + b, 0) / scores.length;

    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const latencyP50 = percentile(latencies, 0.5);
    const latencyP95 = percentile(latencies, 0.95);

    const errorCount = results.filter((r) => r.error !== undefined).length;
    const errorRate = errorCount / results.length;

    return [
      { name: 'accuracy', value: accuracy, unit: 'ratio' },
      { name: 'latency_p50', value: latencyP50, unit: 'ms' },
      { name: 'latency_p95', value: latencyP95, unit: 'ms' },
      { name: 'error_rate', value: errorRate, unit: 'ratio' },
    ];
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}
