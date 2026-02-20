import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { VectorStore } from '@auxiora/vector-store';
import { Router } from 'express';

const DIMS = 3;

function createVectorRouter(vectorStore: VectorStore) {
  const router = Router();

  router.get('/stats', (_req: any, res: any) => {
    res.json({ size: vectorStore.size() });
  });

  router.post('/', (req: any, res: any) => {
    try {
      const { id, vector, content, metadata } = req.body as {
        id?: string;
        vector?: number[];
        content?: string;
        metadata?: Record<string, unknown>;
      };
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id required' });
      }
      if (!vector || !Array.isArray(vector)) {
        return res.status(400).json({ error: 'vector required' });
      }
      const entry = vectorStore.add(id, vector, content ?? '', metadata);
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/search', (req: any, res: any) => {
    try {
      const { vector, limit, minScore } = req.body as {
        vector?: number[];
        limit?: number;
        minScore?: number;
      };
      if (!vector || !Array.isArray(vector)) {
        return res.status(400).json({ error: 'vector required' });
      }
      const results = vectorStore.search(vector, limit, minScore);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/:id', (req: any, res: any) => {
    const entry = vectorStore.get(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Vector entry not found' });
    }
    res.json(entry);
  });

  router.delete('/:id', (req: any, res: any) => {
    const removed = vectorStore.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Vector entry not found' });
    }
    res.json({ deleted: true });
  });

  return router;
}

describe('Vector Store REST API', () => {
  let app: express.Express;
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore({ dimensions: DIMS, maxEntries: 1000 });
    app = express();
    app.use(express.json());
    app.use('/api/v1/vectors', createVectorRouter(store));
  });

  // --- POST / ---

  describe('POST /', () => {
    it('adds a vector entry', async () => {
      const res = await request(app)
        .post('/api/v1/vectors')
        .send({ id: 'v1', vector: [1, 0, 0], content: 'hello' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('v1');
      expect(res.body.vector).toEqual([1, 0, 0]);
      expect(res.body.content).toBe('hello');
      expect(res.body.createdAt).toBeDefined();
    });

    it('adds a vector entry with metadata', async () => {
      const res = await request(app)
        .post('/api/v1/vectors')
        .send({ id: 'v2', vector: [0, 1, 0], content: 'world', metadata: { source: 'test' } });
      expect(res.status).toBe(201);
      expect(res.body.metadata).toEqual({ source: 'test' });
    });

    it('returns 400 when id is missing', async () => {
      const res = await request(app)
        .post('/api/v1/vectors')
        .send({ vector: [1, 0, 0] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('id required');
    });

    it('returns 400 when vector is missing', async () => {
      const res = await request(app)
        .post('/api/v1/vectors')
        .send({ id: 'v1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('vector required');
    });

    it('returns 500 for wrong dimensions', async () => {
      const res = await request(app)
        .post('/api/v1/vectors')
        .send({ id: 'v1', vector: [1, 0] });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('dimensions');
    });
  });

  // --- POST /search ---

  describe('POST /search', () => {
    it('returns matching results', async () => {
      store.add('a', [1, 0, 0], 'first');
      store.add('b', [0, 1, 0], 'second');
      store.add('c', [1, 0.1, 0], 'similar to first');

      const res = await request(app)
        .post('/api/v1/vectors/search')
        .send({ vector: [1, 0, 0] });
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      // Most similar should be first
      expect(res.body[0].entry.id).toBe('a');
      expect(res.body[0].score).toBeCloseTo(1, 2);
    });

    it('respects limit parameter', async () => {
      store.add('a', [1, 0, 0], 'first');
      store.add('b', [0.9, 0.1, 0], 'second');
      store.add('c', [0.8, 0.2, 0], 'third');

      const res = await request(app)
        .post('/api/v1/vectors/search')
        .send({ vector: [1, 0, 0], limit: 2 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('respects minScore parameter', async () => {
      store.add('a', [1, 0, 0], 'first');
      store.add('b', [0, 1, 0], 'orthogonal');

      const res = await request(app)
        .post('/api/v1/vectors/search')
        .send({ vector: [1, 0, 0], minScore: 0.5 });
      expect(res.status).toBe(200);
      // Only the similar one should pass the threshold
      expect(res.body).toHaveLength(1);
      expect(res.body[0].entry.id).toBe('a');
    });

    it('returns 400 when vector is missing', async () => {
      const res = await request(app)
        .post('/api/v1/vectors/search')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('vector required');
    });

    it('returns empty array when no entries match', async () => {
      const res = await request(app)
        .post('/api/v1/vectors/search')
        .send({ vector: [1, 0, 0], minScore: 0.99 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // --- GET /stats ---

  describe('GET /stats', () => {
    it('returns zero size for empty store', async () => {
      const res = await request(app).get('/api/v1/vectors/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ size: 0 });
    });

    it('returns correct size after additions', async () => {
      store.add('a', [1, 0, 0], 'first');
      store.add('b', [0, 1, 0], 'second');

      const res = await request(app).get('/api/v1/vectors/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ size: 2 });
    });
  });

  // --- GET /:id ---

  describe('GET /:id', () => {
    it('returns an existing vector entry', async () => {
      store.add('v1', [1, 0, 0], 'test entry', { tag: 'a' });

      const res = await request(app).get('/api/v1/vectors/v1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('v1');
      expect(res.body.content).toBe('test entry');
      expect(res.body.metadata).toEqual({ tag: 'a' });
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/v1/vectors/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Vector entry not found');
    });
  });

  // --- DELETE /:id ---

  describe('DELETE /:id', () => {
    it('removes an existing vector entry', async () => {
      store.add('v1', [1, 0, 0], 'to delete');

      const res = await request(app).delete('/api/v1/vectors/v1');
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      // Verify removal
      const getRes = await request(app).get('/api/v1/vectors/v1');
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).delete('/api/v1/vectors/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Vector entry not found');
    });
  });
});
