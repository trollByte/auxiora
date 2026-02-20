import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { GraphStore, EntityLinker } from '@auxiora/knowledge-graph';
import type { GraphQuery, GraphNode } from '@auxiora/knowledge-graph';
import { Router } from 'express';

function createKnowledgeRouter(graph: GraphStore, linker: EntityLinker) {
  const router = Router();

  router.post('/entities', (req: any, res: any) => {
    const { name, type, properties, aliases } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    if (!type || typeof type !== 'string') return res.status(400).json({ error: 'type required' });
    try {
      const node = graph.addNode({ name, type, aliases: aliases ?? [], properties: properties ?? {}, confidence: 1.0 });
      res.status(201).json(node);
    } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
  });

  router.get('/entities', (req: any, res: any) => {
    const query = req.query.query as string | undefined;
    if (query) {
      const extracted = linker.extractEntities(query);
      const nodes = extracted.map((e: { name: string }) => graph.getNode(e.name)).filter(Boolean);
      return res.json({ entities: nodes });
    }
    return res.json({ entities: [], stats: graph.stats() });
  });

  router.get('/entities/:id', (req: any, res: any) => {
    const node = graph.getNode(req.params.id);
    if (!node) return res.status(404).json({ error: 'entity not found' });
    res.json(node);
  });

  router.delete('/entities/:id', (req: any, res: any) => {
    const node = graph.getNode(req.params.id);
    if (!node) return res.status(404).json({ error: 'entity not found' });
    graph.removeNode(node.id);
    res.json({ deleted: true });
  });

  router.post('/relations', (req: any, res: any) => {
    const { from, to, type, properties, weight, label, evidence } = req.body;
    if (!from || typeof from !== 'string') return res.status(400).json({ error: 'from required' });
    if (!to || typeof to !== 'string') return res.status(400).json({ error: 'to required' });
    if (!type || typeof type !== 'string') return res.status(400).json({ error: 'type required' });
    try {
      const edge = graph.addEdge(from, to, type, { weight, label, evidence, properties });
      res.status(201).json(edge);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) return res.status(404).json({ error: message });
      res.status(500).json({ error: message });
    }
  });

  router.get('/relations', (req: any, res: any) => {
    const nodeId = req.query.nodeId as string | undefined;
    const direction = (req.query.direction as 'outgoing' | 'incoming' | 'both') ?? 'both';
    if (!nodeId) return res.status(400).json({ error: 'nodeId query parameter required' });
    const node = graph.getNode(nodeId);
    if (!node) return res.status(404).json({ error: 'node not found' });
    res.json({ relations: graph.getEdges(node.id, direction) });
  });

  router.post('/query', (req: any, res: any) => {
    const { startNode, relation, targetType, maxDepth, minConfidence } = req.body as Partial<GraphQuery>;
    try {
      res.json(graph.query({ startNode, relation, targetType, maxDepth, minConfidence }));
    } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
  });

  router.post('/extract', (req: any, res: any) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
    try {
      const result = linker.linkToGraph(text, graph);
      res.json({ newNodes: result.newNodes, newEdges: result.newEdges });
    } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
  });

  router.get('/stats', (_req: any, res: any) => {
    res.json(graph.stats());
  });

  return router;
}

describe('Knowledge Graph REST API', () => {
  let app: express.Express;
  let graph: GraphStore;
  let linker: EntityLinker;

  beforeEach(() => {
    graph = new GraphStore();
    linker = new EntityLinker();
    app = express();
    app.use(express.json());
    app.use('/api/v1/knowledge', createKnowledgeRouter(graph, linker));
  });

  // --- Entity CRUD ---

  describe('POST /entities', () => {
    it('creates an entity and returns it with id', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/entities')
        .send({ name: 'Acme Corp', type: 'organization' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('Acme Corp');
      expect(res.body.type).toBe('organization');
      expect(res.body.mentionCount).toBe(1);
    });

    it('accepts optional properties and aliases', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/entities')
        .send({ name: 'Alice Smith', type: 'person', aliases: ['A. Smith'], properties: { role: 'engineer' } });
      expect(res.status).toBe(201);
      expect(res.body.aliases).toContain('A. Smith');
      expect(res.body.properties.role).toBe('engineer');
    });

    it('merges when adding an entity with the same name', async () => {
      await request(app)
        .post('/api/v1/knowledge/entities')
        .send({ name: 'Acme Corp', type: 'organization' });
      const res = await request(app)
        .post('/api/v1/knowledge/entities')
        .send({ name: 'Acme Corp', type: 'organization', properties: { size: 'large' } });
      expect(res.status).toBe(201);
      expect(res.body.mentionCount).toBe(2);
      expect(res.body.properties.size).toBe('large');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/entities')
        .send({ type: 'person' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name required');
    });

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/entities')
        .send({ name: 'Bob' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('type required');
    });
  });

  describe('GET /entities', () => {
    it('returns empty entities list and stats when no query', async () => {
      const res = await request(app).get('/api/v1/knowledge/entities');
      expect(res.status).toBe(200);
      expect(res.body.entities).toEqual([]);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.nodeCount).toBe(0);
    });

    it('searches entities by query text', async () => {
      graph.addNode({ name: 'Alice Johnson', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      const res = await request(app).get('/api/v1/knowledge/entities?query=Alice Johnson works at Acme');
      expect(res.status).toBe(200);
      expect(res.body.entities.length).toBeGreaterThanOrEqual(1);
      expect(res.body.entities[0].name).toBe('Alice Johnson');
    });
  });

  describe('GET /entities/:id', () => {
    it('returns an entity by id', async () => {
      const node = graph.addNode({ name: 'Test Entity', type: 'concept', aliases: [], properties: {}, confidence: 0.9 });
      const res = await request(app).get(`/api/v1/knowledge/entities/${node.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Entity');
    });

    it('returns an entity by name', async () => {
      graph.addNode({ name: 'Test Entity', type: 'concept', aliases: [], properties: {}, confidence: 0.9 });
      const res = await request(app).get('/api/v1/knowledge/entities/Test Entity');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Entity');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/v1/knowledge/entities/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('entity not found');
    });
  });

  describe('DELETE /entities/:id', () => {
    it('deletes an entity', async () => {
      const node = graph.addNode({ name: 'Deletable', type: 'concept', aliases: [], properties: {}, confidence: 1.0 });
      const res = await request(app).delete(`/api/v1/knowledge/entities/${node.id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(graph.getNode(node.id)).toBeUndefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).delete('/api/v1/knowledge/entities/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // --- Relations ---

  describe('POST /relations', () => {
    it('creates a relation between entities', async () => {
      const alice = graph.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      const acme = graph.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1.0 });
      const res = await request(app)
        .post('/api/v1/knowledge/relations')
        .send({ from: 'Alice', to: 'Acme', type: 'works_at' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.source).toBe(alice.id);
      expect(res.body.target).toBe(acme.id);
      expect(res.body.relation).toBe('works_at');
    });

    it('returns 400 when from is missing', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/relations')
        .send({ to: 'Acme', type: 'works_at' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('from required');
    });

    it('returns 400 when to is missing', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/relations')
        .send({ from: 'Alice', type: 'works_at' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('to required');
    });

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/relations')
        .send({ from: 'Alice', to: 'Acme' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('type required');
    });

    it('returns 404 when source node does not exist', async () => {
      graph.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1.0 });
      const res = await request(app)
        .post('/api/v1/knowledge/relations')
        .send({ from: 'Nobody', to: 'Acme', type: 'works_at' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /relations', () => {
    it('returns relations for a node', async () => {
      const alice = graph.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      graph.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1.0 });
      graph.addEdge('Alice', 'Acme', 'works_at');
      const res = await request(app).get(`/api/v1/knowledge/relations?nodeId=${alice.id}`);
      expect(res.status).toBe(200);
      expect(res.body.relations).toHaveLength(1);
      expect(res.body.relations[0].relation).toBe('works_at');
    });

    it('returns 400 without nodeId', async () => {
      const res = await request(app).get('/api/v1/knowledge/relations');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('nodeId query parameter required');
    });

    it('returns 404 for unknown node', async () => {
      const res = await request(app).get('/api/v1/knowledge/relations?nodeId=nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // --- Query ---

  describe('POST /query', () => {
    it('returns traversal results from a start node', async () => {
      graph.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      graph.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1.0 });
      graph.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      graph.addEdge('Alice', 'Acme', 'works_at');
      graph.addEdge('Bob', 'Acme', 'works_at');

      const res = await request(app)
        .post('/api/v1/knowledge/query')
        .send({ startNode: 'Alice', maxDepth: 2 });
      expect(res.status).toBe(200);
      expect(res.body.nodes.length).toBeGreaterThanOrEqual(2);
      expect(res.body.edges.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by target type', async () => {
      graph.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      graph.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1.0 });
      graph.addEdge('Alice', 'Acme', 'works_at');

      const res = await request(app)
        .post('/api/v1/knowledge/query')
        .send({ startNode: 'Alice', targetType: 'organization' });
      expect(res.status).toBe(200);
      expect(res.body.paths.length).toBeGreaterThanOrEqual(1);
      expect(res.body.paths[0].nodes.some((n: GraphNode) => n.type === 'organization')).toBe(true);
    });

    it('returns empty results for unknown start node', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/query')
        .send({ startNode: 'Nobody' });
      expect(res.status).toBe(200);
      expect(res.body.nodes).toEqual([]);
      expect(res.body.edges).toEqual([]);
      expect(res.body.paths).toEqual([]);
    });
  });

  // --- Extract ---

  describe('POST /extract', () => {
    it('extracts entities and relations from text', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/extract')
        .send({ text: 'Alice Johnson works at Acme Corp and Bob Smith manages Alice Johnson' });
      expect(res.status).toBe(200);
      expect(res.body.newNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/extract')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('text required');
    });
  });

  // --- Stats ---

  describe('GET /stats', () => {
    it('returns zeroes when empty', async () => {
      const res = await request(app).get('/api/v1/knowledge/stats');
      expect(res.status).toBe(200);
      expect(res.body.nodeCount).toBe(0);
      expect(res.body.edgeCount).toBe(0);
      expect(res.body.relationCounts).toEqual({});
    });

    it('reflects added nodes and edges', async () => {
      graph.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1.0 });
      graph.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1.0 });
      graph.addEdge('Alice', 'Acme', 'works_at');

      const res = await request(app).get('/api/v1/knowledge/stats');
      expect(res.status).toBe(200);
      expect(res.body.nodeCount).toBe(2);
      expect(res.body.edgeCount).toBe(1);
      expect(res.body.relationCounts.works_at).toBe(1);
    });
  });
});
