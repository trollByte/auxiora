import * as crypto from 'node:crypto';
import type {
  ResearchProvider,
  DeepResearchConfig,
  ResearchProgressEvent,
} from './types.js';

export interface SubtopicPlan {
  title: string;
  queries: string[];
  focus: string;
}

export interface ResearchPlan {
  questionId: string;
  question: string;
  subtopics: SubtopicPlan[];
}

type ProgressCallback = (event: ResearchProgressEvent) => void;

const DEFAULT_CONFIG: DeepResearchConfig = {
  maxSubtopics: 6,
  maxRefinementRounds: 2,
  maxTotalSources: 20,
  tokenBudget: 100_000,
  timeoutMs: 300_000,
};

export class DeepResearchOrchestrator {
  private readonly provider: ResearchProvider;
  private readonly config: DeepResearchConfig;

  constructor(provider: ResearchProvider, config?: Partial<DeepResearchConfig>) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async plan(
    question: string,
    onProgress?: ProgressCallback,
  ): Promise<ResearchPlan> {
    const questionId = crypto.randomUUID();

    const prompt = [
      {
        role: 'system' as const,
        content: `You are a research planner. Decompose the user's question into subtopics for parallel research. Return JSON only.

Format:
{
  "subtopics": [
    { "title": "Subtopic Name", "queries": ["search query 1", "search query 2"], "focus": "what to focus on" }
  ]
}

Rules:
- Generate 3-8 subtopics
- Each subtopic should have 1-3 specific search queries
- Focus areas should guide what information to extract
- Cover different angles of the question`,
      },
      { role: 'user' as const, content: question },
    ];

    const response = await this.provider.complete(prompt);
    const parsed = JSON.parse(response.content) as { subtopics: SubtopicPlan[] };

    if (!parsed.subtopics || !Array.isArray(parsed.subtopics)) {
      throw new Error('LLM response missing subtopics array');
    }

    const subtopics = parsed.subtopics.slice(0, this.config.maxSubtopics);

    onProgress?.({
      type: 'research_planning',
      subtopics: subtopics.map(s => s.title),
    });

    return { questionId, question, subtopics };
  }
}
