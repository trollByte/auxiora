import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalQueue } from '../src/approval-queue.js';
import type { ApprovalRequest } from '../src/types.js';

describe('ApprovalQueue', () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  describe('submit', () => {
    it('should create a pending request with a generated ID', () => {
      const id = queue.submit({
        toolName: 'sendEmail',
        params: { to: 'user@example.com' },
        description: 'Send an email',
        riskLevel: 'high',
        requestedBy: 'agent-1',
      });

      expect(id).toBeTruthy();
      const request = queue.get(id);
      expect(request).toBeDefined();
      expect(request!.status).toBe('pending');
      expect(request!.toolName).toBe('sendEmail');
      expect(request!.requestedAt).toBeGreaterThan(0);
    });

    it('should notify listeners on submit', () => {
      const listener = vi.fn();
      queue.onRequest(listener);

      queue.submit({
        toolName: 'readFile',
        params: { path: '/tmp/test' },
        description: 'Read a file',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'readFile', status: 'pending' }),
      );
    });

    it('should not throw if a listener errors', () => {
      queue.onRequest(() => {
        throw new Error('listener error');
      });

      expect(() =>
        queue.submit({
          toolName: 'test',
          params: {},
          description: 'test',
          riskLevel: 'low',
          requestedBy: 'agent-1',
        }),
      ).not.toThrow();
    });
  });

  describe('approve', () => {
    it('should mark request as approved', () => {
      const id = queue.submit({
        toolName: 'deploy',
        params: {},
        description: 'Deploy app',
        riskLevel: 'high',
        requestedBy: 'agent-1',
      });

      const result = queue.approve(id, 'admin');
      expect(result.status).toBe('approved');
      expect(result.decidedBy).toBe('admin');
      expect(result.decidedAt).toBeGreaterThan(0);
    });

    it('should throw for non-existent request', () => {
      expect(() => queue.approve('non-existent')).toThrow('not found');
    });

    it('should throw for already decided request', () => {
      const id = queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });
      queue.approve(id);
      expect(() => queue.approve(id)).toThrow('already approved');
    });
  });

  describe('deny', () => {
    it('should mark request as denied with reason', () => {
      const id = queue.submit({
        toolName: 'deleteDatabase',
        params: {},
        description: 'Drop all tables',
        riskLevel: 'critical',
        requestedBy: 'agent-1',
      });

      const result = queue.deny(id, 'Too dangerous', 'admin');
      expect(result.status).toBe('denied');
      expect(result.denyReason).toBe('Too dangerous');
      expect(result.decidedBy).toBe('admin');
    });
  });

  describe('listPending', () => {
    it('should return pending requests sorted by requestedAt', () => {
      const id1 = queue.submit({
        toolName: 'a',
        params: {},
        description: 'first',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });
      const id2 = queue.submit({
        toolName: 'b',
        params: {},
        description: 'second',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });
      queue.approve(id1);

      const pending = queue.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(id2);
    });
  });

  describe('listAll', () => {
    it('should return all requests with optional limit', () => {
      for (let i = 0; i < 5; i++) {
        queue.submit({
          toolName: `tool-${i}`,
          params: {},
          description: `action ${i}`,
          riskLevel: 'low',
          requestedBy: 'agent-1',
        });
      }

      expect(queue.listAll()).toHaveLength(5);
      expect(queue.listAll(3)).toHaveLength(3);
    });
  });

  describe('onRequest', () => {
    it('should return an unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = queue.onRequest(listener);

      queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      queue.submit({
        toolName: 'test2',
        params: {},
        description: 'test2',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('waitForDecision', () => {
    it('should resolve immediately if already decided', async () => {
      const id = queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });
      queue.approve(id);

      const result = await queue.waitForDecision(id);
      expect(result.status).toBe('approved');
    });

    it('should resolve when approved later', async () => {
      const id = queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });

      const promise = queue.waitForDecision(id);

      // Approve asynchronously
      setTimeout(() => queue.approve(id, 'admin'), 10);

      const result = await promise;
      expect(result.status).toBe('approved');
      expect(result.decidedBy).toBe('admin');
    });

    it('should resolve when denied later', async () => {
      const id = queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });

      const promise = queue.waitForDecision(id);
      setTimeout(() => queue.deny(id, 'nope'), 10);

      const result = await promise;
      expect(result.status).toBe('denied');
      expect(result.denyReason).toBe('nope');
    });

    it('should expire on timeout', async () => {
      const id = queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });

      const result = await queue.waitForDecision(id, 50);
      expect(result.status).toBe('expired');
    });

    it('should reject for non-existent request', async () => {
      await expect(queue.waitForDecision('non-existent')).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('expireStale', () => {
    it('should expire requests past their expiresAt', () => {
      const pastTime = Date.now() - 1000;
      queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
        expiresAt: pastTime,
      });

      const count = queue.expireStale();
      expect(count).toBe(1);

      const pending = queue.listPending();
      expect(pending).toHaveLength(0);
    });

    it('should not expire requests without expiresAt', () => {
      queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
      });

      const count = queue.expireStale();
      expect(count).toBe(0);

      const pending = queue.listPending();
      expect(pending).toHaveLength(1);
    });

    it('should resolve pending waitForDecision on expire', async () => {
      const pastTime = Date.now() - 1000;
      const id = queue.submit({
        toolName: 'test',
        params: {},
        description: 'test',
        riskLevel: 'low',
        requestedBy: 'agent-1',
        expiresAt: pastTime,
      });

      // Start waiting, then expire
      const promise = queue.waitForDecision(id);
      queue.expireStale();

      const result = await promise;
      expect(result.status).toBe('expired');
    });
  });
});
