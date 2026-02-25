import { describe, it, expect, vi, afterEach } from 'vitest';
import { HealthChecker } from '../src/health-checker.js';

describe('HealthChecker', () => {
  const checker = new HealthChecker('http://localhost:18800');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when health endpoint reports expected version', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '2.0.0' }), { status: 200 }),
    );

    const result = await checker.waitForHealthy('2.0.0', { maxAttempts: 1, intervalMs: 10 });
    expect(result.healthy).toBe(true);
  });

  it('fails when version does not match after max attempts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 }),
    );

    const result = await checker.waitForHealthy('2.0.0', { maxAttempts: 2, intervalMs: 10 });
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain('version');
  });

  it('fails when health endpoint is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await checker.waitForHealthy('2.0.0', { maxAttempts: 2, intervalMs: 10 });
    expect(result.healthy).toBe(false);
  });
});
