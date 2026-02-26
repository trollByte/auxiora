export interface TestBaseline {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly timestamp: number;
}

export interface QualityGateResult {
  readonly passed: boolean;
  readonly regressionDetected: boolean;
  readonly newFailures: number;
  readonly baseline: TestBaseline;
  readonly current: TestBaseline;
  readonly summary: string;
}

export class QualityGateChecker {
  compare(baseline: TestBaseline, current: TestBaseline): QualityGateResult {
    const newFailures = Math.max(0, current.failed - baseline.failed);
    const regressionDetected = newFailures > 0;

    let summary: string;
    if (!regressionDetected) {
      if (current.failed < baseline.failed) {
        summary = `Improved: ${baseline.failed - current.failed} fewer failures (${current.passed}/${current.totalTests} passing)`;
      } else {
        summary = `No regressions (${current.passed}/${current.totalTests} passing)`;
      }
    } else {
      summary = `REGRESSION: ${newFailures} new failure(s) introduced (was ${baseline.failed}, now ${current.failed})`;
    }

    return { passed: !regressionDetected, regressionDetected, newFailures, baseline, current, summary };
  }
}
