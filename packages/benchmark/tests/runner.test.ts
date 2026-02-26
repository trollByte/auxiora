import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../src/runner.js';
import type { BenchmarkScenario } from '../src/types.js';

const scenarios: BenchmarkScenario[] = [
  {
    name: 'simple-question',
    input: '2+2',
    expectedOutput: '4',
    evaluate: (output) => (output.trim() === '4' ? 1.0 : 0.0),
  },
  {
    name: 'greeting',
    input: 'Hello',
    expectedOutput: 'Hi',
    evaluate: (output) => (output.trim() === 'Hi' ? 1.0 : 0.0),
  },
];

describe('BenchmarkRunner', () => {
  it('runs all scenarios and collects results', async () => {
    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(async (input) => {
      if (input === '2+2') return '4';
      if (input === 'Hello') return 'Hi';
      return '';
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.scenario).toBe('simple-question');
    expect(results[0]!.score).toBe(1.0);
    expect(results[1]!.scenario).toBe('greeting');
    expect(results[1]!.score).toBe(1.0);
  });

  it('measures latency per scenario', async () => {
    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (input === '2+2') return '4';
      return 'Hi';
    });

    for (const r of results) {
      expect(r.latencyMs).toBeGreaterThanOrEqual(5);
    }
  });

  it('handles handler errors gracefully', async () => {
    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(async () => {
      throw new Error('boom');
    });

    for (const r of results) {
      expect(r.score).toBe(0);
      expect(r.error).toBe('boom');
      expect(r.output).toBe('');
    }
  });

  it('computes aggregate metrics', () => {
    const runner = new BenchmarkRunner(scenarios);
    const results = [
      { scenario: 'simple-question', output: '4', score: 1.0, latencyMs: 10 },
      { scenario: 'greeting', output: 'Bye', score: 0.0, latencyMs: 20 },
    ];

    const metrics = runner.computeMetrics(results);
    const accuracy = metrics.find((m) => m.name === 'accuracy');
    const errorRate = metrics.find((m) => m.name === 'error_rate');
    const p50 = metrics.find((m) => m.name === 'latency_p50');

    expect(accuracy!.value).toBe(0.5);
    expect(errorRate!.value).toBe(0);
    expect(p50!.value).toBe(15);
  });
});
