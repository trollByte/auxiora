import { describe, it, expect } from 'vitest';
import { safeExecFile } from '../src/util/exec.js';

describe('safeExecFile', () => {
  it('runs a command and returns stdout', async () => {
    const result = await safeExecFile('echo', ['hello']);
    expect(result.status).toBe('ok');
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns error status on command failure', async () => {
    const result = await safeExecFile('false', []);
    expect(result.status).toBe('error');
    expect(result.exitCode).not.toBe(0);
  });

  it('returns error status on command not found', async () => {
    const result = await safeExecFile('nonexistent-binary-xyz', []);
    expect(result.status).toBe('error');
    expect(result.stderr).toBeTruthy();
  });

  it('respects timeout', async () => {
    const result = await safeExecFile('sleep', ['10'], { timeoutMs: 100 });
    expect(result.status).toBe('error');
  });
});
