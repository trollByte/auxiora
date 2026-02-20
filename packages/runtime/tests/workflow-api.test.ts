import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

interface MockWorkflowEngine {
  listAll: ReturnType<typeof vi.fn>;
  listActive: ReturnType<typeof vi.fn>;
  createWorkflow: ReturnType<typeof vi.fn>;
  getWorkflow: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
  startWorkflow: ReturnType<typeof vi.fn>;
  cancelWorkflow: ReturnType<typeof vi.fn>;
}

interface MockApprovalManager {
  getPending: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  reject: ReturnType<typeof vi.fn>;
}

function createWorkflowRouter(
  workflowEngine?: MockWorkflowEngine,
  approvalManager?: MockApprovalManager,
) {
  const router = Router();

  // Static routes before parameterized /:id routes

  router.get('/', async (_req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const workflows = await workflowEngine.listAll();
      res.json({ workflows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const workflow = await workflowEngine.createWorkflow(req.body);
      res.json(workflow);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/active', async (_req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const workflows = await workflowEngine.listActive();
      res.json({ workflows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/approvals/pending', async (req: any, res: any) => {
    if (!approvalManager) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const approvals = await approvalManager.getPending(req.query.userId);
      res.json({ approvals });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/approvals/:id/approve', async (req: any, res: any) => {
    if (!approvalManager) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const approval = await approvalManager.approve(req.params.id, req.body.decidedBy, req.body.reason);
      if (!approval) return res.status(404).json({ error: 'Approval not found' });
      res.json(approval);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/approvals/:id/reject', async (req: any, res: any) => {
    if (!approvalManager) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const rejection = await approvalManager.reject(req.params.id, req.body.decidedBy, req.body.reason);
      if (!rejection) return res.status(404).json({ error: 'Approval not found' });
      res.json(rejection);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', async (req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const workflow = await workflowEngine.getWorkflow(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      res.json(workflow);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/status', async (req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const status = await workflowEngine.getStatus(req.params.id);
      if (!status) return res.status(404).json({ error: 'Workflow not found' });
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/start', async (req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const workflow = await workflowEngine.startWorkflow(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      res.json(workflow);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/cancel', async (req: any, res: any) => {
    if (!workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
    try {
      const result = await workflowEngine.cancelWorkflow(req.params.id);
      if (!result) return res.status(404).json({ error: 'Workflow not found' });
      res.json({ cancelled: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

describe('Workflow REST API', () => {
  describe('with workflow engine enabled', () => {
    let app: express.Express;
    let mockEngine: MockWorkflowEngine;
    let mockApprovals: MockApprovalManager;

    beforeEach(() => {
      mockEngine = {
        listAll: vi.fn().mockResolvedValue([]),
        listActive: vi.fn().mockResolvedValue([]),
        createWorkflow: vi.fn().mockResolvedValue({ id: 'wf-1', name: 'Test' }),
        getWorkflow: vi.fn().mockResolvedValue(null),
        getStatus: vi.fn().mockResolvedValue(null),
        startWorkflow: vi.fn().mockResolvedValue(null),
        cancelWorkflow: vi.fn().mockResolvedValue(null),
      };
      mockApprovals = {
        getPending: vi.fn().mockResolvedValue([]),
        approve: vi.fn().mockResolvedValue(null),
        reject: vi.fn().mockResolvedValue(null),
      };
      app = express();
      app.use(express.json());
      app.use('/api/v1/workflows', createWorkflowRouter(mockEngine, mockApprovals));
    });

    // --- List all ---
    it('GET / returns all workflows', async () => {
      mockEngine.listAll.mockResolvedValue([{ id: 'wf-1' }, { id: 'wf-2' }]);
      const res = await request(app).get('/api/v1/workflows');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ workflows: [{ id: 'wf-1' }, { id: 'wf-2' }] });
    });

    it('GET / returns 500 on error', async () => {
      mockEngine.listAll.mockRejectedValue(new Error('db down'));
      const res = await request(app).get('/api/v1/workflows');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'db down' });
    });

    // --- Create ---
    it('POST / creates a workflow', async () => {
      const body = { name: 'Deploy', createdBy: 'user-1', steps: [] };
      mockEngine.createWorkflow.mockResolvedValue({ id: 'wf-new', ...body });
      const res = await request(app).post('/api/v1/workflows').send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'wf-new', ...body });
      expect(mockEngine.createWorkflow).toHaveBeenCalledWith(body);
    });

    // --- List active ---
    it('GET /active returns active workflows', async () => {
      mockEngine.listActive.mockResolvedValue([{ id: 'wf-3', status: 'active' }]);
      const res = await request(app).get('/api/v1/workflows/active');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ workflows: [{ id: 'wf-3', status: 'active' }] });
    });

    // --- Get by ID ---
    it('GET /:id returns workflow', async () => {
      mockEngine.getWorkflow.mockResolvedValue({ id: 'wf-1', name: 'Test' });
      const res = await request(app).get('/api/v1/workflows/wf-1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'wf-1', name: 'Test' });
    });

    it('GET /:id returns 404 when not found', async () => {
      mockEngine.getWorkflow.mockResolvedValue(null);
      const res = await request(app).get('/api/v1/workflows/wf-missing');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workflow not found' });
    });

    // --- Get status ---
    it('GET /:id/status returns workflow status', async () => {
      mockEngine.getStatus.mockResolvedValue({ state: 'running', progress: 50 });
      const res = await request(app).get('/api/v1/workflows/wf-1/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ state: 'running', progress: 50 });
    });

    it('GET /:id/status returns 404 when not found', async () => {
      mockEngine.getStatus.mockResolvedValue(null);
      const res = await request(app).get('/api/v1/workflows/wf-missing/status');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workflow not found' });
    });

    // --- Start ---
    it('POST /:id/start starts a workflow', async () => {
      mockEngine.startWorkflow.mockResolvedValue({ id: 'wf-1', status: 'running' });
      const res = await request(app).post('/api/v1/workflows/wf-1/start');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'wf-1', status: 'running' });
    });

    it('POST /:id/start returns 404 when not found', async () => {
      mockEngine.startWorkflow.mockResolvedValue(null);
      const res = await request(app).post('/api/v1/workflows/wf-missing/start');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workflow not found' });
    });

    // --- Cancel ---
    it('POST /:id/cancel cancels a workflow', async () => {
      mockEngine.cancelWorkflow.mockResolvedValue(true);
      const res = await request(app).post('/api/v1/workflows/wf-1/cancel');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cancelled: true });
    });

    it('POST /:id/cancel returns 404 when not found', async () => {
      mockEngine.cancelWorkflow.mockResolvedValue(null);
      const res = await request(app).post('/api/v1/workflows/wf-missing/cancel');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workflow not found' });
    });

    // --- Approvals ---
    it('GET /approvals/pending returns pending approvals', async () => {
      mockApprovals.getPending.mockResolvedValue([{ id: 'apr-1' }]);
      const res = await request(app).get('/api/v1/workflows/approvals/pending');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ approvals: [{ id: 'apr-1' }] });
    });

    it('GET /approvals/pending passes userId query param', async () => {
      mockApprovals.getPending.mockResolvedValue([]);
      const res = await request(app).get('/api/v1/workflows/approvals/pending?userId=user-1');
      expect(res.status).toBe(200);
      expect(mockApprovals.getPending).toHaveBeenCalledWith('user-1');
    });

    it('POST /approvals/:id/approve approves an approval', async () => {
      mockApprovals.approve.mockResolvedValue({ id: 'apr-1', status: 'approved' });
      const res = await request(app)
        .post('/api/v1/workflows/approvals/apr-1/approve')
        .send({ decidedBy: 'admin', reason: 'Looks good' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'apr-1', status: 'approved' });
      expect(mockApprovals.approve).toHaveBeenCalledWith('apr-1', 'admin', 'Looks good');
    });

    it('POST /approvals/:id/approve returns 404 when not found', async () => {
      mockApprovals.approve.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/v1/workflows/approvals/apr-missing/approve')
        .send({ decidedBy: 'admin' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Approval not found' });
    });

    it('POST /approvals/:id/reject rejects an approval', async () => {
      mockApprovals.reject.mockResolvedValue({ id: 'apr-1', status: 'rejected' });
      const res = await request(app)
        .post('/api/v1/workflows/approvals/apr-1/reject')
        .send({ decidedBy: 'admin', reason: 'Not ready' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'apr-1', status: 'rejected' });
      expect(mockApprovals.reject).toHaveBeenCalledWith('apr-1', 'admin', 'Not ready');
    });

    it('POST /approvals/:id/reject returns 404 when not found', async () => {
      mockApprovals.reject.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/v1/workflows/approvals/apr-missing/reject')
        .send({ decidedBy: 'admin' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Approval not found' });
    });
  });

  describe('without workflow engine (not initialized)', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/workflows', createWorkflowRouter(undefined, undefined));
    });

    it('GET / returns 503', async () => {
      const res = await request(app).get('/api/v1/workflows');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('POST / returns 503', async () => {
      const res = await request(app).post('/api/v1/workflows').send({ name: 'Test' });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('GET /active returns 503', async () => {
      const res = await request(app).get('/api/v1/workflows/active');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('GET /:id returns 503', async () => {
      const res = await request(app).get('/api/v1/workflows/wf-1');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('GET /:id/status returns 503', async () => {
      const res = await request(app).get('/api/v1/workflows/wf-1/status');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('POST /:id/start returns 503', async () => {
      const res = await request(app).post('/api/v1/workflows/wf-1/start');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('POST /:id/cancel returns 503', async () => {
      const res = await request(app).post('/api/v1/workflows/wf-1/cancel');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('GET /approvals/pending returns 503', async () => {
      const res = await request(app).get('/api/v1/workflows/approvals/pending');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('POST /approvals/:id/approve returns 503', async () => {
      const res = await request(app)
        .post('/api/v1/workflows/approvals/apr-1/approve')
        .send({ decidedBy: 'admin' });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });

    it('POST /approvals/:id/reject returns 503', async () => {
      const res = await request(app)
        .post('/api/v1/workflows/approvals/apr-1/reject')
        .send({ decidedBy: 'admin' });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Workflow engine not initialized' });
    });
  });
});
