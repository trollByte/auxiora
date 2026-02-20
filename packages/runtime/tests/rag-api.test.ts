import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DocumentStore, ContextBuilder } from '@auxiora/rag';
import type { Document } from '@auxiora/rag';
import { Router } from 'express';

function createRagRouter(documentStore: DocumentStore, contextBuilder: ContextBuilder) {
  const router = Router();

  router.get('/documents', (_req, res) => {
    res.json({ documents: documentStore.listDocuments() });
  });

  router.post('/documents', (req: any, res: any) => {
    const { title, content, type, metadata } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title required' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content required' });
    }
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'type required' });
    }
    const doc = documentStore.ingest(title, content, type, metadata);
    res.status(201).json(doc);
  });

  router.get('/documents/:id', (req: any, res: any) => {
    const doc = documentStore.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'document not found' });
    res.json(doc);
  });

  router.delete('/documents/:id', (req: any, res: any) => {
    const doc = documentStore.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'document not found' });
    documentStore.removeDocument(req.params.id);
    res.json({ deleted: true });
  });

  router.post('/search', (req: any, res: any) => {
    const { query, limit, minScore, type } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query required' });
    }
    const results = documentStore.search(query, { limit, minScore, type });
    res.json({ results });
  });

  router.post('/context', (req: any, res: any) => {
    const { query, maxTokens, maxChunks } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query required' });
    }
    const context = contextBuilder.buildContext(query, documentStore, { maxTokens, maxChunks });
    res.json({ context });
  });

  router.get('/stats', (_req, res) => {
    res.json(documentStore.stats());
  });

  return router;
}

describe('RAG REST API', () => {
  let app: express.Express;
  let store: DocumentStore;
  let builder: ContextBuilder;

  beforeEach(() => {
    store = new DocumentStore();
    builder = new ContextBuilder();
    app = express();
    app.use(express.json());
    app.use('/api/v1/rag', createRagRouter(store, builder));
  });

  // --- Document CRUD ---

  describe('POST /documents', () => {
    it('ingests a document and returns it', async () => {
      const res = await request(app)
        .post('/api/v1/rag/documents')
        .send({ title: 'Test Doc', content: 'Hello world content here', type: 'text' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.title).toBe('Test Doc');
      expect(res.body.type).toBe('text');
      expect(res.body.content).toBe('Hello world content here');
    });

    it('accepts optional metadata', async () => {
      const res = await request(app)
        .post('/api/v1/rag/documents')
        .send({ title: 'Meta Doc', content: 'Some content', type: 'markdown', metadata: { author: 'tester' } });
      expect(res.status).toBe(201);
      expect(res.body.metadata).toEqual({ author: 'tester' });
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/v1/rag/documents')
        .send({ content: 'body', type: 'text' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('title required');
    });

    it('returns 400 when content is missing', async () => {
      const res = await request(app)
        .post('/api/v1/rag/documents')
        .send({ title: 'T', type: 'text' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('content required');
    });

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/api/v1/rag/documents')
        .send({ title: 'T', content: 'body' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('type required');
    });
  });

  describe('GET /documents', () => {
    it('returns empty list initially', async () => {
      const res = await request(app).get('/api/v1/rag/documents');
      expect(res.status).toBe(200);
      expect(res.body.documents).toEqual([]);
    });

    it('returns ingested documents', async () => {
      store.ingest('Doc A', 'Content A', 'text');
      store.ingest('Doc B', 'Content B', 'markdown');
      const res = await request(app).get('/api/v1/rag/documents');
      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(2);
    });
  });

  describe('GET /documents/:id', () => {
    it('returns a specific document', async () => {
      const doc = store.ingest('Find Me', 'findable content', 'text');
      const res = await request(app).get(`/api/v1/rag/documents/${doc.id}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Find Me');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/v1/rag/documents/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('document not found');
    });
  });

  describe('DELETE /documents/:id', () => {
    it('deletes a document', async () => {
      const doc = store.ingest('Delete Me', 'going away', 'text');
      const res = await request(app).delete(`/api/v1/rag/documents/${doc.id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(store.getDocument(doc.id)).toBeUndefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).delete('/api/v1/rag/documents/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // --- Search ---

  describe('POST /search', () => {
    it('returns matching results', async () => {
      store.ingest('TypeScript Guide', 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript', 'text');
      store.ingest('Python Guide', 'Python is a high-level interpreted programming language', 'text');
      const res = await request(app)
        .post('/api/v1/rag/search')
        .send({ query: 'TypeScript JavaScript' });
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].document.title).toBe('TypeScript Guide');
    });

    it('returns 400 without query', async () => {
      const res = await request(app)
        .post('/api/v1/rag/search')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('query required');
    });

    it('respects limit option', async () => {
      store.ingest('Doc 1', 'alpha beta gamma delta epsilon', 'text');
      store.ingest('Doc 2', 'alpha beta gamma delta', 'text');
      store.ingest('Doc 3', 'alpha beta gamma', 'text');
      const res = await request(app)
        .post('/api/v1/rag/search')
        .send({ query: 'alpha beta', limit: 2 });
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeLessThanOrEqual(2);
    });
  });

  // --- Context ---

  describe('POST /context', () => {
    it('builds context string from stored documents', async () => {
      store.ingest('Architecture', 'The microservice architecture pattern involves splitting applications into small independent services', 'text');
      const res = await request(app)
        .post('/api/v1/rag/context')
        .send({ query: 'microservice architecture' });
      expect(res.status).toBe(200);
      expect(typeof res.body.context).toBe('string');
      expect(res.body.context).toContain('Architecture');
    });

    it('returns 400 without query', async () => {
      const res = await request(app)
        .post('/api/v1/rag/context')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('query required');
    });

    it('returns empty string when no documents match', async () => {
      const res = await request(app)
        .post('/api/v1/rag/context')
        .send({ query: 'quantum entanglement' });
      expect(res.status).toBe(200);
      expect(res.body.context).toBe('');
    });
  });

  // --- Stats ---

  describe('GET /stats', () => {
    it('returns zeroes when empty', async () => {
      const res = await request(app).get('/api/v1/rag/stats');
      expect(res.status).toBe(200);
      expect(res.body.documentCount).toBe(0);
      expect(res.body.chunkCount).toBe(0);
      expect(res.body.totalTokens).toBe(0);
    });

    it('reflects ingested documents', async () => {
      store.ingest('Stats Doc', 'Some content for statistics testing purposes', 'text');
      const res = await request(app).get('/api/v1/rag/stats');
      expect(res.status).toBe(200);
      expect(res.body.documentCount).toBe(1);
      expect(res.body.chunkCount).toBeGreaterThanOrEqual(1);
      expect(res.body.totalTokens).toBeGreaterThan(0);
    });
  });
});
