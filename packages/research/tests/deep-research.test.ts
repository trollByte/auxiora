import { describe, it, expect, vi } from 'vitest';
import { DeepResearchOrchestrator } from '../src/deep-research.js';
import type { ResearchPlan, ResearchDocumentStore } from '../src/deep-research.js';
import type { ResearchProvider, ResearchProgressEvent } from '../src/types.js';

function mockProvider(response: string): ResearchProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: response }),
  };
}

function mockStore(): ResearchDocumentStore {
  return { ingest: vi.fn() };
}

describe('DeepResearchOrchestrator', () => {
  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const provider = mockProvider('');
      const orch = new DeepResearchOrchestrator(provider);
      expect(orch).toBeDefined();
    });

    it('accepts partial config overrides', () => {
      const provider = mockProvider('');
      const orch = new DeepResearchOrchestrator(provider, { maxSubtopics: 3 });
      expect(orch).toBeDefined();
    });
  });

  describe('plan()', () => {
    it('decomposes question into subtopics via LLM', async () => {
      const llmResponse = JSON.stringify({
        subtopics: [
          { title: 'Performance', queries: ['React performance benchmarks'], focus: 'runtime speed' },
          { title: 'Ecosystem', queries: ['React ecosystem size'], focus: 'community' },
          { title: 'Learning Curve', queries: ['React learning curve'], focus: 'onboarding' },
        ],
      });
      const provider = mockProvider(llmResponse);
      const orch = new DeepResearchOrchestrator(provider);

      const plan = await orch.plan('Compare React and Vue');

      expect(plan.subtopics).toHaveLength(3);
      expect(plan.subtopics[0].title).toBe('Performance');
      expect(plan.subtopics[0].queries).toEqual(['React performance benchmarks']);
      expect(provider.complete).toHaveBeenCalledOnce();
    });

    it('caps subtopics at maxSubtopics', async () => {
      const subtopics = Array.from({ length: 10 }, (_, i) => ({
        title: `Topic ${i}`,
        queries: [`query ${i}`],
        focus: `focus ${i}`,
      }));
      const provider = mockProvider(JSON.stringify({ subtopics }));
      const orch = new DeepResearchOrchestrator(provider, { maxSubtopics: 4 });

      const plan = await orch.plan('Big question');
      expect(plan.subtopics.length).toBeLessThanOrEqual(4);
    });

    it('emits research_planning progress event', async () => {
      const llmResponse = JSON.stringify({
        subtopics: [{ title: 'A', queries: ['q1'], focus: 'f1' }],
      });
      const provider = mockProvider(llmResponse);
      const events: ResearchProgressEvent[] = [];
      const orch = new DeepResearchOrchestrator(provider);

      await orch.plan('Test question', (e) => events.push(e));

      const planningEvent = events.find(e => e.type === 'research_planning');
      expect(planningEvent).toBeDefined();
      if (planningEvent?.type === 'research_planning') {
        expect(planningEvent.subtopics).toEqual(['A']);
      }
    });

    it('handles malformed LLM response gracefully', async () => {
      const provider = mockProvider('not valid json');
      const orch = new DeepResearchOrchestrator(provider);
      await expect(orch.plan('Test')).rejects.toThrow();
    });
  });

  describe('execute()', () => {
    it('researches each subtopic in parallel', async () => {
      const provider = mockProvider('{}');
      const mockEngine = {
        research: vi.fn().mockResolvedValue({
          id: 'r1', query: { topic: 'test', depth: 'quick' },
          findings: [{ id: 'f1', content: 'finding', sourceId: 's1', relevance: 0.9, category: 'general' }],
          executiveSummary: '', sources: [{ id: 's1', url: 'https://ex.com', title: 'Ex', domain: 'ex.com', accessedAt: Date.now(), credibilityScore: 0.8 }],
          confidence: 0.8, generatedAt: Date.now(), durationMs: 100,
        }),
      };

      const orch = new DeepResearchOrchestrator(provider, undefined, mockEngine as any);
      const store = mockStore();
      const plan: ResearchPlan = {
        questionId: 'q1', question: 'test?',
        subtopics: [
          { title: 'A', queries: ['query A'], focus: 'focus A' },
          { title: 'B', queries: ['query B'], focus: 'focus B' },
        ],
      };

      const result = await orch.execute(plan, store);
      expect(mockEngine.research).toHaveBeenCalledTimes(2);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('emits progress events for each subtopic', async () => {
      const provider = mockProvider('{}');
      const mockEngine = {
        research: vi.fn().mockResolvedValue({
          id: 'r1', query: { topic: 'test', depth: 'quick' },
          findings: [], executiveSummary: '', sources: [],
          confidence: 0.5, generatedAt: Date.now(), durationMs: 50,
        }),
      };

      const events: ResearchProgressEvent[] = [];
      const orch = new DeepResearchOrchestrator(provider, undefined, mockEngine as any);
      const store = mockStore();
      const plan: ResearchPlan = {
        questionId: 'q1', question: 'test?',
        subtopics: [{ title: 'A', queries: ['q'], focus: 'f' }],
      };

      await orch.execute(plan, store, (e) => events.push(e));
      const searchEvents = events.filter(e => e.type === 'research_searching');
      expect(searchEvents.length).toBe(1);
    });
  });

  describe('evaluate()', () => {
    it('identifies knowledge gaps via LLM', async () => {
      const evalResponse = JSON.stringify({
        gaps: ['Missing performance benchmarks', 'No cost comparison'],
        queries: ['performance benchmarks comparison', 'cost analysis'],
      });
      const provider = mockProvider(evalResponse);
      const orch = new DeepResearchOrchestrator(provider);

      const result = await orch.evaluate('Compare X and Y', ['Finding about X']);
      expect(result.gaps).toHaveLength(2);
      expect(result.queries.length).toBeGreaterThan(0);
    });

    it('returns empty gaps when research is sufficient', async () => {
      const evalResponse = JSON.stringify({ gaps: [], queries: [] });
      const provider = mockProvider(evalResponse);
      const orch = new DeepResearchOrchestrator(provider);

      const result = await orch.evaluate('Simple Q', ['Complete finding']);
      expect(result.gaps).toHaveLength(0);
    });
  });

  describe('research() full pipeline', () => {
    it('runs plan -> execute -> evaluate -> done', async () => {
      const planResponse = JSON.stringify({
        subtopics: [{ title: 'Topic A', queries: ['q1'], focus: 'f1' }],
      });
      const evalResponse = JSON.stringify({ gaps: [], queries: [] });
      const provider: ResearchProvider = {
        complete: vi.fn()
          .mockResolvedValueOnce({ content: planResponse })
          .mockResolvedValueOnce({ content: evalResponse }),
      };

      const mockEngine = {
        research: vi.fn().mockResolvedValue({
          id: 'r1', query: { topic: 'test', depth: 'quick' },
          findings: [{ id: 'f1', content: 'A finding', sourceId: 's1', relevance: 0.8, category: 'general' }],
          executiveSummary: 'summary',
          sources: [{ id: 's1', url: 'https://example.com', title: 'Example', domain: 'example.com', accessedAt: Date.now(), credibilityScore: 0.9 }],
          confidence: 0.85, generatedAt: Date.now(), durationMs: 200,
        }),
      };

      const orch = new DeepResearchOrchestrator(provider, undefined, mockEngine as any);
      const events: ResearchProgressEvent[] = [];

      const result = await orch.research('Test question', 'deep', (e) => events.push(e));

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.sources.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'research_started')).toBe(true);
      expect(events.some(e => e.type === 'research_planning')).toBe(true);
      expect(events.some(e => e.type === 'research_complete')).toBe(true);
    });

    it('performs refinement rounds when gaps are found', async () => {
      const planResponse = JSON.stringify({
        subtopics: [{ title: 'A', queries: ['q1'], focus: 'f' }],
      });
      const evalWithGaps = JSON.stringify({ gaps: ['gap1'], queries: ['follow-up query'] });
      const evalNoGaps = JSON.stringify({ gaps: [], queries: [] });
      const provider: ResearchProvider = {
        complete: vi.fn()
          .mockResolvedValueOnce({ content: planResponse })
          .mockResolvedValueOnce({ content: evalWithGaps })
          .mockResolvedValueOnce({ content: evalNoGaps }),
      };

      const mockEngine = {
        research: vi.fn().mockResolvedValue({
          id: 'r1', query: { topic: 'test', depth: 'quick' },
          findings: [{ id: 'f1', content: 'finding', sourceId: 's1', relevance: 0.8, category: 'general' }],
          executiveSummary: '',
          sources: [{ id: 's1', url: 'https://ex.com', title: 'Ex', domain: 'ex.com', accessedAt: Date.now(), credibilityScore: 0.7 }],
          confidence: 0.7, generatedAt: Date.now(), durationMs: 100,
        }),
      };

      const events: ResearchProgressEvent[] = [];
      const orch = new DeepResearchOrchestrator(provider, { maxRefinementRounds: 2 }, mockEngine as any);
      await orch.research('Test', 'deep', (e) => events.push(e));

      const refineEvents = events.filter(e => e.type === 'research_refining');
      expect(refineEvents.length).toBe(1);
    });

    it('respects timeout', async () => {
      const provider: ResearchProvider = {
        complete: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ content: '{}' }), 5000)),
        ),
      };
      const orch = new DeepResearchOrchestrator(provider, { timeoutMs: 100 });

      await expect(orch.research('Test', 'deep')).rejects.toThrow(/timeout/i);
    });
  });
});
