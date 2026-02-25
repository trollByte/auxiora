import { describe, it, expect, vi } from 'vitest';
import { ToolSandbox, type SandboxPolicy } from '../src/sandbox.js';

describe('ToolSandbox', () => {
  describe('isToolAllowed', () => {
    it('should return true for normal tools with default policy', () => {
      const sandbox = new ToolSandbox();
      expect(sandbox.isToolAllowed('bash')).toBe(true);
      expect(sandbox.isToolAllowed('web_browse')).toBe(true);
    });

    it('should return false for blocked tools', () => {
      const sandbox = new ToolSandbox({ blockedTools: ['bash', 'dangerous_tool'] });
      expect(sandbox.isToolAllowed('bash')).toBe(false);
      expect(sandbox.isToolAllowed('dangerous_tool')).toBe(false);
      expect(sandbox.isToolAllowed('safe_tool')).toBe(true);
    });

    it('should only allow listed tools when allowlist is set', () => {
      const sandbox = new ToolSandbox({ allowedTools: ['read_file', 'list_files'] });
      expect(sandbox.isToolAllowed('read_file')).toBe(true);
      expect(sandbox.isToolAllowed('list_files')).toBe(true);
      expect(sandbox.isToolAllowed('bash')).toBe(false);
    });

    it('should give blocklist precedence over allowlist', () => {
      const sandbox = new ToolSandbox({
        allowedTools: ['bash', 'read_file'],
        blockedTools: ['bash'],
      });
      expect(sandbox.isToolAllowed('bash')).toBe(false);
      expect(sandbox.isToolAllowed('read_file')).toBe(true);
    });
  });

  describe('hasConcurrencySlot', () => {
    it('should return true when below the limit', () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 3 });
      expect(sandbox.hasConcurrencySlot('session-1')).toBe(true);
    });

    it('should return false when at the limit', () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 2 });
      sandbox.acquireSlot('session-1');
      sandbox.acquireSlot('session-1');
      expect(sandbox.hasConcurrencySlot('session-1')).toBe(false);
    });
  });

  describe('acquireSlot / releaseSlot', () => {
    it('should manage counts correctly', () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 3 });
      expect(sandbox.getActiveCount('s1')).toBe(0);

      expect(sandbox.acquireSlot('s1')).toBe(true);
      expect(sandbox.getActiveCount('s1')).toBe(1);

      expect(sandbox.acquireSlot('s1')).toBe(true);
      expect(sandbox.getActiveCount('s1')).toBe(2);

      expect(sandbox.acquireSlot('s1')).toBe(true);
      expect(sandbox.getActiveCount('s1')).toBe(3);

      // At limit
      expect(sandbox.acquireSlot('s1')).toBe(false);
      expect(sandbox.getActiveCount('s1')).toBe(3);

      sandbox.releaseSlot('s1');
      expect(sandbox.getActiveCount('s1')).toBe(2);

      sandbox.releaseSlot('s1');
      sandbox.releaseSlot('s1');
      expect(sandbox.getActiveCount('s1')).toBe(0);
    });

    it('should track sessions independently', () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 1 });
      sandbox.acquireSlot('s1');
      expect(sandbox.hasConcurrencySlot('s1')).toBe(false);
      expect(sandbox.hasConcurrencySlot('s2')).toBe(true);
    });
  });

  describe('execute', () => {
    it('should run the function and return a sandboxed result', async () => {
      const sandbox = new ToolSandbox();
      const result = await sandbox.execute('test_tool', 'session-1', async () => ({
        success: true,
        output: 'hello',
        metadata: { key: 'value' },
      }));

      expect(result.success).toBe(true);
      expect(result.output).toBe('hello');
      expect(result.metadata).toEqual({ key: 'value' });
      expect(result.sandbox.timedOut).toBe(false);
      expect(result.sandbox.truncated).toBe(false);
      expect(result.sandbox.executionMs).toBeGreaterThanOrEqual(0);
      expect(result.sandbox.policyApplied).toContain('timeout_enforced');
    });

    it('should enforce timeout', async () => {
      const sandbox = new ToolSandbox({ timeoutMs: 50 });
      const result = await sandbox.execute('slow_tool', 'session-1', () =>
        new Promise((resolve) => setTimeout(() => resolve({ success: true, output: 'done' }), 200)),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.sandbox.timedOut).toBe(true);
      expect(result.sandbox.policyApplied).toContain('timeout_triggered');
    });

    it('should block disallowed tools without executing', async () => {
      const sandbox = new ToolSandbox({ blockedTools: ['evil_tool'] });
      const fn = vi.fn(async () => ({ success: true, output: 'should not run' }));

      const result = await sandbox.execute('evil_tool', 'session-1', fn);

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked by sandbox policy');
      expect(fn).not.toHaveBeenCalled();
      expect(result.sandbox.policyApplied).toContain('blocked_tool');
    });

    it('should enforce concurrency limit', async () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 1 });

      // Fill up the slot manually
      sandbox.acquireSlot('session-1');

      const result = await sandbox.execute('test_tool', 'session-1', async () => ({
        success: true,
        output: 'should not run',
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Concurrency limit reached');
      expect(result.sandbox.policyApplied).toContain('concurrency_limit');

      // Clean up
      sandbox.releaseSlot('session-1');
    });

    it('should truncate oversized output', async () => {
      const sandbox = new ToolSandbox({ maxOutputBytes: 10 });
      const result = await sandbox.execute('verbose_tool', 'session-1', async () => ({
        success: true,
        output: 'a'.repeat(100),
      }));

      expect(result.success).toBe(true);
      expect(result.output).toBe('a'.repeat(10));
      expect(result.sandbox.truncated).toBe(true);
      expect(result.sandbox.policyApplied).toContain('output_truncated');
    });

    it('should release slot on success', async () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 1 });

      await sandbox.execute('test_tool', 'session-1', async () => ({
        success: true,
        output: 'done',
      }));

      expect(sandbox.getActiveCount('session-1')).toBe(0);
      expect(sandbox.hasConcurrencySlot('session-1')).toBe(true);
    });

    it('should release slot on error', async () => {
      const sandbox = new ToolSandbox({ maxConcurrent: 1 });

      await sandbox.execute('bad_tool', 'session-1', async () => {
        throw new Error('tool crashed');
      });

      expect(sandbox.getActiveCount('session-1')).toBe(0);
      expect(sandbox.hasConcurrencySlot('session-1')).toBe(true);
    });

    it('should wrap unexpected errors in sandbox error result', async () => {
      const sandbox = new ToolSandbox();
      const result = await sandbox.execute('crash_tool', 'session-1', async () => {
        throw new Error('unexpected failure');
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sandbox error: unexpected failure');
      expect(result.sandbox.timedOut).toBe(false);
    });
  });

  describe('getPolicy', () => {
    it('should return a copy of the policy', () => {
      const sandbox = new ToolSandbox({ timeoutMs: 5000, blockedTools: ['bash'] });
      const policy = sandbox.getPolicy();

      expect(policy.timeoutMs).toBe(5000);
      expect(policy.blockedTools).toEqual(['bash']);
      expect(policy.maxOutputBytes).toBe(1_048_576); // default

      // Mutating the returned copy should not affect the sandbox
      policy.timeoutMs = 999;
      expect(sandbox.getPolicy().timeoutMs).toBe(5000);
    });
  });
});
