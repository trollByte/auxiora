import { describe, it, expect, beforeEach } from 'vitest';
import { EntityLinker } from '../src/entity-linker.js';
import { GraphStore } from '../src/graph-store.js';

describe('EntityLinker', () => {
  let linker: EntityLinker;

  beforeEach(() => {
    linker = new EntityLinker();
  });

  describe('extractEntities', () => {
    it('should extract multi-word capitalized names as entities', () => {
      const entities = linker.extractEntities('John Smith joined the team last week.');
      const names = entities.map(e => e.name);
      expect(names).toContain('John Smith');
    });

    it('should extract organization names with company suffixes', () => {
      const entities = linker.extractEntities('She works at Acme Corp and previously was at Beta Inc.');
      const orgs = entities.filter(e => e.type === 'organization');
      expect(orgs.length).toBeGreaterThanOrEqual(1);
      const orgNames = orgs.map(o => o.name);
      expect(orgNames.some(n => n.includes('Acme Corp') || n.includes('Beta Inc'))).toBe(true);
    });

    it('should extract email addresses as person entities', () => {
      const entities = linker.extractEntities('Contact jane.doe@example.com for details.');
      const email = entities.find(e => e.name === 'Jane Doe');
      expect(email).toBeDefined();
      expect(email?.type).toBe('person');
    });

    it('should extract @mentions as person entities', () => {
      const entities = linker.extractEntities('Please ask @johndoe about this issue.');
      const mention = entities.find(e => e.name === 'johndoe');
      expect(mention).toBeDefined();
      expect(mention?.type).toBe('person');
    });

    it('should not duplicate entities with the same name', () => {
      const entities = linker.extractEntities('Alice Smith met Alice Smith again.');
      const alices = entities.filter(e => e.name === 'Alice Smith');
      expect(alices).toHaveLength(1);
    });

    it('should extract single capitalized words near relation keywords', () => {
      const entities = linker.extractEntities('Google competes with Microsoft in cloud services.');
      const names = entities.map(e => e.name);
      expect(names).toContain('Google');
      expect(names).toContain('Microsoft');
    });
  });

  describe('extractRelationships', () => {
    it('should extract "works at" relationships', () => {
      const text = 'Alice Smith works at Acme Corp.';
      const entities = linker.extractEntities(text);
      const rels = linker.extractRelationships(text, entities);
      const worksAt = rels.find(r => r.relation === 'works_at');
      expect(worksAt).toBeDefined();
      expect(worksAt?.source).toBe('Alice Smith');
    });

    it('should extract "manages" relationships', () => {
      const text = 'Bob Jones manages Alice Smith on the project.';
      const entities = linker.extractEntities(text);
      const rels = linker.extractRelationships(text, entities);
      const manages = rels.find(r => r.relation === 'manages');
      expect(manages).toBeDefined();
      expect(manages?.source).toBe('Bob Jones');
      expect(manages?.target).toBe('Alice Smith');
    });

    it('should extract "reports to" relationships', () => {
      const text = 'Charlie Brown reports to Alice Smith weekly.';
      const entities = linker.extractEntities(text);
      const rels = linker.extractRelationships(text, entities);
      const reportsTo = rels.find(r => r.relation === 'reports_to');
      expect(reportsTo).toBeDefined();
    });

    it('should extract CEO/founder relationships', () => {
      const text = 'Jane Doe is CEO of Acme Corp and she runs it well.';
      const entities = linker.extractEntities(text);
      const rels = linker.extractRelationships(text, entities);
      const manages = rels.find(r => r.relation === 'manages');
      expect(manages).toBeDefined();
    });

    it('should extract "competes with" relationships', () => {
      const text = 'Acme Corp competes with Beta Corp in the market.';
      const entities = linker.extractEntities(text);
      const rels = linker.extractRelationships(text, entities);
      const competes = rels.find(r => r.relation === 'competes_with');
      expect(competes).toBeDefined();
    });

    it('should include evidence snippets', () => {
      const text = 'Alice Smith works at Acme Corp daily.';
      const entities = linker.extractEntities(text);
      const rels = linker.extractRelationships(text, entities);
      expect(rels[0]?.evidence).toBeTruthy();
    });
  });

  describe('linkToGraph', () => {
    it('should add extracted entities and relationships to a graph', () => {
      const graph = new GraphStore();
      const text = 'John Smith works at Acme Corp. Jane Doe manages John Smith.';
      const result = linker.linkToGraph(text, graph);

      expect(result.newNodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.stats().nodeCount).toBeGreaterThanOrEqual(2);
    });

    it('should not duplicate nodes on repeated calls', () => {
      const graph = new GraphStore();
      const text = 'Alice Smith works at Acme Corp.';
      linker.linkToGraph(text, graph);
      const firstCount = graph.stats().nodeCount;

      linker.linkToGraph(text, graph);
      expect(graph.stats().nodeCount).toBe(firstCount);
    });

    it('should create edges for extracted relationships', () => {
      const graph = new GraphStore();
      const text = 'Bob Jones works at Mega Corp and he manages the team.';
      const result = linker.linkToGraph(text, graph);

      expect(result.newEdges.length).toBeGreaterThanOrEqual(0);
      // The works_at pattern should match "Bob Jones works at Mega Corp"
      const edges = graph.getEdges(graph.getNode('Bob Jones')!.id, 'outgoing');
      expect(edges.some(e => e.relation === 'works_at')).toBe(true);
    });

    it('should handle text with no entities gracefully', () => {
      const graph = new GraphStore();
      const result = linker.linkToGraph('nothing special here at all.', graph);
      expect(result.newNodes).toHaveLength(0);
      expect(result.newEdges).toHaveLength(0);
    });
  });
});
