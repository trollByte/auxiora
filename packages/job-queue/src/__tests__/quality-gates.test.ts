import { describe, it, expect } from 'vitest';
import { QualityGateChecker } from '../quality-gates.js';
import type { TestBaseline } from '../quality-gates.js';

describe('QualityGateChecker', () => {
  const checker = new QualityGateChecker();

  it('passes when no regressions introduced', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(true);
    expect(result.regressionDetected).toBe(false);
  });

  it('detects regressions (new failures)', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 100, passed: 95, failed: 5, timestamp: Date.now() };
    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(false);
    expect(result.regressionDetected).toBe(true);
    expect(result.newFailures).toBe(3);
  });

  it('passes when pre-existing failures decrease', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 90, failed: 10, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 100, passed: 95, failed: 5, timestamp: Date.now() };
    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(true);
    expect(result.newFailures).toBe(0);
  });

  it('passes when new tests are added and all pass', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 110, passed: 108, failed: 2, timestamp: Date.now() };
    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(true);
  });
});
