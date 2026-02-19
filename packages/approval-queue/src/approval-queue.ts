import { randomUUID } from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { AuxioraError, ErrorCode } from '@auxiora/errors';
import type { ApprovalRequest, ApprovalStatus } from './types.js';

const logger = getLogger('approval-queue');

const MAX_QUEUE_SIZE = 1000;

interface PendingDecision {
  resolve: (request: ApprovalRequest) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class ApprovalQueue {
  private queue = new Map<string, ApprovalRequest>();
  private listeners = new Set<(request: ApprovalRequest) => void>();
  private pendingDecisions = new Map<string, PendingDecision>();

  submit(
    request: Omit<ApprovalRequest, 'id' | 'status' | 'requestedAt'>,
  ): string {
    this.expireStale();
    this.enforceMaxSize();

    const id = randomUUID();
    const fullRequest: ApprovalRequest = {
      ...request,
      id,
      status: 'pending',
      requestedAt: Date.now(),
    };

    this.queue.set(id, fullRequest);
    logger.info(`Approval request submitted: ${id} for tool ${request.toolName}`);

    for (const listener of this.listeners) {
      try {
        listener(fullRequest);
      } catch (err) {
        logger.warn('Listener threw during notification', { error: err });
      }
    }

    return id;
  }

  approve(id: string, decidedBy?: string): ApprovalRequest {
    return this.decide(id, 'approved', decidedBy);
  }

  deny(id: string, reason?: string, decidedBy?: string): ApprovalRequest {
    return this.decide(id, 'denied', decidedBy, reason);
  }

  get(id: string): ApprovalRequest | undefined {
    return this.queue.get(id);
  }

  listPending(): ApprovalRequest[] {
    return [...this.queue.values()]
      .filter((r) => r.status === 'pending')
      .sort((a, b) => a.requestedAt - b.requestedAt);
  }

  listAll(limit?: number): ApprovalRequest[] {
    const all = [...this.queue.values()].sort(
      (a, b) => b.requestedAt - a.requestedAt,
    );
    return limit !== undefined ? all.slice(0, limit) : all;
  }

  onRequest(listener: (request: ApprovalRequest) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  waitForDecision(id: string, timeoutMs?: number): Promise<ApprovalRequest> {
    const request = this.queue.get(id);
    if (!request) {
      return Promise.reject(
        new AuxioraError({
          code: ErrorCode.INVALID_INPUT,
          message: `Approval request not found: ${id}`,
          retryable: false,
        }),
      );
    }

    if (request.status !== 'pending') {
      return Promise.resolve(request);
    }

    return new Promise<ApprovalRequest>((resolve, reject) => {
      const pending: PendingDecision = { resolve, reject };

      if (timeoutMs !== undefined) {
        pending.timer = setTimeout(() => {
          this.pendingDecisions.delete(id);
          const req = this.queue.get(id);
          if (req && req.status === 'pending') {
            req.status = 'expired';
            req.decidedAt = Date.now();
            resolve(req);
          } else if (req) {
            resolve(req);
          } else {
            reject(
              new AuxioraError({
                code: ErrorCode.INTERNAL_ERROR,
                message: `Approval request disappeared: ${id}`,
                retryable: false,
              }),
            );
          }
        }, timeoutMs);
      }

      this.pendingDecisions.set(id, pending);
    });
  }

  expireStale(): number {
    const now = Date.now();
    let count = 0;

    for (const request of this.queue.values()) {
      if (
        request.status === 'pending' &&
        request.expiresAt !== undefined &&
        request.expiresAt <= now
      ) {
        request.status = 'expired';
        request.decidedAt = now;
        count++;
        this.resolvePending(request);
      }
    }

    if (count > 0) {
      logger.info(`Expired ${count} stale approval requests`);
    }

    return count;
  }

  private decide(
    id: string,
    status: ApprovalStatus,
    decidedBy?: string,
    denyReason?: string,
  ): ApprovalRequest {
    const request = this.queue.get(id);
    if (!request) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: `Approval request not found: ${id}`,
        retryable: false,
      });
    }

    if (request.status !== 'pending') {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: `Approval request ${id} is already ${request.status}`,
        retryable: false,
      });
    }

    request.status = status;
    request.decidedAt = Date.now();
    if (decidedBy) request.decidedBy = decidedBy;
    if (denyReason) request.denyReason = denyReason;

    logger.info(`Approval request ${id} ${status}${decidedBy ? ` by ${decidedBy}` : ''}`);

    this.resolvePending(request);
    return request;
  }

  private resolvePending(request: ApprovalRequest): void {
    const pending = this.pendingDecisions.get(request.id);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      this.pendingDecisions.delete(request.id);
      pending.resolve(request);
    }
  }

  private enforceMaxSize(): void {
    if (this.queue.size < MAX_QUEUE_SIZE) return;

    const decided = [...this.queue.values()]
      .filter((r) => r.status !== 'pending')
      .sort((a, b) => (a.decidedAt ?? a.requestedAt) - (b.decidedAt ?? b.requestedAt));

    const toRemove = Math.max(decided.length, this.queue.size - MAX_QUEUE_SIZE + 1);
    for (let i = 0; i < toRemove && i < decided.length; i++) {
      this.queue.delete(decided[i].id);
    }
  }
}
