import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

/** Structural type — avoids importing @auxiora/telemetry directly */
export interface LearningLike {
  readonly content: string;
  readonly category: string;
  readonly occurrences: number;
}

export class LearningStage implements EnrichmentStage {
  readonly name = 'learning';
  readonly order = 55;

  private cachedLearnings: LearningLike[] = [];

  constructor(
    private readonly getRecentLearnings: () => LearningLike[],
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    this.cachedLearnings = this.getRecentLearnings();
    return this.cachedLearnings.length > 0;
  }

  async enrich(_ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const learnings = this.cachedLearnings.length > 0
      ? this.cachedLearnings
      : this.getRecentLearnings();

    if (learnings.length === 0) {
      return { prompt: currentPrompt };
    }

    const lines = ['[Learned Patterns]', 'Insights from previous tasks:'];
    for (const l of learnings) {
      let line = `- [${l.category}] ${l.content}`;
      if (l.occurrences > 1) {
        line += ` (seen ${l.occurrences}x)`;
      }
      lines.push(line);
    }
    lines.push('Apply these insights where relevant.');
    lines.push('');

    const section = lines.join('\n');

    return {
      prompt: currentPrompt + '\n\n' + section,
      metadata: { learningCount: learnings.length },
    };
  }
}
