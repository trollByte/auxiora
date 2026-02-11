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
