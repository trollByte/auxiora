export interface EvalCase {
  id: string;
  input: string;
  expectedOutput?: string;
  reference?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface EvalResult {
  caseId: string;
  scores: Record<string, number>;
  actualOutput: string;
  durationMs: number;
  tokenCount?: number;
  pass: boolean;
  feedback?: string;
}

export interface EvalSuiteResult {
  suiteId: string;
  name: string;
  results: EvalResult[];
  summary: EvalSummary;
  runAt: number;
}

export interface EvalSummary {
  totalCases: number;
  passed: number;
  failed: number;
  averageScores: Record<string, number>;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
}

export type EvalMetric = (input: string, output: string, expected?: string) => number;
