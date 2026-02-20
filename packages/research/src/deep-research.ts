import * as crypto from 'node:crypto';
import type {
  ResearchProvider,
  DeepResearchConfig,
  ResearchProgressEvent,
  Finding,
  Source,
  ResearchDepth,
} from './types.js';
import type { ResearchEngine } from './engine.js';

/** Minimal store interface — avoids hard dep on @auxiora/rag */
export interface ResearchDocumentStore {
  ingest(title: string, content: string, type: string): unknown;
}

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
  private readonly engine?: ResearchEngine;

  constructor(
    provider: ResearchProvider,
    config?: Partial<DeepResearchConfig>,
    engine?: ResearchEngine,
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.engine = engine;
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

  async execute(
    plan: ResearchPlan,
    store: ResearchDocumentStore,
    onProgress?: ProgressCallback,
  ): Promise<{ findings: Finding[]; sources: Source[] }> {
    const allFindings: Finding[] = [];
    const allSources: Source[] = [];

    const results = await Promise.all(
      plan.subtopics.map(async (subtopic, index) => {
        onProgress?.({
          type: 'research_searching',
          subtopic: subtopic.title,
          index,
          total: plan.subtopics.length,
        });

        const result = await this.engine!.research({
          topic: subtopic.queries[0],
          depth: 'standard',
          focusAreas: [subtopic.focus],
        });

        const findingsText = result.findings.map((f) => f.content).join('\n');
        store.ingest(subtopic.title, findingsText, 'text');

        onProgress?.({
          type: 'research_source_found',
          subtopic: subtopic.title,
          sourceCount: result.sources.length,
        });

        return result;
      }),
    );

    for (const result of results) {
      allFindings.push(...result.findings);
      allSources.push(...result.sources);
    }

    return { findings: allFindings, sources: allSources };
  }

  async evaluate(
    question: string,
    findingSummaries: string[],
    onProgress?: ProgressCallback,
  ): Promise<{ gaps: string[]; queries: string[] }> {
    const prompt = [
      {
        role: 'system' as const,
        content: `You are a research evaluator. Given a question and current findings, identify knowledge gaps. Return JSON only.

Format:
{
  "gaps": ["gap description 1", "gap description 2"],
  "queries": ["follow-up search query 1", "follow-up search query 2"]
}

If the research is sufficient, return empty arrays.`,
      },
      {
        role: 'user' as const,
        content: `Question: ${question}\n\nCurrent findings:\n${findingSummaries.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
      },
    ];

    const response = await this.provider.complete(prompt);
    const parsed = JSON.parse(response.content) as { gaps: string[]; queries: string[] };

    onProgress?.({
      type: 'research_evaluating',
      round: 0,
      gapCount: parsed.gaps.length,
    });

    return parsed;
  }

  async refine(
    queries: string[],
    store: ResearchDocumentStore,
    onProgress?: ProgressCallback,
  ): Promise<{ findings: Finding[]; sources: Source[] }> {
    const allFindings: Finding[] = [];
    const allSources: Source[] = [];

    onProgress?.({
      type: 'research_refining',
      round: 0,
      newQueries: queries.length,
    });

    const results = await Promise.all(
      queries.map(async (query) => {
        const result = await this.engine!.research({ topic: query, depth: 'quick' });
        const findingsText = result.findings.map((f) => f.content).join('\n');
        store.ingest(query, findingsText, 'text');
        return result;
      }),
    );

    for (const result of results) {
      allFindings.push(...result.findings);
      allSources.push(...result.sources);
    }

    return { findings: allFindings, sources: allSources };
  }

  async research(
    question: string,
    depth: ResearchDepth,
    onProgress?: ProgressCallback,
  ): Promise<{
    findings: Finding[];
    sources: Source[];
    executiveSummary: string;
    knowledgeGaps: string[];
    refinementRounds: number;
    duration: number;
    tokenUsage: number;
  }> {
    const startTime = Date.now();
    const store: ResearchDocumentStore = {
      ingest: () => undefined,
    };

    const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);

    return new Promise((resolve, reject) => {
      timeoutSignal.addEventListener('abort', () => {
        reject(new Error('Research timeout exceeded'));
      });

      (async () => {
        const questionId = crypto.randomUUID();

        onProgress?.({
          type: 'research_started',
          questionId,
          subtopicCount: 0,
        });

        const plan = await this.plan(question, onProgress);

        const { findings, sources } = await this.execute(plan, store, onProgress);

        const findingSummaries = findings.map((f) => f.content);
        let evalResult = await this.evaluate(question, findingSummaries, onProgress);

        let allFindings = [...findings];
        let allSources = [...sources];
        let rounds = 0;
        const maxRounds = this.config.maxRefinementRounds;

        while (evalResult.gaps.length > 0 && rounds < maxRounds) {
          rounds++;
          const refined = await this.refine(evalResult.queries, store, onProgress);
          allFindings.push(...refined.findings);
          allSources.push(...refined.sources);

          const updatedSummaries = allFindings.map((f) => f.content);
          evalResult = await this.evaluate(question, updatedSummaries, onProgress);
        }

        onProgress?.({
          type: 'research_synthesizing',
          findingCount: allFindings.length,
          sourceCount: allSources.length,
        });

        const duration = Date.now() - startTime;

        onProgress?.({
          type: 'research_complete',
          questionId,
          duration,
        });

        resolve({
          findings: allFindings,
          sources: allSources,
          executiveSummary: '',
          knowledgeGaps: evalResult.gaps,
          refinementRounds: rounds,
          duration,
          tokenUsage: 0,
        });
      })().catch(reject);
    });
  }
}
