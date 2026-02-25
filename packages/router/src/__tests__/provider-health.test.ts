import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderHealthTracker } from '../provider-health.js';

describe('ProviderHealthTracker', () => {
  let tracker: ProviderHealthTracker;

  beforeEach(() => {
    tracker = new ProviderHealthTracker();
  });

  it('should return healthy snapshot with zeros for unknown provider', () => {
    const snapshot = tracker.getHealth('anthropic');
    expect(snapshot.healthy).toBe(true);
    expect(snapshot.avgLatencyMs).toBe(0);
    expect(snapshot.p95LatencyMs).toBe(0);
    expect(snapshot.totalRequests).toBe(0);
    expect(snapshot.totalErrors).toBe(0);
    expect(snapshot.errorRate).toBe(0);
    expect(snapshot.lastSuccessAt).toBe(0);
    expect(snapshot.lastErrorAt).toBe(0);
    expect(snapshot.status).toBe('active');
  });

  it('should track latency on recordSuccess', () => {
    tracker.recordSuccess('anthropic', 150);
    const snapshot = tracker.getHealth('anthropic');
    expect(snapshot.totalRequests).toBe(1);
    expect(snapshot.totalErrors).toBe(0);
    expect(snapshot.avgLatencyMs).toBe(150);
    expect(snapshot.lastSuccessAt).toBeGreaterThan(0);
  });

  it('should track errors on recordError', () => {
    tracker.recordError('openai', 500);
    const snapshot = tracker.getHealth('openai');
    expect(snapshot.totalRequests).toBe(1);
    expect(snapshot.totalErrors).toBe(1);
    expect(snapshot.errorRate).toBe(1);
    expect(snapshot.lastErrorAt).toBeGreaterThan(0);
  });

  it('should compute avgLatencyMs correctly', () => {
    tracker.recordSuccess('anthropic', 100);
    tracker.recordSuccess('anthropic', 200);
    tracker.recordSuccess('anthropic', 300);
    const snapshot = tracker.getHealth('anthropic');
    expect(snapshot.avgLatencyMs).toBe(200);
  });

  it('should compute p95LatencyMs correctly', () => {
    // Insert 20 records with latencies 1..20
    for (let i = 1; i <= 20; i++) {
      tracker.recordSuccess('anthropic', i * 10);
    }
    const snapshot = tracker.getHealth('anthropic');
    // p95 index = ceil(0.95 * 20) - 1 = 19 - 1 = 18 => sorted[18] = 190
    expect(snapshot.p95LatencyMs).toBe(190);
  });

  it('should compute errorRate as errors/total', () => {
    tracker.recordSuccess('anthropic', 100);
    tracker.recordSuccess('anthropic', 100);
    tracker.recordError('anthropic', 100);
    tracker.recordSuccess('anthropic', 100);
    const snapshot = tracker.getHealth('anthropic');
    expect(snapshot.errorRate).toBe(0.25);
  });

  it('should mark status as degraded above degraded threshold', () => {
    // Default degradedThreshold = 0.2, downThreshold = 0.5
    // 3 successes + 1 error = 0.25 error rate => degraded
    tracker.recordSuccess('anthropic', 100);
    tracker.recordSuccess('anthropic', 100);
    tracker.recordSuccess('anthropic', 100);
    tracker.recordError('anthropic', 100);
    const snapshot = tracker.getHealth('anthropic');
    expect(snapshot.status).toBe('degraded');
    expect(snapshot.healthy).toBe(false);
  });

  it('should mark status as down above down threshold', () => {
    // 1 success + 1 error = 0.5 error rate => down
    tracker.recordSuccess('anthropic', 100);
    tracker.recordError('anthropic', 100);
    const snapshot = tracker.getHealth('anthropic');
    expect(snapshot.status).toBe('down');
    expect(snapshot.healthy).toBe(false);
  });

  it('should limit stored records to windowSize', () => {
    const small = new ProviderHealthTracker({ windowSize: 5 });
    for (let i = 0; i < 10; i++) {
      small.recordSuccess('anthropic', (i + 1) * 10);
    }
    const snapshot = small.getHealth('anthropic');
    expect(snapshot.totalRequests).toBe(5);
    // Window should contain latencies 60, 70, 80, 90, 100
    expect(snapshot.avgLatencyMs).toBe(80);
  });

  it('should return all providers via getAllHealth', () => {
    tracker.recordSuccess('anthropic', 100);
    tracker.recordSuccess('openai', 200);
    tracker.recordSuccess('google', 300);
    const all = tracker.getAllHealth();
    expect(all).toHaveLength(3);
    const names = all.map(s => s.provider).sort();
    expect(names).toEqual(['anthropic', 'google', 'openai']);
  });

  it('should list provider names via getProviders', () => {
    tracker.recordSuccess('anthropic', 100);
    tracker.recordError('openai', 200);
    const providers = tracker.getProviders();
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toHaveLength(2);
  });

  it('should clear everything on reset', () => {
    tracker.recordSuccess('anthropic', 100);
    tracker.recordError('openai', 200);
    expect(tracker.getProviders()).toHaveLength(2);

    tracker.reset();
    expect(tracker.getProviders()).toHaveLength(0);
    expect(tracker.getAllHealth()).toHaveLength(0);
  });

  it('should respect custom thresholds', () => {
    const custom = new ProviderHealthTracker({
      degradedThreshold: 0.1,
      downThreshold: 0.3,
    });

    // 9 successes + 1 error = 0.1 error rate => degraded with custom threshold
    for (let i = 0; i < 9; i++) {
      custom.recordSuccess('anthropic', 100);
    }
    custom.recordError('anthropic', 100);
    expect(custom.getHealth('anthropic').status).toBe('degraded');

    // 7 successes + 3 errors = 0.3 error rate => down with custom threshold
    const custom2 = new ProviderHealthTracker({
      degradedThreshold: 0.1,
      downThreshold: 0.3,
    });
    for (let i = 0; i < 7; i++) {
      custom2.recordSuccess('openai', 100);
    }
    for (let i = 0; i < 3; i++) {
      custom2.recordError('openai', 100);
    }
    expect(custom2.getHealth('openai').status).toBe('down');
  });
});
