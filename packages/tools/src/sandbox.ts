import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:sandbox');

export interface SandboxPolicy {
  /** Max execution time in ms. Default: 30000 */
  timeoutMs?: number;
  /** Max output size in bytes. Default: 1MB */
  maxOutputBytes?: number;
  /** Allowed tools (whitelist). If empty, all allowed. */
  allowedTools?: string[];
  /** Blocked tools (blacklist). Takes precedence over allowlist. */
  blockedTools?: string[];
  /** Max concurrent tool calls per session. Default: 5 */
  maxConcurrent?: number;
  /** Whether to allow network access (for web tools). Default: true */
  allowNetwork?: boolean;
  /** Whether to allow file system writes. Default: true */
  allowFileWrites?: boolean;
}

export interface SandboxedResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /** Sandbox-specific metadata */
  sandbox: {
    /** Whether the execution was terminated by timeout */
    timedOut: boolean;
    /** Whether output was truncated */
    truncated: boolean;
    /** Actual execution time in ms */
    executionMs: number;
    /** Policy that was applied */
    policyApplied: string[];
  };
}

const DEFAULT_POLICY: Required<SandboxPolicy> = {
  timeoutMs: 30_000,
  maxOutputBytes: 1_048_576, // 1MB
  allowedTools: [],
  blockedTools: [],
  maxConcurrent: 5,
  allowNetwork: true,
  allowFileWrites: true,
};

export class ToolSandbox {
  private readonly policy: Required<SandboxPolicy>;
  private activeCalls = new Map<string, number>(); // sessionId -> count

  constructor(policy?: SandboxPolicy) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /** Check if a tool is allowed by the policy */
  isToolAllowed(toolName: string): boolean {
    if (this.policy.blockedTools.includes(toolName)) return false;
    if (this.policy.allowedTools.length > 0 && !this.policy.allowedTools.includes(toolName)) return false;
    return true;
  }

  /** Check if a session has available concurrency slots */
  hasConcurrencySlot(sessionId: string): boolean {
    const current = this.activeCalls.get(sessionId) ?? 0;
    return current < this.policy.maxConcurrent;
  }

  /** Acquire a concurrency slot */
  acquireSlot(sessionId: string): boolean {
    const current = this.activeCalls.get(sessionId) ?? 0;
    if (current >= this.policy.maxConcurrent) return false;
    this.activeCalls.set(sessionId, current + 1);
    return true;
  }

  /** Release a concurrency slot */
  releaseSlot(sessionId: string): void {
    const current = this.activeCalls.get(sessionId) ?? 0;
    if (current <= 1) {
      this.activeCalls.delete(sessionId);
    } else {
      this.activeCalls.set(sessionId, current - 1);
    }
  }

  /**
   * Execute a tool function within the sandbox.
   * Enforces timeout, output size limits, and access controls.
   */
  async execute(
    toolName: string,
    sessionId: string,
    fn: () => Promise<{ success: boolean; output?: string; error?: string; metadata?: Record<string, unknown> }>,
  ): Promise<SandboxedResult> {
    const policiesApplied: string[] = [];
    const startTime = Date.now();

    // Check tool allowlist/blocklist
    if (!this.isToolAllowed(toolName)) {
      return {
        success: false,
        error: `Tool "${toolName}" is blocked by sandbox policy`,
        sandbox: { timedOut: false, truncated: false, executionMs: 0, policyApplied: ['blocked_tool'] },
      };
    }

    // Check concurrency
    if (!this.acquireSlot(sessionId)) {
      return {
        success: false,
        error: `Concurrency limit reached (${this.policy.maxConcurrent}) for session ${sessionId}`,
        sandbox: { timedOut: false, truncated: false, executionMs: 0, policyApplied: ['concurrency_limit'] },
      };
    }

    try {
      // Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SANDBOX_TIMEOUT')), this.policy.timeoutMs);
      });

      let result: { success: boolean; output?: string; error?: string; metadata?: Record<string, unknown> };
      let timedOut = false;

      try {
        result = await Promise.race([fn(), timeoutPromise]);
        policiesApplied.push('timeout_enforced');
      } catch (err) {
        if (err instanceof Error && err.message === 'SANDBOX_TIMEOUT') {
          timedOut = true;
          result = { success: false, error: `Tool "${toolName}" timed out after ${this.policy.timeoutMs}ms` };
          policiesApplied.push('timeout_triggered');
        } else {
          throw err;
        }
      }

      // Enforce output size
      let truncated = false;
      let output = result.output;
      if (output && output.length > this.policy.maxOutputBytes) {
        output = output.slice(0, this.policy.maxOutputBytes);
        truncated = true;
        policiesApplied.push('output_truncated');
      }

      const executionMs = Date.now() - startTime;

      logger.debug('Sandboxed tool execution complete', {
        toolName, sessionId, executionMs, timedOut, truncated,
      });

      return {
        success: result.success,
        output,
        error: result.error,
        metadata: result.metadata,
        sandbox: { timedOut, truncated, executionMs, policyApplied: policiesApplied },
      };
    } catch (err) {
      const executionMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Sandbox error: ${msg}`,
        sandbox: { timedOut: false, truncated: false, executionMs, policyApplied: policiesApplied },
      };
    } finally {
      this.releaseSlot(sessionId);
    }
  }

  /** Get current policy */
  getPolicy(): Required<SandboxPolicy> {
    return { ...this.policy };
  }

  /** Get active call count for a session */
  getActiveCount(sessionId: string): number {
    return this.activeCalls.get(sessionId) ?? 0;
  }
}
