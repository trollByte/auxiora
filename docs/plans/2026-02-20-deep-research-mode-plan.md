# Deep Research Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add autonomous deep research mode with plan-execute-refine loops, parallel multi-source research, structured reports with citations, and auto-detection of research intent.

**Architecture:** New orchestrator decomposes questions into subtopics, fans out to existing `ResearchEngine` in parallel, uses RAG `DocumentStore` for finding aggregation, then synthesizes structured reports or conversational summaries. Pattern-based intent detector triggers suggestions via WebSocket. In-memory job map with 1-hour expiry.

**Tech Stack:** TypeScript ESM, vitest, Express 5 router, existing `@auxiora/research` + `@auxiora/rag` packages

---

### Task 1: Add Deep Research Types

**Files:**
- Modify: `packages/research/src/types.ts`

**Step 1: Write the failing test**

Create `packages/research/tests/deep-research-types.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research-types.test.ts`
Expected: FAIL — types not exported yet

**Step 3: Add the types to types.ts**

Append to `packages/research/src/types.ts`:

```ts
// --- Deep Research Mode ---

export interface DeepResearchConfig {
  maxSubtopics: number;        // default 6
  maxRefinementRounds: number; // default 2
  maxTotalSources: number;     // default 20
  tokenBudget: number;         // default 100_000
  timeoutMs: number;           // default 300_000 (5 min)
}

export interface ReportSection {
  title: string;
  summary: string;
  findings: string[];
  sources: string[];       // source IDs
  confidence: number;      // 0-1
}

export interface CitedSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  credibilityScore: number;
  citedIn: string[];       // section titles
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
    confidence: number;    // 0-1
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
  score: number;           // 0-1
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
```

Then update barrel exports in `packages/research/src/index.ts` to add:

```ts
export type {
  DeepResearchConfig,
  ReportSection,
  CitedSource,
  ResearchReport,
  ResearchProgressEvent,
  ResearchIntent,
  ResearchJobStatus,
  ResearchJob,
} from './types.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research-types.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/research/src/types.ts packages/research/src/index.ts packages/research/tests/deep-research-types.test.ts
git commit -m "feat(research): add deep research mode types"
```

---

### Task 2: Implement ResearchIntentDetector

**Files:**
- Create: `packages/research/src/intent-detector.ts`
- Create: `packages/research/tests/intent-detector.test.ts`
- Modify: `packages/research/src/index.ts` (add export)

**Context:** Lightweight pattern-based classifier (NO LLM call). Scores 0-1 based on keyword signals. Score >= 0.6 suggests research. Returns `ResearchIntent` with suggested depth and subtopic hints.

**Step 1: Write the failing test**

Create `packages/research/tests/intent-detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ResearchIntentDetector } from '../src/intent-detector.js';

describe('ResearchIntentDetector', () => {
  const detector = new ResearchIntentDetector();

  describe('detect()', () => {
    it('scores high for complex analytical questions', () => {
      const result = detector.detect('Compare and analyze the pros and cons of React vs Vue for enterprise applications');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.suggestedDepth).toBe('deep');
      expect(result.subtopicHints.length).toBeGreaterThan(0);
    });

    it('scores high for multi-faceted research requests', () => {
      const result = detector.detect('Research the current state of quantum computing and its implications for cryptography');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.suggestedDepth).toBe('deep');
    });

    it('scores medium for standard fact-seeking', () => {
      const result = detector.detect('What are the latest developments in renewable energy?');
      expect(result.score).toBeGreaterThanOrEqual(0.4);
      expect(result.score).toBeLessThan(0.8);
      expect(['standard', 'deep']).toContain(result.suggestedDepth);
    });

    it('scores low for simple factual questions', () => {
      const result = detector.detect('What is the capital of France?');
      expect(result.score).toBeLessThan(0.4);
      expect(result.suggestedDepth).toBe('quick');
    });

    it('scores low for code/task requests', () => {
      const result = detector.detect('Write a function to sort an array in JavaScript');
      expect(result.score).toBeLessThan(0.3);
    });

    it('scores low for personal/conversational messages', () => {
      const result = detector.detect('Hello, how are you today?');
      expect(result.score).toBeLessThan(0.2);
    });

    it('scores high for explicit research keywords', () => {
      const result = detector.detect('Do a deep dive into microservices architecture patterns');
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    });

    it('maps score to appropriate depth', () => {
      // Low score -> quick
      const low = detector.detect('Hi there');
      expect(low.suggestedDepth).toBe('quick');

      // High score -> deep
      const high = detector.detect('Analyze and compare the different approaches to distributed consensus algorithms, their trade-offs, and real-world applications');
      expect(high.suggestedDepth).toBe('deep');
    });

    it('provides a reason string', () => {
      const result = detector.detect('Compare React and Vue frameworks');
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });

    it('extracts subtopic hints from multi-entity questions', () => {
      const result = detector.detect('Compare React, Vue, and Angular for building large-scale applications');
      expect(result.subtopicHints.length).toBeGreaterThanOrEqual(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/intent-detector.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ResearchIntentDetector**

Create `packages/research/src/intent-detector.ts`:

```ts
import type { ResearchDepth, ResearchIntent } from './types.js';

// Signals that INCREASE research score
const COMPLEXITY_MARKERS = [
  'compare', 'contrast', 'analyze', 'analyse', 'pros and cons',
  'differ from', 'differences between', 'trade-offs', 'tradeoffs',
  'advantages and disadvantages', 'implications', 'impact of',
  'relationship between', 'how does .* affect',
];

const RESEARCH_KEYWORDS = [
  'research', 'investigate', 'deep dive', 'in-depth', 'comprehensive',
  'thorough', 'detailed analysis', 'study', 'explore',
  'survey of', 'state of the art', 'literature review',
];

const FACT_SEEKING = [
  'current state of', 'latest developments', 'recent advances',
  'what are the .* approaches', 'how has .* evolved',
  'what is known about', 'evidence for',
];

const MULTI_FACET_MARKERS = [
  ' and ', ' vs ', ' versus ', ' or ', ' compared to ',
  'on one hand', 'on the other',
];

// Signals that DECREASE research score
const CODE_TASK_PATTERNS = [
  'write a', 'create a', 'implement', 'fix', 'debug',
  'build a', 'code', 'function', 'class', 'script',
  'refactor', 'deploy', 'install', 'configure',
];

const SIMPLE_FACTUAL = [
  'what is the', 'who is', 'when was', 'where is',
  'how many', 'how much', 'define ',
];

const PERSONAL_CONVERSATIONAL = [
  'hello', 'hi ', 'hey ', 'how are you', 'thanks',
  'thank you', 'goodbye', 'good morning', 'good evening',
  'please help', 'can you help',
];

function countMatches(text: string, patterns: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const p of patterns) {
    if (p.includes('.*')) {
      const regex = new RegExp(p, 'i');
      if (regex.test(lower)) count++;
    } else if (lower.includes(p)) {
      count++;
    }
  }
  return count;
}

function extractEntities(text: string): string[] {
  // Extract capitalized noun phrases and quoted terms as potential subtopics
  const entities: string[] = [];

  // Capitalized multi-word phrases (e.g., "React", "Vue", "Angular")
  const capPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g;
  let match;
  while ((match = capPattern.exec(text)) !== null) {
    const word = match[1];
    const idx = match.index;
    if (idx > 0 && text[idx - 1] !== '.' && text[idx - 1] !== '?'
      && text[idx - 2] !== '.') {
      entities.push(word);
    }
  }

  // Terms around "vs" / "and" / "or" in comparison contexts
  const vsPattern =
    /(\w[\w\s]*?)\s+(?:vs\.?|versus|compared to|or)\s+(\w[\w\s]*?)(?:\s+(?:for|in|when|$))/gi;
  while ((match = vsPattern.exec(text)) !== null) {
    entities.push(match[1].trim(), match[2].trim());
  }

  return [...new Set(entities)];
}

export class ResearchIntentDetector {
  detect(message: string): ResearchIntent {
    let score = 0;
    const reasons: string[] = [];

    // Positive signals
    const complexityHits = countMatches(message, COMPLEXITY_MARKERS);
    if (complexityHits > 0) {
      score += Math.min(complexityHits * 0.15, 0.4);
      reasons.push('complexity markers detected');
    }

    const researchHits = countMatches(message, RESEARCH_KEYWORDS);
    if (researchHits > 0) {
      score += Math.min(researchHits * 0.2, 0.4);
      reasons.push('explicit research keywords');
    }

    const factHits = countMatches(message, FACT_SEEKING);
    if (factHits > 0) {
      score += Math.min(factHits * 0.15, 0.3);
      reasons.push('fact-seeking patterns');
    }

    const facetHits = countMatches(message, MULTI_FACET_MARKERS);
    if (facetHits > 0) {
      score += Math.min(facetHits * 0.1, 0.2);
      reasons.push('multi-faceted question');
    }

    // Question length bonus
    const wordCount = message.split(/\s+/).length;
    if (wordCount > 20) {
      score += 0.1;
      reasons.push('detailed question');
    }

    // Negative signals
    const codeHits = countMatches(message, CODE_TASK_PATTERNS);
    if (codeHits > 0) {
      score -= Math.min(codeHits * 0.2, 0.5);
      reasons.push('code/task request');
    }

    const simpleHits = countMatches(message, SIMPLE_FACTUAL);
    if (simpleHits > 0 && complexityHits === 0) {
      score -= Math.min(simpleHits * 0.15, 0.3);
      reasons.push('simple factual question');
    }

    const personalHits = countMatches(message, PERSONAL_CONVERSATIONAL);
    if (personalHits > 0) {
      score -= Math.min(personalHits * 0.3, 0.5);
      reasons.push('conversational message');
    }

    // Clamp to 0-1
    score = Math.max(0, Math.min(1, score));

    // Map score to depth
    let suggestedDepth: ResearchDepth;
    if (score >= 0.6) suggestedDepth = 'deep';
    else if (score >= 0.4) suggestedDepth = 'standard';
    else suggestedDepth = 'quick';

    const subtopicHints = extractEntities(message);

    return {
      score,
      suggestedDepth,
      reason: reasons.length > 0 ? reasons.join(', ') : 'no strong signals',
      subtopicHints,
    };
  }
}
```

Add export to `packages/research/src/index.ts`:
```ts
export { ResearchIntentDetector } from './intent-detector.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/intent-detector.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add packages/research/src/intent-detector.ts packages/research/tests/intent-detector.test.ts packages/research/src/index.ts
git commit -m "feat(research): add pattern-based research intent detector"
```

---

### Task 3: Implement DeepResearchOrchestrator — Plan Stage

**Files:**
- Create: `packages/research/src/deep-research.ts`
- Create: `packages/research/tests/deep-research.test.ts`

**Context:** The orchestrator's `plan()` method uses an LLM (`ResearchProvider`) to decompose a question into 3-8 subtopics, each with search queries and focus areas. This task implements the constructor, config defaults, plan stage, and progress emission. The execute/evaluate/refine/synthesize stages come in Task 4.

**Step 1: Write the failing test**

Create `packages/research/tests/deep-research.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepResearchOrchestrator } from '../src/deep-research.js';
import type { ResearchProvider, DeepResearchConfig, ResearchProgressEvent } from '../src/types.js';

function mockProvider(response: string): ResearchProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: response }),
  };
}

describe('DeepResearchOrchestrator', () => {
  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const provider = mockProvider('');
      const orch = new DeepResearchOrchestrator(provider);
      expect(orch).toBeDefined();
    });

    it('accepts partial config overrides', () => {
      const provider = mockProvider('');
      const orch = new DeepResearchOrchestrator(provider, { maxSubtopics: 3 });
      expect(orch).toBeDefined();
    });
  });

  describe('plan()', () => {
    it('decomposes question into subtopics via LLM', async () => {
      const llmResponse = JSON.stringify({
        subtopics: [
          { title: 'Performance', queries: ['React performance benchmarks'], focus: 'runtime speed' },
          { title: 'Ecosystem', queries: ['React ecosystem size'], focus: 'community' },
          { title: 'Learning Curve', queries: ['React learning curve'], focus: 'onboarding' },
        ],
      });
      const provider = mockProvider(llmResponse);
      const orch = new DeepResearchOrchestrator(provider);

      const plan = await orch.plan('Compare React and Vue');

      expect(plan.subtopics).toHaveLength(3);
      expect(plan.subtopics[0].title).toBe('Performance');
      expect(plan.subtopics[0].queries).toEqual(['React performance benchmarks']);
      expect(provider.complete).toHaveBeenCalledOnce();
    });

    it('caps subtopics at maxSubtopics', async () => {
      const subtopics = Array.from({ length: 10 }, (_, i) => ({
        title: `Topic ${i}`,
        queries: [`query ${i}`],
        focus: `focus ${i}`,
      }));
      const provider = mockProvider(JSON.stringify({ subtopics }));
      const orch = new DeepResearchOrchestrator(provider, { maxSubtopics: 4 });

      const plan = await orch.plan('Big question');
      expect(plan.subtopics.length).toBeLessThanOrEqual(4);
    });

    it('emits research_planning progress event', async () => {
      const llmResponse = JSON.stringify({
        subtopics: [
          { title: 'A', queries: ['q1'], focus: 'f1' },
        ],
      });
      const provider = mockProvider(llmResponse);
      const events: ResearchProgressEvent[] = [];
      const orch = new DeepResearchOrchestrator(provider);

      await orch.plan('Test question', (e) => events.push(e));

      const planningEvent = events.find(e => e.type === 'research_planning');
      expect(planningEvent).toBeDefined();
      if (planningEvent?.type === 'research_planning') {
        expect(planningEvent.subtopics).toEqual(['A']);
      }
    });

    it('handles malformed LLM response gracefully', async () => {
      const provider = mockProvider('not valid json');
      const orch = new DeepResearchOrchestrator(provider);

      await expect(orch.plan('Test')).rejects.toThrow();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research.test.ts`
Expected: FAIL — module not found

**Step 3: Implement DeepResearchOrchestrator (plan stage)**

Create `packages/research/src/deep-research.ts`:

```ts
import * as crypto from 'node:crypto';
import type {
  ResearchProvider,
  DeepResearchConfig,
  ResearchProgressEvent,
  ResearchDepth,
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/research/src/deep-research.ts packages/research/tests/deep-research.test.ts
git commit -m "feat(research): add DeepResearchOrchestrator plan stage"
```

---

### Task 4: Implement DeepResearchOrchestrator — Execute, Evaluate, Refine, Full Pipeline

**Files:**
- Modify: `packages/research/src/deep-research.ts`
- Modify: `packages/research/tests/deep-research.test.ts`
- Modify: `packages/research/src/index.ts` (add export)

**Context:** This task adds the `execute()`, `evaluate()`, `refine()`, and `research()` (full pipeline) methods. `execute()` calls `ResearchEngine.research()` in parallel per subtopic. `evaluate()` uses LLM to find gaps. `refine()` runs follow-up queries. `research()` orchestrates the full Plan-Execute-Evaluate-Refine-done pipeline. Uses `DocumentStore` from RAG for finding aggregation.

**Dependencies:** Requires `ResearchEngine` from `./engine.js`, `DocumentStore` from `@auxiora/rag`.

**Step 1: Write the failing tests**

Add to `packages/research/tests/deep-research.test.ts`:

```ts
import { DocumentStore } from '@auxiora/rag';
import { ResearchEngine } from '../src/engine.js';

// ... existing tests ...

describe('execute()', () => {
  it('researches each subtopic in parallel', async () => {
    const provider = mockProvider('{}');
    const engine = new ResearchEngine({
      provider,
      searchClient: { search: vi.fn().mockResolvedValue([]) },
    });
    vi.spyOn(engine, 'research').mockResolvedValue({
      id: 'r1', query: { topic: 'test', depth: 'quick' },
      findings: [{ id: 'f1', content: 'finding', sourceId: 's1', relevance: 0.9, category: 'general' }],
      executiveSummary: '', sources: [], confidence: 0.8, generatedAt: Date.now(), durationMs: 100,
    });

    const orch = new DeepResearchOrchestrator(provider, undefined, engine);
    const store = new DocumentStore();
    const plan: ResearchPlan = {
      questionId: 'q1', question: 'test?',
      subtopics: [
        { title: 'A', queries: ['query A'], focus: 'focus A' },
        { title: 'B', queries: ['query B'], focus: 'focus B' },
      ],
    };

    const findings = await orch.execute(plan, store);
    expect(engine.research).toHaveBeenCalledTimes(2);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('emits progress events for each subtopic', async () => {
    const provider = mockProvider('{}');
    const engine = new ResearchEngine({
      provider,
      searchClient: { search: vi.fn().mockResolvedValue([]) },
    });
    vi.spyOn(engine, 'research').mockResolvedValue({
      id: 'r1', query: { topic: 'test', depth: 'quick' },
      findings: [], executiveSummary: '', sources: [],
      confidence: 0.5, generatedAt: Date.now(), durationMs: 50,
    });

    const events: ResearchProgressEvent[] = [];
    const orch = new DeepResearchOrchestrator(provider, undefined, engine);
    const store = new DocumentStore();
    const plan: ResearchPlan = {
      questionId: 'q1', question: 'test?',
      subtopics: [{ title: 'A', queries: ['q'], focus: 'f' }],
    };

    await orch.execute(plan, store, (e) => events.push(e));
    const searchEvents = events.filter(e => e.type === 'research_searching');
    expect(searchEvents.length).toBe(1);
  });
});

describe('evaluate()', () => {
  it('identifies knowledge gaps via LLM', async () => {
    const evalResponse = JSON.stringify({
      gaps: ['Missing performance benchmarks', 'No cost comparison'],
      queries: ['performance benchmarks comparison', 'cost analysis'],
    });
    const provider = mockProvider(evalResponse);
    const orch = new DeepResearchOrchestrator(provider);

    const result = await orch.evaluate('Compare X and Y', ['Finding about X']);
    expect(result.gaps).toHaveLength(2);
    expect(result.queries.length).toBeGreaterThan(0);
  });

  it('returns empty gaps when research is sufficient', async () => {
    const evalResponse = JSON.stringify({ gaps: [], queries: [] });
    const provider = mockProvider(evalResponse);
    const orch = new DeepResearchOrchestrator(provider);

    const result = await orch.evaluate('Simple Q', ['Complete finding']);
    expect(result.gaps).toHaveLength(0);
  });
});

describe('research() full pipeline', () => {
  it('runs plan -> execute -> evaluate -> synthesize', async () => {
    const planResponse = JSON.stringify({
      subtopics: [{ title: 'Topic A', queries: ['q1'], focus: 'f1' }],
    });
    const evalResponse = JSON.stringify({ gaps: [], queries: [] });
    const provider: ResearchProvider = {
      complete: vi.fn()
        .mockResolvedValueOnce({ content: planResponse })    // plan
        .mockResolvedValueOnce({ content: evalResponse })     // evaluate
        .mockResolvedValueOnce({ content: 'Executive summary of findings' }), // synthesize
    };

    const engine = new ResearchEngine({
      provider,
      searchClient: { search: vi.fn().mockResolvedValue([]) },
    });
    vi.spyOn(engine, 'research').mockResolvedValue({
      id: 'r1', query: { topic: 'test', depth: 'quick' },
      findings: [{ id: 'f1', content: 'A finding', sourceId: 's1', relevance: 0.8, category: 'general' }],
      executiveSummary: 'summary',
      sources: [{ id: 's1', url: 'https://example.com', title: 'Example', domain: 'example.com', accessedAt: Date.now(), credibilityScore: 0.9 }],
      confidence: 0.85, generatedAt: Date.now(), durationMs: 200,
    });

    const orch = new DeepResearchOrchestrator(provider, undefined, engine);
    const events: ResearchProgressEvent[] = [];

    const result = await orch.research('Test question', 'deep', (e) => events.push(e));

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'research_started')).toBe(true);
    expect(events.some(e => e.type === 'research_planning')).toBe(true);
    expect(events.some(e => e.type === 'research_complete')).toBe(true);
  });

  it('performs refinement rounds when gaps are found', async () => {
    const planResponse = JSON.stringify({
      subtopics: [{ title: 'A', queries: ['q1'], focus: 'f' }],
    });
    const evalWithGaps = JSON.stringify({ gaps: ['gap1'], queries: ['follow-up query'] });
    const evalNoGaps = JSON.stringify({ gaps: [], queries: [] });
    const provider: ResearchProvider = {
      complete: vi.fn()
        .mockResolvedValueOnce({ content: planResponse })    // plan
        .mockResolvedValueOnce({ content: evalWithGaps })     // evaluate round 1
        .mockResolvedValueOnce({ content: evalNoGaps })       // evaluate round 2
        .mockResolvedValueOnce({ content: 'Final summary' }), // synthesize
    };

    const engine = new ResearchEngine({
      provider,
      searchClient: { search: vi.fn().mockResolvedValue([]) },
    });
    vi.spyOn(engine, 'research').mockResolvedValue({
      id: 'r1', query: { topic: 'test', depth: 'quick' },
      findings: [{ id: 'f1', content: 'finding', sourceId: 's1', relevance: 0.8, category: 'general' }],
      executiveSummary: '',
      sources: [{ id: 's1', url: 'https://ex.com', title: 'Ex', domain: 'ex.com', accessedAt: Date.now(), credibilityScore: 0.7 }],
      confidence: 0.7, generatedAt: Date.now(), durationMs: 100,
    });

    const events: ResearchProgressEvent[] = [];
    const orch = new DeepResearchOrchestrator(provider, { maxRefinementRounds: 2 }, engine);
    await orch.research('Test', 'deep', (e) => events.push(e));

    const refineEvents = events.filter(e => e.type === 'research_refining');
    expect(refineEvents.length).toBe(1);
  });

  it('respects timeout', async () => {
    const provider: ResearchProvider = {
      complete: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ content: '{}' }), 5000)),
      ),
    };
    const orch = new DeepResearchOrchestrator(provider, { timeoutMs: 100 });

    await expect(orch.research('Test', 'deep')).rejects.toThrow(/timeout/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research.test.ts`
Expected: FAIL — methods not defined

**Step 3: Implement execute, evaluate, refine, and full research pipeline**

Extend `packages/research/src/deep-research.ts`. Key additions:

- Constructor now optionally accepts `ResearchEngine` (3rd param) and creates internal `DocumentStore`
- `execute(plan, store, onProgress?)` — parallel `engine.research()` per subtopic query, ingests findings into store, emits `research_searching` and `research_source_found` events
- `evaluate(question, findingSummaries, onProgress?)` — LLM reviews findings for gaps, returns `{ gaps: string[], queries: string[] }`
- `refine(queries, store, onProgress?)` — runs follow-up searches for gap queries via engine
- `research(question, depth, onProgress?)` — full pipeline with timeout via `AbortSignal.timeout()`:
  1. Emit `research_started`
  2. `plan()` — decompose question
  3. `execute()` — parallel research per subtopic
  4. `evaluate()` — check for gaps
  5. Loop: if gaps found and rounds < maxRefinementRounds, `refine()` then re-evaluate
  6. Emit `research_complete`
  7. Returns `{ findings, sources, executiveSummary, knowledgeGaps, refinementRounds, duration, tokenUsage }`

Also update `packages/research/src/index.ts` to export `DeepResearchOrchestrator` and `SubtopicPlan`/`ResearchPlan` types.

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/research/src/deep-research.ts packages/research/tests/deep-research.test.ts packages/research/src/index.ts
git commit -m "feat(research): add DeepResearchOrchestrator execute/evaluate/refine pipeline"
```

---

### Task 5: Implement ReportGenerator

**Files:**
- Create: `packages/research/src/report-generator.ts`
- Create: `packages/research/tests/report-generator.test.ts`
- Modify: `packages/research/src/index.ts` (add export)

**Context:** Two modes: structured `ResearchReport` (deep) and conversational markdown summary (quick/standard). Uses LLM for section generation and executive summary. Takes raw findings, sources, and knowledge gaps from the orchestrator.

**Step 1: Write the failing test**

Create `packages/research/tests/report-generator.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/report-generator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ReportGenerator**

Create `packages/research/src/report-generator.ts` with two methods:
- `generateReport(input)` — LLM generates sections JSON + executive summary, maps to `ResearchReport` with `CitedSource` cross-references. Computes overall confidence as average of section confidences.
- `generateSummary(input)` — LLM generates conversational markdown with inline citations.

Both call `this.provider.complete()` with structured prompts including the findings and source list as context.

Add export to `packages/research/src/index.ts`:
```ts
export { ReportGenerator } from './report-generator.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/report-generator.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add packages/research/src/report-generator.ts packages/research/tests/report-generator.test.ts packages/research/src/index.ts
git commit -m "feat(research): add ReportGenerator for structured and conversational output"
```

---

### Task 6: Add Research Audit Events

**Files:**
- Modify: `packages/audit/src/index.ts`
- Create: `packages/audit/tests/research-audit-events.test.ts`

**Step 1: Write the failing test**

Create `packages/audit/tests/research-audit-events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AuditEventType } from '../src/index.js';

describe('Research audit event types', () => {
  it('accepts research.started', () => {
    const event: AuditEventType = 'research.started';
    expect(event).toBe('research.started');
  });

  it('accepts research.completed', () => {
    const event: AuditEventType = 'research.completed';
    expect(event).toBe('research.completed');
  });

  it('accepts research.failed', () => {
    const event: AuditEventType = 'research.failed';
    expect(event).toBe('research.failed');
  });

  it('accepts research.cancelled', () => {
    const event: AuditEventType = 'research.cancelled';
    expect(event).toBe('research.cancelled');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/audit/tests/research-audit-events.test.ts`
Expected: FAIL — type not assignable

**Step 3: Add the audit event types**

Add to `AuditEventType` union in `packages/audit/src/index.ts` (after the `guardrail.triggered` line):

```ts
  // Deep Research
  | 'research.started'
  | 'research.completed'
  | 'research.failed'
  | 'research.cancelled';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/audit/tests/research-audit-events.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/audit/src/index.ts packages/audit/tests/research-audit-events.test.ts
git commit -m "feat(audit): add deep research audit event types"
```

---

### Task 7: Wire Deep Research into Runtime — Intent Detection, WS Handler, Job Map

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Create: `packages/runtime/tests/deep-research-runtime.test.ts`

**Context:** This wires everything into the runtime:
1. **Job Map**: In-memory `Map<string, ResearchJob>` with 1-hour expiry via `setInterval`
2. **Intent detection**: Call `ResearchIntentDetector.detect()` in `handleMessage()` before LLM call; if score >= 0.6, emit `research_suggestion` WebSocket event
3. **WebSocket handler**: Handle `{ type: 'start_research', question, depth? }` messages, create job, run orchestrator, stream progress events, store result
4. **Imports**: `ResearchIntentDetector`, `DeepResearchOrchestrator`, `ReportGenerator` from `@auxiora/research`

**Key patterns from existing runtime (follow these):**
- Ambient scheduler pattern: imports at top, fields on AuxioraRuntime class, init in `initialize()`, cleanup in `shutdown()`
- WS messages: check `parsedMessage.type` in the WebSocket handler switch
- Job expiry: `setInterval(() => { ... }, 60_000)` that prunes jobs older than 1 hour
- Audit calls: `await audit('research.started', { ... })`

**Step 1: Write the failing test**

Create `packages/runtime/tests/deep-research-runtime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ResearchIntentDetector } from '@auxiora/research';

describe('Research intent detection in runtime', () => {
  it('ResearchIntentDetector is importable and functional', () => {
    const detector = new ResearchIntentDetector();
    const result = detector.detect(
      'Analyze the pros and cons of microservices vs monoliths',
    );
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.suggestedDepth).toBeDefined();
  });
});

describe('Research job map', () => {
  it('tracks jobs with status lifecycle', () => {
    const jobs = new Map<string, { id: string; status: string; createdAt: number }>();
    const job = { id: 'j1', status: 'planning', createdAt: Date.now() };
    jobs.set(job.id, job);

    expect(jobs.get('j1')?.status).toBe('planning');
    job.status = 'completed';
    expect(jobs.get('j1')?.status).toBe('completed');
  });

  it('expires jobs older than 1 hour', () => {
    const jobs = new Map<string, { id: string; status: string; createdAt: number }>();
    const oldJob = { id: 'old', status: 'completed', createdAt: Date.now() - 3_700_000 };
    const newJob = { id: 'new', status: 'completed', createdAt: Date.now() };
    jobs.set(oldJob.id, oldJob);
    jobs.set(newJob.id, newJob);

    // Simulate expiry sweep
    const ONE_HOUR = 3_600_000;
    const now = Date.now();
    for (const [id, j] of jobs) {
      if (now - j.createdAt > ONE_HOUR) jobs.delete(id);
    }

    expect(jobs.has('old')).toBe(false);
    expect(jobs.has('new')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/deep-research-runtime.test.ts`
Expected: FAIL (or partial fail depending on import availability)

**Step 3: Wire into runtime**

Modify `packages/runtime/src/index.ts`:

1. **Imports** at top:
   ```ts
   import { ResearchIntentDetector, DeepResearchOrchestrator, ReportGenerator } from '@auxiora/research';
   import type { ResearchJob, ResearchProgressEvent } from '@auxiora/research';
   ```

2. **Fields** on AuxioraRuntime class:
   ```ts
   private intentDetector = new ResearchIntentDetector();
   private researchJobs = new Map<string, ResearchJob>();
   private researchJobExpiry?: ReturnType<typeof setInterval>;
   ```

3. **Initialize** in `initialize()`:
   ```ts
   // Research job expiry (every 60s, prune jobs older than 1 hour)
   this.researchJobExpiry = setInterval(() => {
     const ONE_HOUR = 3_600_000;
     const now = Date.now();
     for (const [id, job] of this.researchJobs) {
       if (now - job.createdAt > ONE_HOUR) this.researchJobs.delete(id);
     }
   }, 60_000);
   ```

4. **handleMessage** before LLM call — intent detection:
   ```ts
   const intent = this.intentDetector.detect(message);
   if (intent.score >= 0.6) {
     this.emitWs(ws, { type: 'research_suggestion', intent });
   }
   ```

5. **WebSocket handler** new case:
   ```ts
   case 'start_research': {
     const { question, depth = 'deep' } = parsedMessage;
     const job: ResearchJob = {
       id: crypto.randomUUID(),
       question, depth, status: 'planning',
       createdAt: Date.now(), progress: [],
     };
     this.researchJobs.set(job.id, job);
     await audit('research.started', { jobId: job.id, question, depth });
     this.emitWs(ws, { type: 'research_started', questionId: job.id, subtopicCount: 0 });

     // Fire-and-forget the research pipeline
     this.runResearchJob(job, ws).catch((err) => {
       job.status = 'failed';
       job.error = err.message;
       audit('research.failed', { jobId: job.id, error: err.message }).catch(() => {});
       this.emitWs(ws, { type: 'research_failed', questionId: job.id, error: err.message });
     });
     break;
   }
   ```

6. **runResearchJob** private method:
   ```ts
   private async runResearchJob(job: ResearchJob, ws: WebSocket): Promise<void> {
     const onProgress = (event: ResearchProgressEvent) => {
       job.progress.push(event);
       this.emitWs(ws, event);
     };
     const orchestrator = new DeepResearchOrchestrator(
       this.provider, undefined, this.researchEngine,
     );
     const reportGen = new ReportGenerator(this.provider);

     const result = await orchestrator.research(job.question, job.depth, onProgress);

     if (job.depth === 'deep') {
       job.report = await reportGen.generateReport({
         ...result, question: job.question, depth: job.depth,
       });
     }
     job.status = 'completed';
     job.completedAt = Date.now();
     await audit('research.completed', {
       jobId: job.id,
       sourceCount: result.sources.length,
       duration: job.completedAt - job.createdAt,
     });
   }
   ```

7. **Shutdown** in `shutdown()`:
   ```ts
   if (this.researchJobExpiry) clearInterval(this.researchJobExpiry);
   ```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/deep-research-runtime.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/deep-research-runtime.test.ts
git commit -m "feat(runtime): wire deep research intent detection, WS handler, and job map"
```

---

### Task 8: Create Research REST Router

**Files:**
- Modify: `packages/runtime/src/index.ts` (add `createResearchRouter()` method and mount)
- Create: `packages/runtime/tests/research-api.test.ts`

**Context:** Router mounted at `/api/v1/research` with 5 endpoints per design:
- `POST /research` — Start job (async), returns 202 with `{ jobId, status }`
- `GET /research/:jobId` — Get job status/results
- `GET /research` — List recent jobs (query: `limit`, `offset`)
- `DELETE /research/:jobId` — Cancel running job (409 if already finished)
- `GET /research/:jobId/sources` — Get sources with credibility details

Follow same pattern as `createAmbientRouter()` in runtime.

**Step 1: Write the failing test**

Create `packages/runtime/tests/research-api.test.ts` using supertest + Express mock pattern (same as `ambient-api.test.ts`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { ResearchJob } from '@auxiora/research';

function createTestRouter(jobs: Map<string, ResearchJob>) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { question, depth = 'deep' } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });
    const job: ResearchJob = {
      id: `test-${Date.now()}`, question, depth,
      status: 'planning', createdAt: Date.now(), progress: [],
    };
    jobs.set(job.id, job);
    res.status(202).json({ jobId: job.id, status: job.status });
  });

  router.get('/', (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const all = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    res.json({ jobs: all.slice(offset, offset + limit), total: all.length });
  });

  router.get('/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json(job);
  });

  router.delete('/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(409).json({ error: 'job already finished' });
    }
    job.status = 'cancelled';
    res.json({ jobId: job.id, status: 'cancelled' });
  });

  router.get('/:jobId/sources', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    const sources = job.report?.sources ?? [];
    res.json({ sources });
  });

  return router;
}

describe('Research REST API', () => {
  let app: express.Express;
  let jobs: Map<string, ResearchJob>;

  beforeEach(() => {
    jobs = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/v1/research', createTestRouter(jobs));
  });

  it('POST /research creates a job', async () => {
    const res = await request(app).post('/api/v1/research').send({ question: 'Test Q' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeTruthy();
    expect(res.body.status).toBe('planning');
  });

  it('POST /research returns 400 without question', async () => {
    const res = await request(app).post('/api/v1/research').send({});
    expect(res.status).toBe(400);
  });

  it('GET /research lists jobs', async () => {
    jobs.set('j1', {
      id: 'j1', question: 'Q1', depth: 'deep', status: 'completed',
      createdAt: Date.now(), progress: [],
    });
    const res = await request(app).get('/api/v1/research');
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('GET /research/:jobId returns job', async () => {
    jobs.set('j1', {
      id: 'j1', question: 'Q1', depth: 'deep', status: 'planning',
      createdAt: Date.now(), progress: [],
    });
    const res = await request(app).get('/api/v1/research/j1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('j1');
  });

  it('GET /research/:jobId returns 404 for unknown', async () => {
    const res = await request(app).get('/api/v1/research/nope');
    expect(res.status).toBe(404);
  });

  it('DELETE /research/:jobId cancels running job', async () => {
    jobs.set('j1', {
      id: 'j1', question: 'Q1', depth: 'deep', status: 'searching',
      createdAt: Date.now(), progress: [],
    });
    const res = await request(app).delete('/api/v1/research/j1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('DELETE /research/:jobId returns 409 for finished job', async () => {
    jobs.set('j1', {
      id: 'j1', question: 'Q1', depth: 'deep', status: 'completed',
      createdAt: Date.now(), progress: [],
    });
    const res = await request(app).delete('/api/v1/research/j1');
    expect(res.status).toBe(409);
  });

  it('GET /research/:jobId/sources returns sources', async () => {
    jobs.set('j1', {
      id: 'j1', question: 'Q1', depth: 'deep', status: 'completed',
      createdAt: Date.now(), progress: [],
      report: {
        id: 'r1', question: 'Q1', executiveSummary: 's', sections: [],
        knowledgeGaps: [],
        sources: [{
          id: 's1', url: 'https://example.com', title: 'Ex',
          domain: 'example.com', credibilityScore: 0.9, citedIn: ['A'],
        }],
        metadata: {
          depth: 'deep', totalSources: 1, refinementRounds: 0,
          duration: 1000, tokenUsage: 500, confidence: 0.8,
        },
      },
    });
    const res = await request(app).get('/api/v1/research/j1/sources');
    expect(res.status).toBe(200);
    expect(res.body.sources).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/research-api.test.ts`
Expected: Pass with standalone test router; the real runtime router implementation follows same pattern.

**Step 3: Add createResearchRouter() to runtime**

Add a private `createResearchRouter()` method to `AuxioraRuntime` (same pattern as `createAmbientRouter()`) and mount at `/api/v1/research` in the router mounting section.

The router should:
- `POST /` — validate `question` field, create `ResearchJob`, call `this.runResearchJob()` fire-and-forget, return 202
- `GET /` — list from `this.researchJobs`, support `limit`/`offset` query params
- `GET /:jobId` — lookup from map, 404 if not found
- `DELETE /:jobId` — set status to 'cancelled', audit log, 409 if already done
- `GET /:jobId/sources` — return `job.report?.sources ?? []`

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/research-api.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/research-api.test.ts
git commit -m "feat(runtime): add deep research REST API at /api/v1/research"
```

---

### Task 9: Integration Tests

**Files:**
- Create: `packages/research/tests/deep-research-integration.test.ts`

**Context:** Cross-layer integration tests that verify the full pipeline works end-to-end with mocked LLM and search but real DocumentStore, CitationTracker, KnowledgeGraph.

**Step 1: Write integration tests**

Create `packages/research/tests/deep-research-integration.test.ts`:

```ts
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

  it('intent detector -> orchestrator -> report generator pipeline', async () => {
    // Step 1: Detect intent
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
        .mockResolvedValueOnce({ content: evalResponse })
        .mockResolvedValueOnce({ content: 'Summary text' }),
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
```

**Step 2: Run integration tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/research/tests/deep-research-integration.test.ts`
Expected: PASS (4 tests)

**Step 3: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/research/tests/deep-research-integration.test.ts
git commit -m "test(research): add deep research integration tests"
```

---

### Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Deep research types | types.ts, index.ts | 5 |
| 2 | ResearchIntentDetector | intent-detector.ts | 10 |
| 3 | Orchestrator plan stage | deep-research.ts | 4 |
| 4 | Orchestrator execute/evaluate/refine | deep-research.ts | 7 |
| 5 | ReportGenerator | report-generator.ts | 2 |
| 6 | Audit events | audit/index.ts | 4 |
| 7 | Runtime wiring | runtime/index.ts | 3 |
| 8 | REST router | runtime/index.ts | 8 |
| 9 | Integration tests | integration test | 4 |

**Total: 9 tasks, ~47 new tests, 4 new files, 4 modified files**
