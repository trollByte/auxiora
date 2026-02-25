import type { EnrichmentContext, EnrichmentResult, EnrichmentStage } from './types.js';

export class EnrichmentPipeline {
  private stages: EnrichmentStage[] = [];

  addStage(stage: EnrichmentStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.order - b.order);
  }

  async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
    let prompt = ctx.basePrompt;
    const allMetadata: Record<string, unknown> = {};
    const stagesRun: string[] = [];

    for (const stage of this.stages) {
      if (!stage.enabled(ctx)) continue;
      const result = await stage.enrich(ctx, prompt);
      prompt = result.prompt;
      if (result.metadata) {
        for (const [k, v] of Object.entries(result.metadata)) {
          allMetadata[k] = v;
        }
      }
      stagesRun.push(stage.name);
    }

    return {
      prompt,
      metadata: { ...allMetadata, stages: stagesRun },
    };
  }
}
