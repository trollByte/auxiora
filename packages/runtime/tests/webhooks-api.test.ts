import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

function createTestWebhooksRouter(manager: any) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    if (!manager) return res.status(503).json({ error: 'Webhooks not configured' });
    try {
      const webhooks = await manager.list();
      res.json({ webhooks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    if (!manager) return res.status(503).json({ error: 'Webhooks not configured' });
    try {
      const webhook = await manager.create(req.body);
      res.json(webhook);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', async (req, res) => {
    if (!manager) return res.status(503).json({ error: 'Webhooks not configured' });
    try {
      const updated = await manager.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Webhook not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!manager) return res.status(503).json({ error: 'Webhooks not configured' });
    try {
      const deleted = await manager.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Webhook not found' });
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

describe('Webhooks REST API', () => {
  let app: express.Express;

  describe('with no webhook manager', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/webhooks', createTestWebhooksRouter(null));
    });

    it('GET / returns 503 when webhooks not configured', async () => {
      const res = await request(app).get('/api/v1/webhooks');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Webhooks not configured');
    });

    it('POST / returns 503 when webhooks not configured', async () => {
      const res = await request(app).post('/api/v1/webhooks').send({ name: 'test' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Webhooks not configured');
    });

    it('PUT /:id returns 503 when webhooks not configured', async () => {
      const res = await request(app).put('/api/v1/webhooks/wh-1').send({ name: 'updated' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Webhooks not configured');
    });

    it('DELETE /:id returns 503 when webhooks not configured', async () => {
      const res = await request(app).delete('/api/v1/webhooks/wh-1');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Webhooks not configured');
    });
  });

  describe('with webhook manager', () => {
    const mockWebhook = { id: 'wh-1', name: 'Test Hook', type: 'generic', enabled: true, secret: 'abc123' };
    const mockManager = {
      list: async () => [mockWebhook],
      create: async (opts: any) => ({ id: 'wh-2', ...opts, enabled: true }),
      update: async (id: string, updates: any) => {
        if (id === 'wh-1') return { ...mockWebhook, ...updates };
        return null;
      },
      delete: async (id: string) => id === 'wh-1',
    };

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/webhooks', createTestWebhooksRouter(mockManager));
    });

    it('GET / returns list of webhooks', async () => {
      const res = await request(app).get('/api/v1/webhooks');
      expect(res.status).toBe(200);
      expect(res.body.webhooks).toEqual([mockWebhook]);
    });

    it('POST / creates a webhook', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks')
        .send({ name: 'New Hook', type: 'generic', secret: 'sec' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('wh-2');
      expect(res.body.name).toBe('New Hook');
      expect(res.body.enabled).toBe(true);
    });

    it('PUT /:id updates an existing webhook', async () => {
      const res = await request(app)
        .put('/api/v1/webhooks/wh-1')
        .send({ name: 'Updated Hook' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Hook');
    });

    it('PUT /:id returns 404 for unknown webhook', async () => {
      const res = await request(app)
        .put('/api/v1/webhooks/wh-unknown')
        .send({ name: 'Nope' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Webhook not found');
    });

    it('DELETE /:id deletes an existing webhook', async () => {
      const res = await request(app).delete('/api/v1/webhooks/wh-1');
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('DELETE /:id returns 404 for unknown webhook', async () => {
      const res = await request(app).delete('/api/v1/webhooks/wh-unknown');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Webhook not found');
    });
  });

  describe('error handling', () => {
    const errorManager = {
      list: async () => { throw new Error('DB connection failed'); },
      create: async () => { throw new Error('Validation error'); },
      update: async () => { throw new Error('Update failed'); },
      delete: async () => { throw new Error('Delete failed'); },
    };

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/webhooks', createTestWebhooksRouter(errorManager));
    });

    it('GET / returns 500 on error', async () => {
      const res = await request(app).get('/api/v1/webhooks');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });

    it('POST / returns 500 on error', async () => {
      const res = await request(app).post('/api/v1/webhooks').send({ name: 'fail' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Validation error');
    });

    it('PUT /:id returns 500 on error', async () => {
      const res = await request(app).put('/api/v1/webhooks/wh-1').send({ name: 'fail' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Update failed');
    });

    it('DELETE /:id returns 500 on error', async () => {
      const res = await request(app).delete('/api/v1/webhooks/wh-1');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Delete failed');
    });
  });
});
