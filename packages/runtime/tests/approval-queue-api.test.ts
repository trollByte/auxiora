import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ApprovalQueue } from '@auxiora/approval-queue';
import type { ApprovalRequest } from '@auxiora/approval-queue';
import { Router } from 'express';

function createApprovalQueueRouter(approvalQueue: ApprovalQueue) {
  const router = Router();

  router.get('/', (_req: any, res: any) => {
    res.json(approvalQueue.listAll());
  });

  router.get('/pending', (_req: any, res: any) => {
    res.json(approvalQueue.listPending());
  });

  router.post('/expire', (_req: any, res: any) => {
    const expired = approvalQueue.expireStale();
    res.json({ expired });
  });

  router.get('/:id', (req: any, res: any) => {
    const result = approvalQueue.get(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Approval request not found' });
    }
    res.json(result);
  });

  router.post('/:id/approve', (req: any, res: any) => {
    try {
      const { decidedBy } = req.body as { decidedBy?: string; reason?: string };
      const result = approvalQueue.approve(req.params.id, decidedBy);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('already')) {
        return res.status(409).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  router.post('/:id/deny', (req: any, res: any) => {
    try {
      const { decidedBy, reason } = req.body as { decidedBy?: string; reason?: string };
      const result = approvalQueue.deny(req.params.id, reason, decidedBy);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      if (message.includes('already')) {
        return res.status(409).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  return router;
}

function submitTestRequest(queue: ApprovalQueue): string {
  return queue.submit({
    toolName: 'file_delete',
    params: { path: '/tmp/test.txt' },
    description: 'Delete a temporary file',
    riskLevel: 'medium',
    requestedBy: 'user-1',
  });
}

describe('Approval Queue REST API', () => {
  let app: express.Express;
  let queue: ApprovalQueue;

  beforeEach(() => {
    queue = new ApprovalQueue();
    app = express();
    app.use(express.json());
    app.use('/api/v1/approvals', createApprovalQueueRouter(queue));
  });

  // --- GET / ---

  describe('GET /', () => {
    it('returns empty list when no requests exist', async () => {
      const res = await request(app).get('/api/v1/approvals');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all approval requests', async () => {
      submitTestRequest(queue);
      submitTestRequest(queue);

      const res = await request(app).get('/api/v1/approvals');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].status).toBe('pending');
    });

    it('includes approved and denied requests', async () => {
      const id1 = submitTestRequest(queue);
      const id2 = submitTestRequest(queue);
      submitTestRequest(queue);
      queue.approve(id1, 'admin');
      queue.deny(id2, 'Not allowed', 'admin');

      const res = await request(app).get('/api/v1/approvals');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      const statuses = res.body.map((r: ApprovalRequest) => r.status);
      expect(statuses).toContain('approved');
      expect(statuses).toContain('denied');
      expect(statuses).toContain('pending');
    });
  });

  // --- GET /pending ---

  describe('GET /pending', () => {
    it('returns empty list when no pending requests', async () => {
      const id = submitTestRequest(queue);
      queue.approve(id, 'admin');

      const res = await request(app).get('/api/v1/approvals/pending');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns only pending requests', async () => {
      submitTestRequest(queue);
      const id2 = submitTestRequest(queue);
      queue.approve(id2, 'admin');

      const res = await request(app).get('/api/v1/approvals/pending');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('pending');
    });
  });

  // --- GET /:id ---

  describe('GET /:id', () => {
    it('returns a specific approval request', async () => {
      const id = submitTestRequest(queue);

      const res = await request(app).get(`/api/v1/approvals/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.toolName).toBe('file_delete');
      expect(res.body.status).toBe('pending');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/v1/approvals/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Approval request not found');
    });
  });

  // --- POST /:id/approve ---

  describe('POST /:id/approve', () => {
    it('approves a pending request', async () => {
      const id = submitTestRequest(queue);

      const res = await request(app)
        .post(`/api/v1/approvals/${id}/approve`)
        .send({ decidedBy: 'admin' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
      expect(res.body.decidedBy).toBe('admin');
      expect(res.body.decidedAt).toBeDefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/v1/approvals/nonexistent/approve')
        .send({ decidedBy: 'admin' });
      expect(res.status).toBe(404);
    });

    it('returns 409 when already decided', async () => {
      const id = submitTestRequest(queue);
      queue.approve(id, 'admin');

      const res = await request(app)
        .post(`/api/v1/approvals/${id}/approve`)
        .send({ decidedBy: 'other' });
      expect(res.status).toBe(409);
    });
  });

  // --- POST /:id/deny ---

  describe('POST /:id/deny', () => {
    it('denies a pending request', async () => {
      const id = submitTestRequest(queue);

      const res = await request(app)
        .post(`/api/v1/approvals/${id}/deny`)
        .send({ decidedBy: 'admin', reason: 'Too risky' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('denied');
      expect(res.body.decidedBy).toBe('admin');
      expect(res.body.denyReason).toBe('Too risky');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/v1/approvals/nonexistent/deny')
        .send({ decidedBy: 'admin', reason: 'Nope' });
      expect(res.status).toBe(404);
    });

    it('returns 409 when already decided', async () => {
      const id = submitTestRequest(queue);
      queue.deny(id, 'Already denied', 'admin');

      const res = await request(app)
        .post(`/api/v1/approvals/${id}/deny`)
        .send({ decidedBy: 'other', reason: 'Also deny' });
      expect(res.status).toBe(409);
    });
  });

  // --- POST /expire ---

  describe('POST /expire', () => {
    it('returns zero when no stale requests', async () => {
      submitTestRequest(queue);

      const res = await request(app).post('/api/v1/approvals/expire').send({});
      expect(res.status).toBe(200);
      expect(res.body.expired).toBe(0);
    });

    it('expires stale requests', async () => {
      const id = queue.submit({
        toolName: 'file_delete',
        params: { path: '/tmp/old.txt' },
        description: 'Old request',
        riskLevel: 'low',
        requestedBy: 'user-1',
        expiresAt: Date.now() - 1000,
      });

      const res = await request(app).post('/api/v1/approvals/expire').send({});
      expect(res.status).toBe(200);
      expect(res.body.expired).toBe(1);

      // Verify the request is now expired
      const getRes = await request(app).get(`/api/v1/approvals/${id}`);
      expect(getRes.body.status).toBe('expired');
    });
  });
});
