import type { LLMCallerLike, MutationStrategy, StrategyWeights, Niche, Variant, VariantType } from './types.js';

export interface StrategyContext {
  targetNiche: Niche;
  currentVariant: Variant | null;
  nearbyVariants: Variant[];
  weights: StrategyWeights;
}

export interface MutationRequest {
  strategy: MutationStrategy;
  targetNiche: Niche;
  parent?: Variant;
  parents?: Variant[];
  currentPrompt?: string;
  toolCatalog?: string[];
  telemetryHints?: string[];
  mutationTarget?: string;
}

export interface MutationResult {
  content: string;
  type: VariantType;
  parentIds: string[];
  strategy: MutationStrategy;
  metadata: Record<string, unknown>;
}

const CODE_BLOCK_RE = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/;

export class MutationEngine {
  constructor(private readonly llm: LLMCallerLike) {}

  selectStrategy(ctx: StrategyContext): MutationStrategy {
    if (!ctx.currentVariant) {
      return 'create_new';
    }

    const eligible: Array<{ strategy: MutationStrategy; weight: number }> = [
      { strategy: 'refine_prompt', weight: ctx.weights.refine_prompt },
      { strategy: 'mutate', weight: ctx.weights.mutate },
    ];

    if (ctx.nearbyVariants.length >= 2) {
      eligible.push({ strategy: 'crossover', weight: ctx.weights.crossover });
    }

    const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight === 0) {
      return 'mutate';
    }

    let roll = Math.random() * totalWeight;
    for (const entry of eligible) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.strategy;
      }
    }

    return eligible[eligible.length - 1].strategy;
  }

  async generateMutation(req: MutationRequest): Promise<MutationResult> {
    const prompt = this.buildPrompt(req);
    const isPromptStrategy = req.strategy === 'refine_prompt';
    const maxTokens = isPromptStrategy ? 2048 : 8192;

    const response = await this.llm.call(prompt, { maxTokens });
    const content = this.extractCode(response);

    const parentIds: string[] = [];
    if (req.parent) {
      parentIds.push(req.parent.id);
    }
    if (req.parents) {
      for (const p of req.parents) {
        if (!parentIds.includes(p.id)) {
          parentIds.push(p.id);
        }
      }
    }

    const type: VariantType = isPromptStrategy ? 'prompt' : 'skill';

    return {
      content,
      type,
      parentIds,
      strategy: req.strategy,
      metadata: {
        niche: `${req.targetNiche.domain}/${req.targetNiche.complexity}`,
      },
    };
  }

  private buildPrompt(req: MutationRequest): string {
    switch (req.strategy) {
      case 'create_new':
        return this.buildCreateNewPrompt(req);
      case 'mutate':
        return this.buildMutatePrompt(req);
      case 'crossover':
        return this.buildCrossoverPrompt(req);
      case 'refine_prompt':
        return this.buildRefinePromptPrompt(req);
    }
  }

  private buildCreateNewPrompt(req: MutationRequest): string {
    const tools = req.toolCatalog?.join(', ') ?? 'none';
    const hints = req.telemetryHints?.join('; ') ?? 'none';
    return [
      'You are an expert TypeScript developer creating an Auxiora plugin skill.',
      `Target niche: ${req.targetNiche.domain}/${req.targetNiche.complexity}.`,
      `Available tools: ${tools}.`,
      `Known issues: ${hints}.`,
      'Generate complete plugin.',
      'Return code in ```typescript block.',
    ].join(' ');
  }

  private buildMutatePrompt(req: MutationRequest): string {
    const code = req.parent?.content ?? '';
    const accuracy = req.parent?.metrics.accuracy ?? 0;
    const errorRate = req.parent?.metrics.errorRate ?? 0;
    const target = req.mutationTarget ?? 'general improvement';
    return [
      'You are evolving an existing plugin.',
      `Current code: ${code}`,
      `Current metrics: accuracy=${accuracy}, errorRate=${errorRate}.`,
      `Mutation goal: ${target}.`,
      'Improve and return in ```typescript block.',
    ].join(' ');
  }

  private buildCrossoverPrompt(req: MutationRequest): string {
    const parents = req.parents ?? [];
    const a = parents[0];
    const b = parents[1];
    const codeA = a?.content ?? '';
    const metricsA = a ? `accuracy=${a.metrics.accuracy}, errorRate=${a.metrics.errorRate}` : 'unknown';
    const codeB = b?.content ?? '';
    const metricsB = b ? `accuracy=${b.metrics.accuracy}, errorRate=${b.metrics.errorRate}` : 'unknown';
    return [
      'Combine two plugins.',
      `Parent A: ${codeA}`,
      `Metrics A: ${metricsA}.`,
      `Parent B: ${codeB}`,
      `Metrics B: ${metricsB}.`,
      'Return combined code in ```typescript block.',
    ].join(' ');
  }

  private buildRefinePromptPrompt(req: MutationRequest): string {
    const prompt = req.currentPrompt ?? '';
    const hints = req.telemetryHints?.join('; ') ?? 'none';
    return [
      'Refine system prompt.',
      `Current: ${prompt}`,
      `Issues: ${hints}.`,
      'Return ONLY improved prompt text.',
    ].join(' ');
  }

  private extractCode(response: string): string {
    const match = CODE_BLOCK_RE.exec(response);
    if (match) {
      return match[1].trim();
    }
    return response.trim();
  }
}
