import { describe, it, expect } from 'vitest';
import {
  ResearchTool,
  ToolPermission,
  setResearchEngine,
} from '../src/index.js';

describe('ResearchTool', () => {
  it('should have correct name and description', () => {
    expect(ResearchTool.name).toBe('research');
    expect(ResearchTool.description).toContain('research');
  });

  it('should require topic parameter', () => {
    const topic = ResearchTool.parameters.find(p => p.name === 'topic');
    expect(topic?.required).toBe(true);
  });

  it('should have optional depth with standard default', () => {
    const depth = ResearchTool.parameters.find(p => p.name === 'depth');
    expect(depth?.required).toBe(false);
    expect(depth?.default).toBe('standard');
  });

  it('should auto-approve (read-only research)', () => {
    expect(ResearchTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without engine', async () => {
    setResearchEngine(null);
    const result = await ResearchTool.execute({ topic: 'AI safety' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Brave Search API key');
  });

  it('should execute research and return results', async () => {
    setResearchEngine({
      research: (query: any) => ({
        id: 'r1',
        query,
        executiveSummary: 'AI safety is an important research area.',
        confidence: 0.85,
        findings: [
          { id: 'f1', content: 'Finding 1', sourceId: 's1', relevance: 0.9, category: 'overview' },
        ],
        sources: [
          { id: 's1', url: 'https://example.com', title: 'Source 1', domain: 'example.com', credibilityScore: 0.8 },
        ],
        durationMs: 150,
      }),
    });

    const result = await ResearchTool.execute({ topic: 'AI safety' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.summary).toContain('AI safety');
    expect(parsed.confidence).toBe(0.85);
    expect(parsed.findingCount).toBe(1);
    expect(parsed.sourceCount).toBe(1);
    expect(parsed.sources[0].url).toBe('https://example.com');
  });

  it('should pass focusAreas when provided', async () => {
    let capturedQuery: any = null;
    setResearchEngine({
      research: (query: any) => {
        capturedQuery = query;
        return {
          executiveSummary: 'summary',
          confidence: 0.5,
          findings: [],
          sources: [],
          durationMs: 10,
        };
      },
    });

    await ResearchTool.execute({
      topic: 'machine learning',
      focusAreas: 'transformers, attention mechanisms',
    }, {} as any);

    expect(capturedQuery.focusAreas).toEqual(['transformers', 'attention mechanisms']);
  });
});
