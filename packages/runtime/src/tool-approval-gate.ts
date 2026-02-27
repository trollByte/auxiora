/**
 * ToolApprovalGate — interactive approval gate for sensitive tool invocations.
 *
 * Tools listed in `requireApproval` are held pending until a human resolves
 * them (approve / reject) or the timeout expires.
 */

import * as crypto from 'node:crypto';

// ── Types ───────────────────────────────────────────────────────────

export interface ToolApprovalGateConfig {
  /** Tool names that require explicit approval before execution. */
  requireApproval: string[];
  /** Milliseconds before an unresolved request is auto-rejected. Default: 30 000. */
  timeoutMs?: number;
}

export interface ApprovalCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface PendingApproval {
  id: string;
  toolName: string;
  args: unknown;
  createdAt: number;
}

interface PendingEntry {
  request: PendingApproval;
  resolve: (result: ApprovalCheckResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return 'apr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// ── Gate ────────────────────────────────────────────────────────────

export class ToolApprovalGate {
  private readonly requireApproval: Set<string>;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, PendingEntry>();

  constructor(config: ToolApprovalGateConfig) {
    this.requireApproval = new Set(config.requireApproval);
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /**
   * Check whether a tool call is allowed.
   *
   * If the tool is not in the approval list the returned promise resolves
   * immediately with `{ allowed: true }`.  Otherwise a pending approval
   * request is created and the promise resolves when `resolve()` is called
   * or the timeout expires.
   */
  async check(toolName: string, args: unknown): Promise<ApprovalCheckResult> {
    if (!this.requireApproval.has(toolName)) {
      return { allowed: true };
    }

    return new Promise<ApprovalCheckResult>((promiseResolve) => {
      const id = generateId();
      const request: PendingApproval = {
        id,
        toolName,
        args,
        createdAt: Date.now(),
      };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        promiseResolve({ allowed: false, reason: `Approval timeout after ${this.timeoutMs}ms` });
      }, this.timeoutMs);

      this.pending.set(id, { request, resolve: promiseResolve, timer });
    });
  }

  /** Return a snapshot of all pending approval requests. */
  getPending(): PendingApproval[] {
    return [...this.pending.values()].map((e) => e.request);
  }

  /**
   * Resolve a pending approval request.
   *
   * @returns The resolved request, or `undefined` if the id was not found.
   */
  resolve(id: string, approved: boolean, comment?: string): PendingApproval | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;

    clearTimeout(entry.timer);
    this.pending.delete(id);

    if (approved) {
      entry.resolve({ allowed: true });
    } else {
      entry.resolve({ allowed: false, reason: comment ?? 'Rejected' });
    }

    return entry.request;
  }
}
