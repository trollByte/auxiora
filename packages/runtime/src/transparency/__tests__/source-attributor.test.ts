import { describe, it, expect } from 'vitest';
import { attributeSources, countHedgePhrases } from '../source-attributor.js';

describe('attributeSources', () => {
  it('returns model_generation when no tools or memory', () => {
    const sources = attributeSources({ toolsUsed: [], hasMemoryRecall: false, hasKnowledgeGraph: false, hasUserData: false });
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('model_generation');
    expect(sources[0].confidence).toBe(0.7);
  });

  it('includes tool_result source for each tool', () => {
    const sources = attributeSources({ toolsUsed: ['web_search', 'calculator'], hasMemoryRecall: false, hasKnowledgeGraph: false, hasUserData: false });
    const toolSources = sources.filter(s => s.type === 'tool_result');
    expect(toolSources).toHaveLength(2);
    expect(toolSources[0].label).toContain('web_search');
    expect(toolSources[0].confidence).toBe(0.95);
  });

  it('includes memory_recall source', () => {
    const sources = attributeSources({ toolsUsed: [], hasMemoryRecall: true, hasKnowledgeGraph: false, hasUserData: false });
    expect(sources.find(s => s.type === 'memory_recall')).toBeDefined();
  });

  it('includes knowledge_graph source', () => {
    const sources = attributeSources({ toolsUsed: [], hasMemoryRecall: false, hasKnowledgeGraph: true, hasUserData: false });
    expect(sources.find(s => s.type === 'knowledge_graph')).toBeDefined();
  });

  it('includes user_data source', () => {
    const sources = attributeSources({ toolsUsed: [], hasMemoryRecall: false, hasKnowledgeGraph: false, hasUserData: true });
    expect(sources.find(s => s.type === 'user_data')).toBeDefined();
  });

  it('always includes model_generation as final source', () => {
    const sources = attributeSources({ toolsUsed: ['web_search'], hasMemoryRecall: true, hasKnowledgeGraph: true, hasUserData: true });
    const last = sources[sources.length - 1];
    expect(last.type).toBe('model_generation');
    expect(last.label).toBe('Synthesized from above sources');
  });
});

describe('countHedgePhrases', () => {
  it('returns 0 for text with no hedges', () => {
    expect(countHedgePhrases('The answer is 42.')).toBe(0);
  });

  it('counts hedge phrases case-insensitively', () => {
    expect(countHedgePhrases('I think the answer is probably 42. I believe so.')).toBe(3);
  });

  it('handles empty string', () => {
    expect(countHedgePhrases('')).toBe(0);
  });
});
