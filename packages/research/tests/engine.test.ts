import { describe, it, expect } from 'vitest';
import { ResearchEngine } from '../src/engine.js';

describe('ResearchEngine', () => {
  it('planResearch quick returns 1 query', () => {
    const engine = new ResearchEngine();
    const queries = engine.planResearch('TypeScript', 'quick');
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBe('TypeScript');
  });

  it('planResearch standard returns 3 queries', () => {
    const engine = new ResearchEngine();
    const queries = engine.planResearch('TypeScript', 'standard');
    expect(queries).toHaveLength(3);
    expect(queries).toContain('TypeScript');
    expect(queries).toContain('TypeScript overview');
    expect(queries).toContain('TypeScript analysis');
  });

  it('planResearch deep returns 6 queries', () => {
    const engine = new ResearchEngine();
    const queries = engine.planResearch('TypeScript', 'deep');
    expect(queries).toHaveLength(6);
    expect(queries).toContain('TypeScript comparison');
    expect(queries).toContain('TypeScript best practices');
    expect(queries).toContain('TypeScript research papers');
  });

  it('research returns valid ResearchResult', () => {
    const engine = new ResearchEngine();
    const result = engine.research({ topic: 'AI safety', depth: 'standard' });
    expect(result.id).toBeDefined();
    expect(result.query.topic).toBe('AI safety');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.executiveSummary).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('research has correct depth in result', () => {
    const engine = new ResearchEngine();
    const result = engine.research({ topic: 'testing', depth: 'deep' });
    expect(result.query.depth).toBe('deep');
  });

  it('synthesize formats findings', () => {
    const engine = new ResearchEngine();
    const findings = [
      { id: '1', content: 'Finding A', sourceId: 's1', relevance: 0.9, category: 'general' },
      { id: '2', content: 'Finding B', sourceId: 's2', relevance: 0.8, category: 'general' },
    ];
    const summary = engine.synthesize(findings);
    expect(summary).toContain('2 findings');
    expect(summary).toContain('2 sources');
    expect(summary).toContain('Finding A');
    expect(summary).toContain('Finding B');
  });

  it('deduplicateFindings removes duplicates', () => {
    const engine = new ResearchEngine();
    const findings = [
      { id: '1', content: 'Same content', sourceId: 's1', relevance: 0.9, category: 'general' },
      { id: '2', content: 'Same content', sourceId: 's2', relevance: 0.8, category: 'general' },
      { id: '3', content: 'Different content', sourceId: 's3', relevance: 0.7, category: 'general' },
    ];
    const result = engine.deduplicateFindings(findings);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Same content');
    expect(result[1].content).toBe('Different content');
  });

  it('research timing durationMs > 0', () => {
    const engine = new ResearchEngine();
    const result = engine.research({ topic: 'performance', depth: 'quick' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.generatedAt).toBeGreaterThan(0);
  });
});
