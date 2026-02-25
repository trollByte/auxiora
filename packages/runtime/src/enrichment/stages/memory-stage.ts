import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class MemoryStage implements EnrichmentStage {
  readonly name = 'memory';
  readonly order = 100;

  constructor(
    private readonly store: { getAll(): Promise<unknown[]> },
    private readonly retriever: { retrieve(memories: unknown[], userMessage: string): string | null },
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    return true;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const memories = await this.store.getAll();
    const section = this.retriever.retrieve(memories, ctx.userMessage);
    return { prompt: section ? currentPrompt + section : currentPrompt };
  }
}
