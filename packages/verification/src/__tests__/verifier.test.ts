import { describe, it, expect } from 'vitest';
import { JobVerifier } from '../verifier.js';
import type { VerificationContext } from '../types.js';

describe('JobVerifier', () => {
  const verifier = new JobVerifier();

  it('passes clean output', () => {
    const ctx: VerificationContext = {
      jobId: 'j1',
      jobType: 'behavior',
      output: 'Successfully completed the daily briefing. No issues found.',
      durationMs: 5000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(true);
    expect(result.securityConcerns.length).toBe(0);
    expect(result.logicErrors.length).toBe(0);
  });

  it('flags dynamic code construction patterns', () => {
    const ctx: VerificationContext = {
      jobId: 'j2',
      jobType: 'react',
      output: 'Used new Function("return " + userInput) to process data.',
      durationMs: 3000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(false);
    expect(result.securityConcerns.length).toBeGreaterThan(0);
  });

  it('flags hardcoded credentials', () => {
    const ctx: VerificationContext = {
      jobId: 'j3',
      jobType: 'workflow',
      output: 'Set API_KEY="sk-abc123def456ghi789" in the config file.',
      durationMs: 2000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(false);
    expect(result.securityConcerns.some(c => c.toLowerCase().includes('credential') || c.toLowerCase().includes('secret') || c.toLowerCase().includes('api key'))).toBe(true);
  });

  it('flags shell command injection patterns', () => {
    const ctx: VerificationContext = {
      jobId: 'j4',
      jobType: 'react',
      output: 'Running command with string concatenation: "rm -rf " + userInput',
      durationMs: 1000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(false);
  });

  it('flags extremely long outputs as suspicious', () => {
    const ctx: VerificationContext = {
      jobId: 'j5',
      jobType: 'behavior',
      output: 'a'.repeat(500_001),
      durationMs: 100,
    };
    const result = verifier.verify(ctx);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns metadata with verification timing', () => {
    const ctx: VerificationContext = {
      jobId: 'j6',
      jobType: 'behavior',
      output: 'All good.',
      durationMs: 1000,
    };
    const result = verifier.verify(ctx);
    expect(result.verifiedAt).toBeGreaterThan(0);
    expect(result.jobId).toBe('j6');
  });
});
