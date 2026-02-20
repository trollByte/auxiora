import { describe, it, expect, vi } from 'vitest';
import { DeepResearchOrchestrator } from '../src/deep-research.js';
import type { ResearchProvider, ResearchProgressEvent } from '../src/types.js';

function mockProvider(response: string): ResearchProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: response }),
  };
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
});
