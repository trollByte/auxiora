import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from '../src/knowledge-graph.js';

describe('KnowledgeGraph', () => {
  it('addEntity creates with ID', () => {
    const graph = new KnowledgeGraph();
    const entity = graph.addEntity('TypeScript', 'language', { paradigm: 'multi' });
    expect(entity.id).toBeDefined();
    expect(entity.name).toBe('TypeScript');
    expect(entity.type).toBe('language');
    expect(entity.properties.paradigm).toBe('multi');
  });

  it('findByName finds entity', () => {
    const graph = new KnowledgeGraph();
    graph.addEntity('JavaScript', 'language');
    const found = graph.findByName('JavaScript');
    expect(found).toBeDefined();
    expect(found!.name).toBe('JavaScript');
    expect(graph.findByName('Python')).toBeUndefined();
  });

  it('findByType returns matching', () => {
    const graph = new KnowledgeGraph();
    graph.addEntity('TypeScript', 'language');
    graph.addEntity('JavaScript', 'language');
    graph.addEntity('React', 'framework');
    const languages = graph.findByType('language');
    expect(languages).toHaveLength(2);
    expect(languages.every((e) => e.type === 'language')).toBe(true);
  });

  it('addRelation links entities', () => {
    const graph = new KnowledgeGraph();
    const ts = graph.addEntity('TypeScript', 'language');
    const js = graph.addEntity('JavaScript', 'language');
    graph.addRelation(ts.id, js.id, 'compiles_to');
    const json = graph.toJSON();
    expect(json.relations).toHaveLength(1);
    expect(json.relations[0].relation).toBe('compiles_to');
  });

  it('getRelated returns connections', () => {
    const graph = new KnowledgeGraph();
    const ts = graph.addEntity('TypeScript', 'language');
    const js = graph.addEntity('JavaScript', 'language');
    const react = graph.addEntity('React', 'framework');
    graph.addRelation(ts.id, js.id, 'compiles_to');
    graph.addRelation(react.id, ts.id, 'uses');

    const related = graph.getRelated(ts.id);
    expect(related).toHaveLength(2);
    expect(related.some((r) => r.entity.name === 'JavaScript' && r.direction === 'from')).toBe(true);
    expect(related.some((r) => r.entity.name === 'React' && r.direction === 'to')).toBe(true);
  });

  it('removeEntity also removes relations', () => {
    const graph = new KnowledgeGraph();
    const ts = graph.addEntity('TypeScript', 'language');
    const js = graph.addEntity('JavaScript', 'language');
    graph.addRelation(ts.id, js.id, 'compiles_to');

    const removed = graph.removeEntity(ts.id);
    expect(removed).toBe(true);
    expect(graph.getEntity(ts.id)).toBeUndefined();
    expect(graph.toJSON().relations).toHaveLength(0);
  });
});
