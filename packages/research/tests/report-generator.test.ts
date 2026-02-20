import { describe, it, expect, vi } from 'vitest';
import { ReportGenerator } from '../src/report-generator.js';
import type { ResearchProvider, Finding, Source } from '../src/types.js';

function mockProvider(response: string): ResearchProvider {
  return { complete: vi.fn().mockResolvedValue({ content: response }) };
}

const sampleFindings: Finding[] = [
  { id: 'f1', content: 'React uses virtual DOM for performance', sourceId: 's1', relevance: 0.9, category: 'performance' },
  { id: 'f2', content: 'Vue uses reactivity system with proxies', sourceId: 's2', relevance: 0.85, category: 'performance' },
  { id: 'f3', content: 'React has larger community', sourceId: 's1', relevance: 0.7, category: 'ecosystem' },
];

const sampleSources: Source[] = [
  { id: 's1', url: 'https://react.dev', title: 'React Docs', domain: 'react.dev', accessedAt: Date.now(), credibilityScore: 0.95 },
  { id: 's2', url: 'https://vuejs.org', title: 'Vue Docs', domain: 'vuejs.org', accessedAt: Date.now(), credibilityScore: 0.9 },
];

describe('ReportGenerator', () => {
  describe('generateReport() - structured', () => {
    it('produces a ResearchReport with sections', async () => {
      const sectionsResponse = JSON.stringify({
        sections: [
          { title: 'Performance', summary: 'Both use different approaches...', findings: ['f1', 'f2'], sources: ['s1', 's2'], confidence: 0.85 },
          { title: 'Ecosystem', summary: 'React has larger...', findings: ['f3'], sources: ['s1'], confidence: 0.7 },
        ],
        executiveSummary: 'React and Vue are both excellent frameworks...',
      });
      const provider = mockProvider(sectionsResponse);
      const gen = new ReportGenerator(provider);

      const report = await gen.generateReport({
        question: 'Compare React and Vue',
        findings: sampleFindings,
        sources: sampleSources,
        knowledgeGaps: ['No bundle size comparison'],
        depth: 'deep',
        refinementRounds: 1,
        duration: 5000,
        tokenUsage: 10000,
      });

      expect(report.id).toBeTruthy();
      expect(report.question).toBe('Compare React and Vue');
      expect(report.sections.length).toBe(2);
      expect(report.executiveSummary).toBeTruthy();
      expect(report.knowledgeGaps).toEqual(['No bundle size comparison']);
      expect(report.sources.length).toBe(2);
      expect(report.metadata.depth).toBe('deep');
      expect(report.metadata.totalSources).toBe(2);
      expect(report.metadata.confidence).toBeGreaterThan(0);
    });
  });

  describe('generateSummary() - conversational', () => {
    it('produces markdown string with inline citations', async () => {
      const provider = mockProvider(
        'React uses virtual DOM [1], while Vue uses proxies [2]. React has a larger community [1].',
      );
      const gen = new ReportGenerator(provider);

      const summary = await gen.generateSummary({
        question: 'Compare React and Vue',
        findings: sampleFindings,
        sources: sampleSources,
      });

      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
      expect(provider.complete).toHaveBeenCalledOnce();
    });
  });
});
