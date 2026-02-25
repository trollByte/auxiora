import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { CanvasSession } from '@auxiora/canvas';

function createCanvasRouter(canvasSessions: Map<string, CanvasSession>) {
  const router = Router();

  router.post('/sessions', (req: any, res: any) => {
    const { width, height } = req.body as { width?: number; height?: number };
    const session = new CanvasSession({ width, height });
    canvasSessions.set(session.id, session);
    res.status(201).json({ id: session.id, ...session.getSize() });
  });

  router.get('/sessions/:id', (req: any, res: any) => {
    const session = canvasSessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ id: session.id, objects: session.getObjects(), size: session.getSize() });
  });

  router.post('/sessions/:id/objects', (req: any, res: any) => {
    const session = canvasSessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    try {
      const obj = session.addObject(req.body);
      res.status(201).json(obj);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.put('/sessions/:id/objects/:objectId', (req: any, res: any) => {
    const session = canvasSessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const updated = session.updateObject(req.params.objectId, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Object not found' });
    }
    res.json(updated);
  });

  router.delete('/sessions/:id/objects/:objectId', (req: any, res: any) => {
    const session = canvasSessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const removed = session.removeObject(req.params.objectId);
    if (!removed) {
      return res.status(404).json({ error: 'Object not found' });
    }
    res.json({ deleted: true });
  });

  router.delete('/sessions/:id', (req: any, res: any) => {
    const existed = canvasSessions.delete(req.params.id);
    if (!existed) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ deleted: true });
  });

  return router;
}

describe('Canvas REST API', () => {
  let app: express.Express;
  let canvasSessions: Map<string, CanvasSession>;

  beforeEach(() => {
    canvasSessions = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/v1/canvas', createCanvasRouter(canvasSessions));
  });

  describe('POST /sessions', () => {
    it('creates a new canvas session with default size', async () => {
      const res = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.width).toBe(1920);
      expect(res.body.height).toBe(1080);
    });

    it('creates a session with custom dimensions', async () => {
      const res = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({ width: 800, height: 600 });
      expect(res.status).toBe(201);
      expect(res.body.width).toBe(800);
      expect(res.body.height).toBe(600);
    });

    it('stores the session in the map', async () => {
      const res = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      expect(canvasSessions.has(res.body.id)).toBe(true);
    });
  });

  describe('GET /sessions/:id', () => {
    it('returns session state', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const id = createRes.body.id;

      const res = await request(app).get(`/api/v1/canvas/sessions/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.objects).toEqual([]);
      expect(res.body.size).toBeDefined();
      expect(res.body.size.width).toBe(1920);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/v1/canvas/sessions/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });

  describe('POST /sessions/:id/objects', () => {
    it('adds an object to a session', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const id = createRes.body.id;

      const res = await request(app)
        .post(`/api/v1/canvas/sessions/${id}/objects`)
        .send({
          type: 'text',
          x: 10,
          y: 20,
          width: 200,
          height: 50,
          visible: true,
          content: 'Hello',
          fontSize: 16,
          fontFamily: 'Arial',
          color: '#000000',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.type).toBe('text');
      expect(res.body.content).toBe('Hello');
      expect(res.body.zIndex).toBe(1);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app)
        .post('/api/v1/canvas/sessions/nonexistent/objects')
        .send({ type: 'text', x: 0, y: 0, width: 10, height: 10, visible: true });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /sessions/:id/objects/:objectId', () => {
    it('updates an existing object', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const sessionId = createRes.body.id;

      const addRes = await request(app)
        .post(`/api/v1/canvas/sessions/${sessionId}/objects`)
        .send({
          type: 'text',
          x: 10,
          y: 20,
          width: 200,
          height: 50,
          visible: true,
          content: 'Original',
          fontSize: 16,
          fontFamily: 'Arial',
          color: '#000',
        });
      const objectId = addRes.body.id;

      const res = await request(app)
        .put(`/api/v1/canvas/sessions/${sessionId}/objects/${objectId}`)
        .send({ x: 100, y: 200 });
      expect(res.status).toBe(200);
      expect(res.body.x).toBe(100);
      expect(res.body.y).toBe(200);
    });

    it('returns 404 for unknown object', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const sessionId = createRes.body.id;

      const res = await request(app)
        .put(`/api/v1/canvas/sessions/${sessionId}/objects/nonexistent`)
        .send({ x: 100 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Object not found');
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app)
        .put('/api/v1/canvas/sessions/nonexistent/objects/obj1')
        .send({ x: 100 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });

  describe('DELETE /sessions/:id/objects/:objectId', () => {
    it('removes an object from a session', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const sessionId = createRes.body.id;

      const addRes = await request(app)
        .post(`/api/v1/canvas/sessions/${sessionId}/objects`)
        .send({
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          visible: true,
          content: 'Remove me',
          fontSize: 14,
          fontFamily: 'Arial',
          color: '#000',
        });
      const objectId = addRes.body.id;

      const res = await request(app)
        .delete(`/api/v1/canvas/sessions/${sessionId}/objects/${objectId}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      // Verify object is gone
      const getRes = await request(app).get(`/api/v1/canvas/sessions/${sessionId}`);
      expect(getRes.body.objects).toHaveLength(0);
    });

    it('returns 404 for unknown object', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const sessionId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/v1/canvas/sessions/${sessionId}/objects/nonexistent`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Object not found');
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('deletes a session', async () => {
      const createRes = await request(app)
        .post('/api/v1/canvas/sessions')
        .send({});
      const id = createRes.body.id;

      const res = await request(app).delete(`/api/v1/canvas/sessions/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(canvasSessions.has(id)).toBe(false);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).delete('/api/v1/canvas/sessions/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
