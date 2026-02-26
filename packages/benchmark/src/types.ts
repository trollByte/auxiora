export interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
}

export interface BenchmarkRun {
  id: number;
  suite: string;
  version: string;
  metrics: BenchmarkMetric[];
  runAt: number;
}

export interface MetricDelta {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  percentChange: number;
}

export interface RunComparison {
  suite: string;
  previousVersion: string;
  currentVersion: string;
  regressions: MetricDelta[];
  improvements: MetricDelta[];
  unchanged: MetricDelta[];
}

export interface TrendPoint {
  version: string;
  value: number;
  runAt: number;
}

export interface BenchmarkScenario {
  name: string;
  input: string;
  expectedOutput: string;
  evaluate: (output: string) => number;
}

export interface ScenarioResult {
  scenario: string;
  output: string;
  score: number;
  latencyMs: number;
  error?: string;
}
