import { describe, it, expect } from 'vitest';
import { ResearchEngine } from '../src/engine.js';

const FAKE_KEY = 'test-brave-api-key';

function createEngine() {
  return new ResearchEngine({ braveApiKey: FAKE_KEY });
}

describe('ResearchEngine', () => {
  it('throws when no API key is configured', () => {
    const original = process.env.AUXIORA_RESEARCH_BRAVE_API_KEY;
    delete process.env.AUXIORA_RESEARCH_BRAVE_API_KEY;
    try {
      expect(() => new ResearchEngine()).toThrow('Brave Search API key');
    } finally {
      if (original !== undefined) {
        process.env.AUXIORA_RESEARCH_BRAVE_API_KEY = original;
      }
    }
  });

  it('planResearch quick returns 1 query', () => {
    const engine = createEngine();
    const queries = engine.planResearch('TypeScript', 'quick');
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBe('TypeScript');
  });

  it('planResearch standard returns 3 queries', () => {
    const engine = createEngine();
    const queries = engine.planResearch('TypeScript', 'standard');
    expect(queries).toHaveLength(3);
    expect(queries).toContain('TypeScript');
    expect(queries).toContain('TypeScript overview');
    expect(queries).toContain('TypeScript analysis');
  });

  it('planResearch deep returns 6 queries', () => {
    const engine = createEngine();
    const queries = engine.planResearch('TypeScript', 'deep');
    expect(queries).toHaveLength(6);
    expect(queries).toContain('TypeScript comparison');
    expect(queries).toContain('TypeScript best practices');
    expect(queries).toContain('TypeScript research papers');
  });

  it('planResearch with focusAreas appends extra queries', () => {
    const engine = createEngine();
    const queries = engine.planResearch('TypeScript', 'quick', ['performance', 'security']);
    expect(queries).toHaveLength(3);
    expect(queries).toContain('TypeScript');
    expect(queries).toContain('TypeScript performance');
    expect(queries).toContain('TypeScript security');
  });

  it('planResearch with focusAreas on standard depth', () => {
    const engine = createEngine();
    const queries = engine.planResearch('AI safety', 'standard', ['alignment']);
    expect(queries).toHaveLength(4);
    expect(queries).toContain('AI safety alignment');
  });

  it('synthesize formats findings', () => {
    const engine = createEngine();
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
    const engine = createEngine();
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

  it('accepts API key from environment variable', () => {
    const original = process.env.AUXIORA_RESEARCH_BRAVE_API_KEY;
    process.env.AUXIORA_RESEARCH_BRAVE_API_KEY = 'env-key';
    try {
      const engine = new ResearchEngine();
      expect(engine).toBeDefined();
    } finally {
      if (original !== undefined) {
        process.env.AUXIORA_RESEARCH_BRAVE_API_KEY = original;
      } else {
        delete process.env.AUXIORA_RESEARCH_BRAVE_API_KEY;
      }
    }
  });
});
