import { describe, it, expect, vi } from 'vitest';
import { DeepResearchOrchestrator, ReportGenerator, ResearchIntentDetector } from '../src/index.js';
import type { ResearchProvider, ResearchProgressEvent } from '../src/types.js';

describe('Deep Research Integration', () => {
  const planResponse = JSON.stringify({
    subtopics: [
      { title: 'Performance', queries: ['framework performance'], focus: 'speed benchmarks' },
      { title: 'Community', queries: ['framework community'], focus: 'ecosystem size' },
    ],
  });
  const evalResponse = JSON.stringify({ gaps: [], queries: [] });
  const reportResponse = JSON.stringify({
    sections: [
      { title: 'Performance', summary: 'Framework A is faster', findings: ['f1'], sources: ['s1'], confidence: 0.8 },
    ],
    executiveSummary: 'Framework A outperforms B in most benchmarks.',
  });

  it('intent detector -> orchestrator -> report generator pipeline', () => {
    const detector = new ResearchIntentDetector();
    const intent = detector.detect(
      'Compare and analyze framework A vs framework B performance and ecosystem',
    );
    expect(intent.score).toBeGreaterThanOrEqual(0.5);
  });

  it('orchestrator collects findings and progress events', async () => {
    const provider: ResearchProvider = {
      complete: vi.fn()
        .mockResolvedValueOnce({ content: planResponse })
        .mockResolvedValueOnce({ content: evalResponse }),
    };
    const mockEngine = {
      research: vi.fn().mockResolvedValue({
        id: 'r1',
        query: { topic: 'test', depth: 'quick' as const },
        findings: [{ id: 'f1', content: 'Finding 1', sourceId: 's1', relevance: 0.9, category: 'perf' }],
        executiveSummary: 'sum',
        sources: [{
          id: 's1', url: 'https://ex.com', title: 'Example',
          domain: 'ex.com', accessedAt: Date.now(), credibilityScore: 0.8,
        }],
        confidence: 0.8, generatedAt: Date.now(), durationMs: 100,
      }),
    };

    const orch = new DeepResearchOrchestrator(
      provider, { maxRefinementRounds: 0 }, mockEngine as any,
    );
    const events: ResearchProgressEvent[] = [];
    const result = await orch.research('Test question', 'deep', (e) => events.push(e));

    expect(result.findings.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'research_started')).toBe(true);
    expect(events.some(e => e.type === 'research_complete')).toBe(true);
  });

  it('report generator produces valid report from orchestrator output', async () => {
    const provider = { complete: vi.fn().mockResolvedValue({ content: reportResponse }) };
    const gen = new ReportGenerator(provider);

    const report = await gen.generateReport({
      question: 'Compare A and B',
      findings: [{
        id: 'f1', content: 'Finding', sourceId: 's1',
        relevance: 0.9, category: 'perf',
      }],
      sources: [{
        id: 's1', url: 'https://ex.com', title: 'Ex',
        domain: 'ex.com', accessedAt: Date.now(), credibilityScore: 0.85,
      }],
      knowledgeGaps: [],
      depth: 'deep',
      refinementRounds: 0,
      duration: 3000,
      tokenUsage: 5000,
    });

    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.metadata.depth).toBe('deep');
    expect(report.sources.length).toBe(1);
  });

  it('conversational summary mode for non-deep depths', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue({
        content: 'A concise summary with citations [1].',
      }),
    };
    const gen = new ReportGenerator(provider);

    const summary = await gen.generateSummary({
      question: 'Quick overview of X',
      findings: [{
        id: 'f1', content: 'Key point', sourceId: 's1',
        relevance: 0.8, category: 'general',
      }],
      sources: [{
        id: 's1', url: 'https://ex.com', title: 'Source',
        domain: 'ex.com', accessedAt: Date.now(), credibilityScore: 0.7,
      }],
    });

    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });
});
