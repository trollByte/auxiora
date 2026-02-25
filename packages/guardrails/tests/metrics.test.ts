import { describe, it, expect, beforeEach } from 'vitest';
import { GuardrailMetrics } from '../src/metrics.js';
import type { ScanResult } from '../src/types.js';

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    passed: true,
    action: 'allow',
    threats: [],
    ...overrides,
  };
}

describe('GuardrailMetrics', () => {
  let metrics: GuardrailMetrics;

  beforeEach(() => {
    metrics = new GuardrailMetrics();
  });

  it('starts with all zeros', () => {
    const stats = metrics.getStats();
    expect(stats.totalScans).toBe(0);
    expect(stats.inputScans).toBe(0);
    expect(stats.outputScans).toBe(0);
    expect(stats.totalThreats).toBe(0);
    expect(stats.blockedCount).toBe(0);
    expect(stats.redactedCount).toBe(0);
    expect(stats.lastScanAt).toBe(0);
    expect(stats.threatsByType).toEqual({});
    expect(stats.threatsByLevel).toEqual({});
    expect(stats.actionCounts).toEqual({});
  });

  it('records input scans incrementing counts', () => {
    metrics.recordInputScan(makeScanResult());
    metrics.recordInputScan(makeScanResult());

    const stats = metrics.getStats();
    expect(stats.totalScans).toBe(2);
    expect(stats.inputScans).toBe(2);
    expect(stats.outputScans).toBe(0);
  });

  it('records output scans incrementing counts', () => {
    metrics.recordOutputScan(makeScanResult());
    metrics.recordOutputScan(makeScanResult());
    metrics.recordOutputScan(makeScanResult());

    const stats = metrics.getStats();
    expect(stats.totalScans).toBe(3);
    expect(stats.inputScans).toBe(0);
    expect(stats.outputScans).toBe(3);
  });

  it('tracks threats by type', () => {
    metrics.recordInputScan(makeScanResult({
      action: 'warn',
      threats: [
        { type: 'pii', level: 'low', description: 'Email found' },
        { type: 'pii', level: 'medium', description: 'SSN found' },
        { type: 'prompt_injection', level: 'high', description: 'Injection attempt' },
      ],
    }));

    const stats = metrics.getStats();
    expect(stats.threatsByType).toEqual({
      pii: 2,
      prompt_injection: 1,
    });
    expect(stats.totalThreats).toBe(3);
  });

  it('tracks threats by level', () => {
    metrics.recordInputScan(makeScanResult({
      action: 'warn',
      threats: [
        { type: 'pii', level: 'low', description: 'Email found' },
        { type: 'toxicity', level: 'medium', description: 'Mild toxicity' },
        { type: 'prompt_injection', level: 'high', description: 'Injection' },
        { type: 'jailbreak', level: 'high', description: 'Jailbreak attempt' },
      ],
    }));

    const stats = metrics.getStats();
    expect(stats.threatsByLevel).toEqual({
      low: 1,
      medium: 1,
      high: 2,
    });
  });

  it('tracks action counts', () => {
    metrics.recordInputScan(makeScanResult({ action: 'allow' }));
    metrics.recordInputScan(makeScanResult({ action: 'allow' }));
    metrics.recordInputScan(makeScanResult({ action: 'warn' }));
    metrics.recordOutputScan(makeScanResult({ action: 'block' }));
    metrics.recordOutputScan(makeScanResult({ action: 'redact' }));

    const stats = metrics.getStats();
    expect(stats.actionCounts).toEqual({
      allow: 2,
      warn: 1,
      block: 1,
      redact: 1,
    });
  });

  it('tracks blocked and redacted counts', () => {
    metrics.recordInputScan(makeScanResult({ action: 'block' }));
    metrics.recordInputScan(makeScanResult({ action: 'block' }));
    metrics.recordOutputScan(makeScanResult({ action: 'redact' }));
    metrics.recordInputScan(makeScanResult({ action: 'allow' }));

    const stats = metrics.getStats();
    expect(stats.blockedCount).toBe(2);
    expect(stats.redactedCount).toBe(1);
  });

  it('updates lastScanAt timestamp', () => {
    const before = Date.now();
    metrics.recordInputScan(makeScanResult());
    const after = Date.now();

    const stats = metrics.getStats();
    expect(stats.lastScanAt).toBeGreaterThanOrEqual(before);
    expect(stats.lastScanAt).toBeLessThanOrEqual(after);
  });

  it('resets all counters', () => {
    metrics.recordInputScan(makeScanResult({
      action: 'block',
      threats: [
        { type: 'prompt_injection', level: 'critical', description: 'Injection' },
      ],
    }));
    metrics.recordOutputScan(makeScanResult({ action: 'redact' }));

    metrics.reset();

    const stats = metrics.getStats();
    expect(stats.totalScans).toBe(0);
    expect(stats.inputScans).toBe(0);
    expect(stats.outputScans).toBe(0);
    expect(stats.totalThreats).toBe(0);
    expect(stats.blockedCount).toBe(0);
    expect(stats.redactedCount).toBe(0);
    expect(stats.lastScanAt).toBe(0);
    expect(stats.threatsByType).toEqual({});
    expect(stats.threatsByLevel).toEqual({});
    expect(stats.actionCounts).toEqual({});
  });

  it('handles scans with no threats', () => {
    metrics.recordInputScan(makeScanResult({ action: 'allow', threats: [] }));
    metrics.recordOutputScan(makeScanResult({ action: 'allow', threats: [] }));

    const stats = metrics.getStats();
    expect(stats.totalScans).toBe(2);
    expect(stats.totalThreats).toBe(0);
    expect(stats.threatsByType).toEqual({});
    expect(stats.threatsByLevel).toEqual({});
    expect(stats.actionCounts).toEqual({ allow: 2 });
  });
});
