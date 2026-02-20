export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface ResearchQuery {
  topic: string;
  depth: ResearchDepth;
  maxSources?: number;
  focusAreas?: string[];
}

export interface ResearchResult {
  id: string;
  query: ResearchQuery;
  findings: Finding[];
  executiveSummary: string;
  sources: Source[];
  confidence: number; // 0-1
  generatedAt: number;
  durationMs: number;
}

export interface Finding {
  id: string;
  content: string;
  sourceId: string;
  relevance: number; // 0-1
  category: string;
}

export interface Source {
  id: string;
  url: string;
  title: string;
  domain: string;
  accessedAt: number;
  credibilityScore: number; // 0-1
}

export interface CredibilityFactors {
  domainReputation: number;
  hasAuthor: boolean;
  hasDate: boolean;
  isHttps: boolean;
  crossReferenced: boolean;
}

export interface KnowledgeEntity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, string>;
}

export interface KnowledgeRelation {
  fromId: string;
  toId: string;
  relation: string;
}

/** Minimal provider interface — avoids hard dep on @auxiora/providers */
export interface ResearchProvider {
  complete(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    options?: { systemPrompt?: string; maxTokens?: number; temperature?: number },
  ): Promise<{ content: string }>;
}

export interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  extra_snippets?: string[];
}

export interface BraveSearchResponse {
  web?: {
    results: BraveWebResult[];
  };
}

// --- Deep Research Mode ---

export interface DeepResearchConfig {
  maxSubtopics: number;
  maxRefinementRounds: number;
  maxTotalSources: number;
  tokenBudget: number;
  timeoutMs: number;
}

export interface ReportSection {
  title: string;
  summary: string;
  findings: string[];
  sources: string[];
  confidence: number;
}

export interface CitedSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  credibilityScore: number;
  citedIn: string[];
}

export interface ResearchReport {
  id: string;
  question: string;
  executiveSummary: string;
  sections: ReportSection[];
  knowledgeGaps: string[];
  sources: CitedSource[];
  metadata: {
    depth: ResearchDepth;
    totalSources: number;
    refinementRounds: number;
    duration: number;
    tokenUsage: number;
    confidence: number;
  };
}

export type ResearchProgressEvent =
  | { type: 'research_started'; questionId: string; subtopicCount: number }
  | { type: 'research_planning'; subtopics: string[] }
  | { type: 'research_searching'; subtopic: string; index: number; total: number }
  | { type: 'research_source_found'; subtopic: string; sourceCount: number }
  | { type: 'research_evaluating'; round: number; gapCount: number }
  | { type: 'research_refining'; round: number; newQueries: number }
  | { type: 'research_synthesizing'; findingCount: number; sourceCount: number }
  | { type: 'research_complete'; questionId: string; duration: number }
  | { type: 'research_failed'; questionId: string; error: string };

export interface ResearchIntent {
  score: number;
  suggestedDepth: ResearchDepth;
  reason: string;
  subtopicHints: string[];
}

export type ResearchJobStatus =
  | 'planning'
  | 'searching'
  | 'evaluating'
  | 'refining'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ResearchJob {
  id: string;
  question: string;
  depth: ResearchDepth;
  status: ResearchJobStatus;
  createdAt: number;
  completedAt?: number;
  progress: ResearchProgressEvent[];
  report?: ResearchReport;
  error?: string;
}
