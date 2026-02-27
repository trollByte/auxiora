import { describe, it, expect, vi } from 'vitest';
import { MutationEngine } from '../src/mutation-engine.js';
import type { StrategyContext, MutationRequest } from '../src/mutation-engine.js';
import type { LLMCallerLike, Variant, StrategyWeights, Niche } from '../src/types.js';

function makeMockLLM(response: string): LLMCallerLike {
  return { call: vi.fn().mockResolvedValue(response) };
}

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: overrides.id ?? 'v-1',
    generation: 1,
    parentIds: [],
    strategy: 'create_new',
    type: 'skill',
    content: 'export default {}',
    metadata: {},
    metrics: { accuracy: 0.8, latencyP50: 100, latencyP95: 200, errorRate: 0.05 },
    securityPassed: true,
    reviewScore: 0.9,
    status: 'evaluated',
    createdAt: Date.now(),
    ...overrides,
  };
}

const testNiche: Niche = { domain: 'code-review', complexity: 'moderate' };

const defaultWeights: StrategyWeights = {
  refine_prompt: 0.4,
  mutate: 0.35,
  create_new: 0.15,
  crossover: 0.10,
};

describe('MutationEngine', () => {
  describe('selectStrategy', () => {
    it('selects create_new when currentVariant is null', () => {
      const engine = new MutationEngine(makeMockLLM(''));
      const ctx: StrategyContext = {
        targetNiche: testNiche,
        currentVariant: null,
        nearbyVariants: [],
        weights: defaultWeights,
      };
      expect(engine.selectStrategy(ctx)).toBe('create_new');
    });

    it('selects mutate or refine_prompt for occupied niche', () => {
      const engine = new MutationEngine(makeMockLLM(''));
      const ctx: StrategyContext = {
        targetNiche: testNiche,
        currentVariant: makeVariant(),
        nearbyVariants: [],
        weights: defaultWeights,
      };
      // With no nearby variants, crossover is excluded
      const results = new Set<string>();
      // Seed enough runs to see both strategies
      for (let i = 0; i < 200; i++) {
        results.add(engine.selectStrategy(ctx));
      }
      expect(results.has('mutate') || results.has('refine_prompt')).toBe(true);
      expect(results.has('crossover')).toBe(false);
      expect(results.has('create_new')).toBe(false);
    });

    it('can select crossover when weights force it and 2 nearby variants exist', () => {
      const engine = new MutationEngine(makeMockLLM(''));
      const ctx: StrategyContext = {
        targetNiche: testNiche,
        currentVariant: makeVariant(),
        nearbyVariants: [makeVariant({ id: 'v-2' }), makeVariant({ id: 'v-3' })],
        weights: { refine_prompt: 0, mutate: 0, create_new: 0, crossover: 1.0 },
      };
      expect(engine.selectStrategy(ctx)).toBe('crossover');
    });

    it('returns mutate when all weights are 0', () => {
      const engine = new MutationEngine(makeMockLLM(''));
      const ctx: StrategyContext = {
        targetNiche: testNiche,
        currentVariant: makeVariant(),
        nearbyVariants: [makeVariant({ id: 'v-2' }), makeVariant({ id: 'v-3' })],
        weights: { refine_prompt: 0, mutate: 0, create_new: 0, crossover: 0 },
      };
      expect(engine.selectStrategy(ctx)).toBe('mutate');
    });
  });

  describe('generateMutation', () => {
    it('generates create_new mutation and calls LLM', async () => {
      const llm = makeMockLLM('```typescript\nexport const plugin = {};\n```');
      const engine = new MutationEngine(llm);
      const req: MutationRequest = {
        strategy: 'create_new',
        targetNiche: testNiche,
        toolCatalog: ['search', 'read'],
        telemetryHints: ['slow responses'],
      };
      const result = await engine.generateMutation(req);
      expect(llm.call).toHaveBeenCalledOnce();
      expect(result.content).toBe('export const plugin = {};');
      expect(result.type).toBe('skill');
      expect(result.strategy).toBe('create_new');
      expect(result.parentIds).toEqual([]);
    });

    it('generates mutate mutation with parent and populates parentIds', async () => {
      const parent = makeVariant({ id: 'parent-1', content: 'old code' });
      const llm = makeMockLLM('```ts\nconst improved = true;\n```');
      const engine = new MutationEngine(llm);
      const req: MutationRequest = {
        strategy: 'mutate',
        targetNiche: testNiche,
        parent,
        mutationTarget: 'reduce error rate',
      };
      const result = await engine.generateMutation(req);
      expect(result.parentIds).toEqual(['parent-1']);
      expect(result.type).toBe('skill');
      expect(result.content).toBe('const improved = true;');
    });

    it('generates crossover with two parents and both parentIds', async () => {
      const parentA = makeVariant({ id: 'a-1', content: 'code A' });
      const parentB = makeVariant({ id: 'b-2', content: 'code B' });
      const llm = makeMockLLM('```typescript\nconst merged = true;\n```');
      const engine = new MutationEngine(llm);
      const req: MutationRequest = {
        strategy: 'crossover',
        targetNiche: testNiche,
        parents: [parentA, parentB],
      };
      const result = await engine.generateMutation(req);
      expect(result.parentIds).toEqual(['a-1', 'b-2']);
      expect(result.type).toBe('skill');
    });

    it('generates refine_prompt mutation with type prompt', async () => {
      const llm = makeMockLLM('You are an improved assistant that focuses on clarity.');
      const engine = new MutationEngine(llm);
      const req: MutationRequest = {
        strategy: 'refine_prompt',
        targetNiche: testNiche,
        currentPrompt: 'You are an assistant.',
        telemetryHints: ['users report vague answers'],
      };
      const result = await engine.generateMutation(req);
      expect(result.type).toBe('prompt');
      expect(result.strategy).toBe('refine_prompt');
      expect(result.content).toBe('You are an improved assistant that focuses on clarity.');
      // refine_prompt uses maxTokens 2048
      expect(llm.call).toHaveBeenCalledWith(expect.any(String), { maxTokens: 2048 });
    });
  });

  describe('code extraction', () => {
    it('extracts code from markdown typescript blocks', async () => {
      const llm = makeMockLLM('Here is the code:\n```typescript\nconst x = 1;\nconst y = 2;\n```\nDone.');
      const engine = new MutationEngine(llm);
      const result = await engine.generateMutation({
        strategy: 'create_new',
        targetNiche: testNiche,
      });
      expect(result.content).toBe('const x = 1;\nconst y = 2;');
    });

    it('returns raw content when no code block found', async () => {
      const llm = makeMockLLM('Just some plain text response');
      const engine = new MutationEngine(llm);
      const result = await engine.generateMutation({
        strategy: 'create_new',
        targetNiche: testNiche,
      });
      expect(result.content).toBe('Just some plain text response');
    });
  });
});
