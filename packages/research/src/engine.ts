import { nanoid } from 'nanoid';
import type { ResearchDepth, ResearchQuery, ResearchResult, Finding, Source, ResearchProvider } from './types.js';
import { BraveSearchClient } from './brave-search.js';
import { CredibilityScorer } from './credibility.js';
import { CitationTracker } from './citation.js';

export interface ResearchEngineConfig {
  maxConcurrentSources?: number;
  defaultDepth?: ResearchDepth;
  braveApiKey?: string;
  searchTimeout?: number;
  fetchTimeout?: number;
  provider?: ResearchProvider;
}

export class ResearchEngine {
  private readonly config: Required<Omit<ResearchEngineConfig, 'provider' | 'braveApiKey'>>;
  private readonly braveClient: BraveSearchClient;
  private readonly provider?: ResearchProvider;
  private readonly credibilityScorer = new CredibilityScorer();

  constructor(config?: ResearchEngineConfig) {
    const apiKey = config?.braveApiKey ?? process.env.AUXIORA_RESEARCH_BRAVE_API_KEY;
    if (!apiKey) {
      throw new Error('Research engine requires a Brave Search API key (braveApiKey or AUXIORA_RESEARCH_BRAVE_API_KEY)');
    }

    this.config = {
      maxConcurrentSources: config?.maxConcurrentSources ?? 5,
      defaultDepth: config?.defaultDepth ?? 'standard',
      searchTimeout: config?.searchTimeout ?? 10_000,
      fetchTimeout: config?.fetchTimeout ?? 15_000,
    };

    this.braveClient = new BraveSearchClient({
      apiKey,
      searchTimeout: this.config.searchTimeout,
      fetchTimeout: this.config.fetchTimeout,
    });

    this.provider = config?.provider;
  }

  async research(query: ResearchQuery): Promise<ResearchResult> {
    const startTime = Date.now();
    const depth = query.depth ?? this.config.defaultDepth;
    const maxSources = query.maxSources ?? this.getMaxSources(depth);
    const searchQueries = this.planResearch(query.topic, depth, query.focusAreas);

    const tracker = new CitationTracker();
    const findings: Finding[] = [];

    // Execute searches in parallel, limited to maxSources total results
    const searchPromises = searchQueries.map((q) => this.braveClient.search(q, 3));
    const searchResults = await Promise.all(searchPromises);

    // Flatten and deduplicate by URL, cap at maxSources
    const seenUrls = new Set<string>();
    const uniqueResults: { query: string; url: string; title: string; snippet: string }[] = [];

    for (let i = 0; i < searchResults.length; i++) {
      for (const result of searchResults[i]) {
        if (!seenUrls.has(result.url) && uniqueResults.length < maxSources) {
          seenUrls.add(result.url);
          uniqueResults.push({
            query: searchQueries[i],
            url: result.url,
            title: result.title,
            snippet: result.description,
          });
        }
      }
    }

    // Fetch pages in parallel
    const fetchPromises = uniqueResults.map((r) => this.braveClient.fetchPage(r.url));
    const pageContents = await Promise.all(fetchPromises);

    // Process each result
    for (let i = 0; i < uniqueResults.length; i++) {
      const r = uniqueResults[i];
      const credibility = this.credibilityScorer.score(r.url, {
        isHttps: r.url.startsWith('https'),
      });
      const source = tracker.addSource(r.url, r.title, credibility);

      const content = pageContents[i];
      if (this.provider && content) {
        // AI-powered extraction
        const extracted = await this.extractFindings(r.query, content, r.title);
        for (const text of extracted) {
          tracker.addFinding(text, source.id, credibility, 'general');
        }
      } else {
        // Fallback: use search snippet + first paragraph from fetched content
        let text = r.snippet;
        if (content) {
          const firstParagraph = content.split('\n\n').find((p) => p.trim().length > 50);
          if (firstParagraph) {
            text += ' ' + firstParagraph.trim();
          }
        }
        tracker.addFinding(text, source.id, credibility, 'general');
      }
    }

    const allFindings = tracker.getFindings();
    const deduplicated = this.deduplicateFindings(allFindings);
    const sources = tracker.getSources();

    // Synthesize summary
    let executiveSummary: string;
    if (this.provider && deduplicated.length > 0) {
      executiveSummary = await this.synthesizeWithAI(query.topic, deduplicated, sources);
    } else {
      executiveSummary = this.synthesize(deduplicated);
    }

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

  planResearch(topic: string, depth: ResearchDepth, focusAreas?: string[]): string[] {
    let queries: string[];
    switch (depth) {
      case 'quick':
        queries = [topic];
        break;
      case 'standard':
        queries = [topic, `${topic} overview`, `${topic} analysis`];
        break;
      case 'deep':
        queries = [
          topic,
          `${topic} overview`,
          `${topic} analysis`,
          `${topic} comparison`,
          `${topic} best practices`,
          `${topic} research papers`,
        ];
        break;
    }

    if (focusAreas?.length) {
      for (const area of focusAreas) {
        queries.push(`${topic} ${area}`);
      }
    }

    return queries;
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

  private async extractFindings(query: string, content: string, title: string): Promise<string[]> {
    if (!this.provider) return [];

    try {
      const result = await this.provider.complete(
        [{ role: 'user', content: `Extract key findings from this source about "${query}".\n\nSource: ${title}\n\nContent:\n${content.slice(0, 8000)}` }],
        {
          systemPrompt: 'You are a research assistant. Extract 2-4 distinct factual findings from the source. Return each finding on a separate line, prefixed with "- ". Be concise and factual.',
          maxTokens: 500,
          temperature: 0.1,
        },
      );

      return result.content
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim())
        .filter((line) => line.length > 10);
    } catch {
      return [];
    }
  }

  private async synthesizeWithAI(topic: string, findings: Finding[], sources: Source[]): Promise<string> {
    if (!this.provider) return this.synthesize(findings);

    try {
      const findingsText = findings
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 10)
        .map((f, i) => `${i + 1}. ${f.content}`)
        .join('\n');

      const sourcesText = sources
        .map((s) => `- ${s.title} (${s.domain}, credibility: ${s.credibilityScore.toFixed(2)})`)
        .join('\n');

      const result = await this.provider.complete(
        [{ role: 'user', content: `Synthesize these research findings about "${topic}" into a concise executive summary.\n\nFindings:\n${findingsText}\n\nSources:\n${sourcesText}` }],
        {
          systemPrompt: 'You are a research analyst. Write a concise executive summary (2-4 paragraphs) synthesizing the findings. Mention source credibility where relevant. Be factual and balanced.',
          maxTokens: 800,
          temperature: 0.3,
        },
      );

      return result.content;
    } catch {
      return this.synthesize(findings);
    }
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
