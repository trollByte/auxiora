import { describe, it, expect } from 'vitest';
import { ToolApprovalGate } from '../src/tool-approval-gate.js';

describe('ToolApprovalGate', () => {
  it('allows tools not in the approval list', async () => {
    const gate = new ToolApprovalGate({ requireApproval: ['run_shell'] });
    const result = await gate.check('search', { query: 'test' });
    expect(result.allowed).toBe(true);
  });

  it('blocks tools when no approval given (timeout)', async () => {
    const gate = new ToolApprovalGate({ requireApproval: ['run_shell'], timeoutMs: 100 });
    const result = await gate.check('run_shell', { command: 'ls' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('timeout');
  });

  it('allows when approval is granted', async () => {
    const gate = new ToolApprovalGate({ requireApproval: ['run_shell'], timeoutMs: 5000 });
    const promise = gate.check('run_shell', { command: 'ls' });
    const pending = gate.getPending();
    expect(pending.length).toBe(1);
    gate.resolve(pending[0]!.id, true);
    const result = await promise;
    expect(result.allowed).toBe(true);
  });

  it('blocks when approval is rejected', async () => {
    const gate = new ToolApprovalGate({ requireApproval: ['run_shell'], timeoutMs: 5000 });
    const promise = gate.check('run_shell', { command: 'ls' });
    const pending = gate.getPending();
    gate.resolve(pending[0]!.id, false, 'Not safe');
    const result = await promise;
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Not safe');
  });
});
