import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { BranchManager } from '@auxiora/conversation-branch';
import { Router } from 'express';

function createBranchRouter(managers: Map<string, BranchManager>) {
  const router = Router();

  const getOrCreateManager = (conversationId: string): BranchManager => {
    let mgr = managers.get(conversationId);
    if (!mgr) {
      mgr = new BranchManager(conversationId);
      managers.set(conversationId, mgr);
    }
    return mgr;
  };

  router.get('/:conversationId', (req: any, res: any) => {
    const mgr = getOrCreateManager(req.params.conversationId);
    res.json({ branches: mgr.listBranches(), active: mgr.getActiveBranch() });
  });

  router.post('/:conversationId/fork', (req: any, res: any) => {
    const mgr = getOrCreateManager(req.params.conversationId);
    const { messageId, label } = req.body;
    try {
      const branch = mgr.fork(messageId, label);
      res.status(201).json(branch);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/:conversationId/switch', (req: any, res: any) => {
    const mgr = getOrCreateManager(req.params.conversationId);
    const { branchId } = req.body;
    if (!branchId || typeof branchId !== 'string') {
      return res.status(400).json({ error: 'branchId required' });
    }
    try {
      const branch = mgr.switchBranch(branchId);
      res.json(branch);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/:conversationId/tree', (req: any, res: any) => {
    const mgr = getOrCreateManager(req.params.conversationId);
    res.json({ tree: mgr.getTree() });
  });

  router.post('/:conversationId/merge', (req: any, res: any) => {
    const mgr = getOrCreateManager(req.params.conversationId);
    const { sourceBranchId, targetBranchId } = req.body;
    if (!sourceBranchId || typeof sourceBranchId !== 'string') {
      return res.status(400).json({ error: 'sourceBranchId required' });
    }
    if (!targetBranchId || typeof targetBranchId !== 'string') {
      return res.status(400).json({ error: 'targetBranchId required' });
    }
    try {
      mgr.mergeBranch(sourceBranchId, targetBranchId);
      res.json({ merged: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.delete('/:conversationId/:branchId', (req: any, res: any) => {
    const mgr = getOrCreateManager(req.params.conversationId);
    try {
      mgr.deleteBranch(req.params.branchId);
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('Branch REST API', () => {
  let app: express.Express;
  let managers: Map<string, BranchManager>;

  beforeEach(() => {
    managers = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/v1/branches', createBranchRouter(managers));
  });

  describe('GET /:conversationId', () => {
    it('creates a new manager and returns initial state', async () => {
      const res = await request(app).get('/api/v1/branches/conv-1');
      expect(res.status).toBe(200);
      expect(res.body.branches).toHaveLength(1);
      expect(res.body.active).toBeDefined();
      expect(res.body.active.isActive).toBe(true);
    });

    it('returns same manager on subsequent calls', async () => {
      await request(app).get('/api/v1/branches/conv-2');
      const res = await request(app).get('/api/v1/branches/conv-2');
      expect(res.status).toBe(200);
      expect(res.body.branches).toHaveLength(1);
      expect(managers.size).toBe(1);
    });
  });

  describe('POST /:conversationId/fork', () => {
    it('forks from a message', async () => {
      const mgr = new BranchManager('conv-fork');
      const msg = mgr.addMessage({ role: 'user', content: 'Hello' });
      managers.set('conv-fork', mgr);

      const res = await request(app)
        .post('/api/v1/branches/conv-fork/fork')
        .send({ messageId: msg.id, label: 'alt-path' });
      expect(res.status).toBe(201);
      expect(res.body.label).toBe('alt-path');
      expect(res.body.forkMessageId).toBe(msg.id);
    });

    it('returns 400 for invalid message ID', async () => {
      const mgr = new BranchManager('conv-bad-fork');
      managers.set('conv-bad-fork', mgr);

      const res = await request(app)
        .post('/api/v1/branches/conv-bad-fork/fork')
        .send({ messageId: 'nonexistent' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('POST /:conversationId/switch', () => {
    it('switches to an existing branch', async () => {
      const mgr = new BranchManager('conv-switch');
      const msg = mgr.addMessage({ role: 'user', content: 'Hi' });
      const forked = mgr.fork(msg.id);
      const rootBranch = mgr.listBranches().find(b => b.id !== forked.id)!;
      managers.set('conv-switch', mgr);

      const res = await request(app)
        .post('/api/v1/branches/conv-switch/switch')
        .send({ branchId: rootBranch.id });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(rootBranch.id);
      expect(res.body.isActive).toBe(true);
    });

    it('returns 400 when branchId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/branches/conv-switch2/switch')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('branchId required');
    });

    it('returns 400 for nonexistent branch', async () => {
      const mgr = new BranchManager('conv-switch3');
      managers.set('conv-switch3', mgr);

      const res = await request(app)
        .post('/api/v1/branches/conv-switch3/switch')
        .send({ branchId: 'nonexistent' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /:conversationId/tree', () => {
    it('returns the conversation tree', async () => {
      const res = await request(app).get('/api/v1/branches/conv-tree/tree');
      expect(res.status).toBe(200);
      expect(res.body.tree).toBeDefined();
      expect(res.body.tree.rootBranchId).toBeTruthy();
    });
  });

  describe('POST /:conversationId/merge', () => {
    it('merges branches', async () => {
      const mgr = new BranchManager('conv-merge');
      const msg = mgr.addMessage({ role: 'user', content: 'Base message' });
      const forked = mgr.fork(msg.id);
      mgr.addMessage({ role: 'assistant', content: 'Forked reply' });
      const rootBranch = mgr.listBranches().find(b => b.id !== forked.id)!;
      managers.set('conv-merge', mgr);

      const res = await request(app)
        .post('/api/v1/branches/conv-merge/merge')
        .send({ sourceBranchId: forked.id, targetBranchId: rootBranch.id });
      expect(res.status).toBe(200);
      expect(res.body.merged).toBe(true);
    });

    it('returns 400 when sourceBranchId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/branches/conv-merge2/merge')
        .send({ targetBranchId: 'some-id' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('sourceBranchId required');
    });

    it('returns 400 when targetBranchId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/branches/conv-merge3/merge')
        .send({ sourceBranchId: 'some-id' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('targetBranchId required');
    });

    it('returns 400 for nonexistent branches', async () => {
      const mgr = new BranchManager('conv-merge4');
      managers.set('conv-merge4', mgr);

      const res = await request(app)
        .post('/api/v1/branches/conv-merge4/merge')
        .send({ sourceBranchId: 'nonexistent', targetBranchId: 'also-nonexistent' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('DELETE /:conversationId/:branchId', () => {
    it('deletes a branch', async () => {
      const mgr = new BranchManager('conv-del');
      const msg = mgr.addMessage({ role: 'user', content: 'First' });
      const forked = mgr.fork(msg.id);
      managers.set('conv-del', mgr);

      const res = await request(app)
        .delete(`/api/v1/branches/conv-del/${forked.id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('returns 400 when deleting root branch', async () => {
      const mgr = new BranchManager('conv-del-root');
      const rootId = mgr.getActiveBranch().id;
      managers.set('conv-del-root', mgr);

      const res = await request(app)
        .delete(`/api/v1/branches/conv-del-root/${rootId}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot delete root branch');
    });

    it('returns 400 for nonexistent branch', async () => {
      const mgr = new BranchManager('conv-del-bad');
      managers.set('conv-del-bad', mgr);

      const res = await request(app)
        .delete('/api/v1/branches/conv-del-bad/nonexistent');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not found');
    });
  });
});
