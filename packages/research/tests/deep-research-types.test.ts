import { describe, it, expect } from 'vitest';
import type {
  DeepResearchConfig,
  ResearchReport,
  ReportSection,
  CitedSource,
  ResearchProgressEvent,
  ResearchIntent,
  ResearchJob,
  ResearchJobStatus,
} from '../src/types.js';

describe('Deep research types', () => {
  it('DeepResearchConfig has correct defaults shape', () => {
    const config: DeepResearchConfig = {
      maxSubtopics: 6,
      maxRefinementRounds: 2,
      maxTotalSources: 20,
      tokenBudget: 100_000,
      timeoutMs: 300_000,
    };
    expect(config.maxSubtopics).toBe(6);
    expect(config.maxRefinementRounds).toBe(2);
    expect(config.maxTotalSources).toBe(20);
    expect(config.tokenBudget).toBe(100_000);
    expect(config.timeoutMs).toBe(300_000);
  });

  it('ResearchReport has all required fields', () => {
    const report: ResearchReport = {
      id: 'r1',
      question: 'test?',
      executiveSummary: 'summary',
      sections: [],
      knowledgeGaps: [],
      sources: [],
      metadata: {
        depth: 'deep',
        totalSources: 0,
        refinementRounds: 0,
        duration: 1000,
        tokenUsage: 500,
        confidence: 0.8,
      },
    };
    expect(report.id).toBe('r1');
    expect(report.metadata.depth).toBe('deep');
  });

  it('ResearchProgressEvent discriminated union works', () => {
    const event: ResearchProgressEvent = {
      type: 'research_started',
      questionId: 'q1',
      subtopicCount: 4,
    };
    expect(event.type).toBe('research_started');
    if (event.type === 'research_started') {
      expect(event.subtopicCount).toBe(4);
    }
  });

  it('ResearchIntent has correct shape', () => {
    const intent: ResearchIntent = {
      score: 0.75,
      suggestedDepth: 'deep',
      reason: 'complex multi-faceted question',
      subtopicHints: ['topic A', 'topic B'],
    };
    expect(intent.score).toBe(0.75);
    expect(intent.suggestedDepth).toBe('deep');
  });

  it('ResearchJob tracks lifecycle', () => {
    const job: ResearchJob = {
      id: 'j1',
      question: 'test?',
      depth: 'deep',
      status: 'planning',
      createdAt: Date.now(),
      progress: [],
    };
    expect(job.status).toBe('planning');
    expect(job.report).toBeUndefined();
  });
});
