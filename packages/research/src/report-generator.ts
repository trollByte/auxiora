import * as crypto from 'node:crypto';
import type {
  ResearchProvider,
  ResearchReport,
  ReportSection,
  CitedSource,
  ResearchDepth,
  Finding,
  Source,
} from './types.js';

export interface ReportInput {
  question: string;
  findings: Finding[];
  sources: Source[];
  knowledgeGaps: string[];
  depth: ResearchDepth;
  refinementRounds: number;
  duration: number;
  tokenUsage: number;
}

export interface SummaryInput {
  question: string;
  findings: Finding[];
  sources: Source[];
}

export class ReportGenerator {
  private readonly provider: ResearchProvider;

  constructor(provider: ResearchProvider) {
    this.provider = provider;
  }

  async generateReport(input: ReportInput): Promise<ResearchReport> {
    const { question, findings, sources, knowledgeGaps, depth, refinementRounds, duration, tokenUsage } = input;

    // Ask LLM to organize findings into sections
    const findingsContext = findings.map(f => `[${f.id}] (source: ${f.sourceId}, category: ${f.category}): ${f.content}`).join('\n');
    const sourcesContext = sources.map(s => `[${s.id}] ${s.title} (${s.url}, credibility: ${s.credibilityScore})`).join('\n');

    const messages = [
      {
        role: 'system' as const,
        content: `You are a research report generator. Organize findings into themed sections. Return JSON only.

Format:
{
  "sections": [
    { "title": "Section Title", "summary": "section summary", "findings": ["f1", "f2"], "sources": ["s1"], "confidence": 0.85 }
  ],
  "executiveSummary": "concise executive summary of all findings"
}

Rules:
- Group findings by theme/category
- Each section should reference finding IDs and source IDs
- Confidence per section: 0-1 based on source quality and agreement
- Executive summary: 2-4 sentences covering key takeaways`,
      },
      {
        role: 'user' as const,
        content: `Question: ${question}\n\nFindings:\n${findingsContext}\n\nSources:\n${sourcesContext}`,
      },
    ];

    const response = await this.provider.complete(messages);
    const parsed = JSON.parse(response.content) as {
      sections: ReportSection[];
      executiveSummary: string;
    };

    // Build CitedSource list with cross-references
    const citedSources: CitedSource[] = sources.map(s => {
      const citedIn = (parsed.sections || [])
        .filter(sec => sec.sources.includes(s.id))
        .map(sec => sec.title);
      return {
        id: s.id,
        url: s.url,
        title: s.title,
        domain: s.domain,
        credibilityScore: s.credibilityScore,
        citedIn,
      };
    });

    // Compute overall confidence as average of section confidences
    const sections = parsed.sections || [];
    const avgConfidence = sections.length > 0
      ? sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length
      : 0;

    return {
      id: crypto.randomUUID(),
      question,
      executiveSummary: parsed.executiveSummary || '',
      sections,
      knowledgeGaps,
      sources: citedSources,
      metadata: {
        depth,
        totalSources: sources.length,
        refinementRounds,
        duration,
        tokenUsage,
        confidence: avgConfidence,
      },
    };
  }

  async generateSummary(input: SummaryInput): Promise<string> {
    const { question, findings, sources } = input;

    const findingsContext = findings.map((f, i) => `${i + 1}. ${f.content}`).join('\n');
    const sourcesContext = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})`).join('\n');

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a research assistant. Provide a concise conversational summary of the findings with inline citations like [1], [2]. End with a sources list.',
      },
      {
        role: 'user' as const,
        content: `Question: ${question}\n\nFindings:\n${findingsContext}\n\nSources:\n${sourcesContext}`,
      },
    ];

    const response = await this.provider.complete(messages);
    return response.content;
  }
}
