import type { HFModel } from './types.js';

export class HubApiClient {
  constructor(private apiKey: string) {}

  async getModelCard(modelId: string): Promise<string> {
    const response = await fetch(`https://huggingface.co/${modelId}/raw/main/README.md`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      return '';
    }

    return await response.text();
  }

  async getTrending(limit = 20): Promise<HFModel[]> {
    const response = await fetch(
      `https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trending&limit=${limit}&expand[]=inferenceProviderMapping`,
      { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
    );

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    return await response.json() as HFModel[];
  }

  async getModelBenchmarks(modelId: string): Promise<Record<string, number>> {
    // Try to extract benchmark scores from model card metadata
    try {
      const response = await fetch(`https://huggingface.co/api/models/${modelId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!response.ok) return {};

      const data = await response.json() as Record<string, unknown>;
      const cardData = data.cardData as Record<string, unknown> | undefined;
      if (!cardData?.eval_results) return {};

      const results = cardData.eval_results as Array<{ task: { type: string }; metrics: Array<{ type: string; value: number }> }>;
      const scores: Record<string, number> = {};
      for (const result of results) {
        for (const metric of result.metrics) {
          scores[`${result.task.type}_${metric.type}`] = metric.value;
        }
      }
      return scores;
    } catch {
      return {};
    }
  }
}
