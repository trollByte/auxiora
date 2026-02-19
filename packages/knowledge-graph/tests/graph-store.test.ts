import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../src/graph-store.js';

describe('GraphStore', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  describe('addNode', () => {
    it('should create a new node with generated id and timestamps', () => {
      const node = store.addNode({
        name: 'Alice',
        type: 'person',
        aliases: [],
        properties: {},
        confidence: 0.9,
      });

      expect(node.id).toBeDefined();
      expect(node.name).toBe('Alice');
      expect(node.type).toBe('person');
      expect(node.mentionCount).toBe(1);
      expect(node.createdAt).toBeGreaterThan(0);
    });

    it('should deduplicate by name and increment mentionCount', () => {
      const first = store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 0.8 });
      const second = store.addNode({ name: 'Alice', type: 'person', aliases: ['Ali'], properties: { role: 'dev' }, confidence: 0.9 });

      expect(second.id).toBe(first.id);
      expect(second.mentionCount).toBe(2);
      expect(second.aliases).toContain('Ali');
      expect(second.confidence).toBe(0.9);
      expect(second.properties).toHaveProperty('role', 'dev');
    });

    it('should be case-insensitive for deduplication', () => {
      const a = store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 0.8 });
      const b = store.getNode('alice');
      expect(b?.id).toBe(a.id);
    });
  });

  describe('addEdge', () => {
    it('should create an edge between two nodes', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 0.9 });
      store.addNode({ name: 'Acme Corp', type: 'organization', aliases: [], properties: {}, confidence: 0.9 });

      const edge = store.addEdge('Alice', 'Acme Corp', 'works_at', { weight: 0.8 });
      expect(edge.relation).toBe('works_at');
      expect(edge.weight).toBe(0.8);
    });

    it('should throw if source node not found', () => {
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 0.9 });
      expect(() => store.addEdge('Unknown', 'Bob', 'related_to')).toThrow('Source node not found');
    });

    it('should throw if target node not found', () => {
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 0.9 });
      expect(() => store.addEdge('Bob', 'Unknown', 'related_to')).toThrow('Target node not found');
    });

    it('should default weight to 0.5', () => {
      store.addNode({ name: 'A', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'B', type: 'person', aliases: [], properties: {}, confidence: 1 });
      const edge = store.addEdge('A', 'B', 'related_to');
      expect(edge.weight).toBe(0.5);
    });
  });

  describe('getNode', () => {
    it('should find by ID', () => {
      const node = store.addNode({ name: 'Charlie', type: 'person', aliases: [], properties: {}, confidence: 0.9 });
      expect(store.getNode(node.id)?.name).toBe('Charlie');
    });

    it('should find by name', () => {
      store.addNode({ name: 'Charlie', type: 'person', aliases: ['Chuck'], properties: {}, confidence: 0.9 });
      expect(store.getNode('Charlie')?.name).toBe('Charlie');
      expect(store.getNode('Chuck')?.name).toBe('Charlie');
    });

    it('should return undefined for unknown node', () => {
      expect(store.getNode('nobody')).toBeUndefined();
    });
  });

  describe('getEdges', () => {
    it('should return edges by direction', () => {
      const alice = store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'manages');
      store.addEdge('Bob', 'Alice', 'reports_to');

      expect(store.getEdges(alice.id, 'outgoing')).toHaveLength(1);
      expect(store.getEdges(alice.id, 'incoming')).toHaveLength(1);
      expect(store.getEdges(alice.id, 'both')).toHaveLength(2);
    });
  });

  describe('getNeighbors', () => {
    it('should return neighbor nodes', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'manages');
      store.addEdge('Alice', 'Acme', 'works_at');

      const alice = store.getNode('Alice')!;
      const neighbors = store.getNeighbors(alice.id);
      expect(neighbors).toHaveLength(2);

      const managedNeighbors = store.getNeighbors(alice.id, 'manages');
      expect(managedNeighbors).toHaveLength(1);
      expect(managedNeighbors[0].name).toBe('Bob');
    });
  });

  describe('query', () => {
    it('should perform BFS traversal from start node', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Charlie', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'manages');
      store.addEdge('Bob', 'Charlie', 'manages');

      const result = store.query({ startNode: 'Alice', maxDepth: 2 });
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      expect(result.paths.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by relation type', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'manages');
      store.addEdge('Alice', 'Acme', 'works_at');

      const result = store.query({ startNode: 'Alice', relation: 'manages' });
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].nodes[1].name).toBe('Bob');
    });

    it('should filter by target type', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'related_to');
      store.addEdge('Alice', 'Acme', 'related_to');

      const result = store.query({ startNode: 'Alice', targetType: 'organization' });
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].nodes[1].name).toBe('Acme');
    });

    it('should filter by minConfidence', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 0.3 });
      store.addEdge('Alice', 'Bob', 'related_to');

      const result = store.query({ startNode: 'Alice', minConfidence: 0.5 });
      expect(result.paths).toHaveLength(0);
    });

    it('should return empty for unknown start node', () => {
      const result = store.query({ startNode: 'nobody' });
      expect(result.paths).toHaveLength(0);
      expect(result.nodes).toHaveLength(0);
    });

    it('should query all nodes when no start node given', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1 });

      const result = store.query({ targetType: 'organization' });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Acme');
    });
  });

  describe('merge', () => {
    it('should merge two nodes into one', () => {
      const a = store.addNode({ name: 'Robert', type: 'person', aliases: [], properties: { role: 'dev' }, confidence: 0.8 });
      const b = store.addNode({ name: 'Bob', type: 'person', aliases: ['Bobby'], properties: { team: 'eng' }, confidence: 0.9 });
      store.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Bob', 'Acme', 'works_at');

      const merged = store.merge(a.id, b.id);
      expect(merged.name).toBe('Robert');
      expect(merged.aliases).toContain('Bob');
      expect(merged.aliases).toContain('Bobby');
      expect(merged.mentionCount).toBe(2);
      expect(merged.confidence).toBe(0.9);
      expect(merged.properties).toHaveProperty('team', 'eng');

      // Bob node should be removed
      expect(store.getNode(b.id)).toBeUndefined();

      // Edge should be reassigned
      const edges = store.getEdges(merged.id, 'outgoing');
      expect(edges).toHaveLength(1);
      expect(edges[0].relation).toBe('works_at');
    });

    it('should throw for unknown node IDs', () => {
      const a = store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      expect(() => store.merge(a.id, 'unknown-id')).toThrow('Node not found');
    });
  });

  describe('removeNode', () => {
    it('should remove node and its edges', () => {
      const alice = store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'manages');

      store.removeNode(alice.id);
      expect(store.getNode('Alice')).toBeUndefined();
      expect(store.stats().edgeCount).toBe(0);
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      const edge = store.addEdge('Alice', 'Bob', 'manages');

      store.removeEdge(edge.id);
      expect(store.stats().edgeCount).toBe(0);
    });
  });

  describe('stats', () => {
    it('should return correct counts', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addNode({ name: 'Bob', type: 'person', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Bob', 'manages');
      store.addEdge('Bob', 'Alice', 'reports_to');

      const s = store.stats();
      expect(s.nodeCount).toBe(2);
      expect(s.edgeCount).toBe(2);
      expect(s.relationCounts['manages']).toBe(1);
      expect(s.relationCounts['reports_to']).toBe(1);
    });
  });

  describe('serialization', () => {
    it('should round-trip through toJSON/fromJSON', () => {
      store.addNode({ name: 'Alice', type: 'person', aliases: ['Ali'], properties: { role: 'dev' }, confidence: 0.9 });
      store.addNode({ name: 'Acme', type: 'organization', aliases: [], properties: {}, confidence: 1 });
      store.addEdge('Alice', 'Acme', 'works_at', { weight: 0.8, evidence: ['Alice works at Acme'] });

      const json = store.toJSON();
      const restored = GraphStore.fromJSON(json);

      expect(restored.stats().nodeCount).toBe(2);
      expect(restored.stats().edgeCount).toBe(1);
      expect(restored.getNode('Alice')?.aliases).toContain('Ali');
      expect(restored.getNode('Ali')?.name).toBe('Alice');

      const edges = restored.getEdges(restored.getNode('Alice')!.id, 'outgoing');
      expect(edges[0].relation).toBe('works_at');
      expect(edges[0].weight).toBe(0.8);
    });
  });
});
