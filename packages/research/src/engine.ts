import { nanoid } from 'nanoid';
import type { ResearchDepth, ResearchQuery, ResearchResult, Finding, Source } from './types.js';

export interface ResearchEngineConfig {
  maxConcurrentSources?: number;
  defaultDepth?: ResearchDepth;
}

export class ResearchEngine {
  private readonly config: Required<ResearchEngineConfig>;

  constructor(config?: ResearchEngineConfig) {
    this.config = {
      maxConcurrentSources: config?.maxConcurrentSources ?? 5,
      defaultDepth: config?.defaultDepth ?? 'standard',
    };
  }

  research(query: ResearchQuery): ResearchResult {
    const startTime = Date.now();
    const depth = query.depth ?? this.config.defaultDepth;

    const maxSources = query.maxSources ?? this.getMaxSources(depth);
    const searchQueries = this.planResearch(query.topic, depth);

    const sources: Source[] = [];
    const findings: Finding[] = [];

    for (let i = 0; i < Math.min(searchQueries.length, maxSources); i++) {
      const source: Source = {
        id: nanoid(),
        url: `https://example.com/source-${i}`,
        title: `Source for: ${searchQueries[i]}`,
        domain: 'example.com',
        accessedAt: Date.now(),
        credibilityScore: 0.5,
      };
      sources.push(source);

      findings.push({
        id: nanoid(),
        content: `Finding from research on: ${searchQueries[i]}`,
        sourceId: source.id,
        relevance: 1 - i * 0.1,
        category: 'general',
      });
    }

    const deduplicated = this.deduplicateFindings(findings);
    const executiveSummary = this.synthesize(deduplicated);

    return {
      id: nanoid(),
      query,
      findings: deduplicated,
      executiveSummary,
      sources,
      confidence: Math.min(deduplicated.length / maxSources, 1),
      generatedAt: Date.now(),
      durationMs: Date.now() - startTime,
    };
  }

  planResearch(topic: string, depth: ResearchDepth): string[] {
    switch (depth) {
      case 'quick':
        return [topic];
      case 'standard':
        return [topic, `${topic} overview`, `${topic} analysis`];
      case 'deep':
        return [
          topic,
          `${topic} overview`,
          `${topic} analysis`,
          `${topic} comparison`,
          `${topic} best practices`,
          `${topic} research papers`,
        ];
    }
  }

  synthesize(findings: Finding[]): string {
    const sourceIds = new Set(findings.map((f) => f.sourceId));
    const topFindings = findings
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
      .map((f) => f.content);

    return `Based on ${findings.length} findings from ${sourceIds.size} sources: ${topFindings.join('. ')}`;
  }

  deduplicateFindings(findings: Finding[]): Finding[] {
    const seen = new Set<string>();
    return findings.filter((f) => {
      if (seen.has(f.content)) {
        return false;
      }
      seen.add(f.content);
      return true;
    });
  }

  private getMaxSources(depth: ResearchDepth): number {
    switch (depth) {
      case 'quick':
        return 3;
      case 'standard':
        return 5;
      case 'deep':
        return 10;
    }
  }
}
