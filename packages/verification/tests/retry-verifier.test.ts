import { describe, it, expect, vi } from 'vitest';
import { RetryVerifier } from '../src/retry-verifier.js';
import type { VerificationContext, VerificationResult } from '../src/types.js';

const passResult = (jobId: string): VerificationResult => ({
  jobId,
  passed: true,
  securityConcerns: [],
  logicErrors: [],
  warnings: [],
  verifiedAt: Date.now(),
});

const failResult = (jobId: string): VerificationResult => ({
  jobId,
  passed: false,
  securityConcerns: ['Hardcoded credential detected'],
  logicErrors: [],
  warnings: [],
  verifiedAt: Date.now(),
});

describe('RetryVerifier', () => {
  it('passes on first attempt when verification succeeds', async () => {
    const verifier = { verify: vi.fn().mockReturnValue(passResult('j1')) };
    const fixFn = vi.fn();
    const retry = new RetryVerifier(verifier, fixFn);

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'clean output', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.passed).toBe(true);
    expect(fixFn).not.toHaveBeenCalled();
  });

  it('retries with fixFn when verification fails', async () => {
    const verifier = {
      verify: vi.fn()
        .mockReturnValueOnce(failResult('j1'))
        .mockReturnValueOnce(passResult('j1')),
    };
    const fixFn = vi.fn().mockResolvedValue('fixed output');
    const retry = new RetryVerifier(verifier, fixFn);

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'bad output', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.passed).toBe(true);
    expect(fixFn).toHaveBeenCalledTimes(1);
    expect(verifier.verify).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries', async () => {
    const verifier = { verify: vi.fn().mockReturnValue(failResult('j1')) };
    const fixFn = vi.fn().mockResolvedValue('still bad');
    const retry = new RetryVerifier(verifier, fixFn, { maxRetries: 2 });

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'bad', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.passed).toBe(false);
    expect(fixFn).toHaveBeenCalledTimes(2);
    expect(verifier.verify).toHaveBeenCalledTimes(3);
  });

  it('tracks attempt history in result', async () => {
    const verifier = {
      verify: vi.fn()
        .mockReturnValueOnce(failResult('j1'))
        .mockReturnValueOnce(passResult('j1')),
    };
    const fixFn = vi.fn().mockResolvedValue('fixed');
    const retry = new RetryVerifier(verifier, fixFn);

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'bad', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.attempts).toBe(2);
    expect(result.autoFixed).toBe(true);
  });
});
