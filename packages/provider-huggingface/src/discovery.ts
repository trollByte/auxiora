import type { HFModel, DiscoveredModelLike } from './types.js';
import { getModelPricing } from './pricing.js';

export async function fetchHFModels(apiKey: string): Promise<HFModel[]> {
  const url = 'https://huggingface.co/api/models?inference_provider=all&pipeline_tag=text-generation&sort=trending&limit=100&expand[]=inferenceProviderMapping';

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
  }

  return await response.json() as HFModel[];
}

function inferContextLength(model: HFModel): number {
  // Try to infer from tags
  for (const tag of model.tags) {
    const match = tag.match(/(\d+)k[-_]?context/i);
    if (match) return parseInt(match[1]!, 10) * 1024;
  }
  // Common defaults by model family
  const id = model.id.toLowerCase();
  if (/llama-3/.test(id)) return 128000;
  if (/qwen2/.test(id)) return 131072;
  if (/mistral|mixtral/.test(id)) return 32768;
  if (/gemma/.test(id)) return 8192;
  return 8192; // conservative default
}

function inferSupportsTools(model: HFModel): boolean {
  const id = model.id.toLowerCase();
  return /instruct|chat/.test(id) || model.tags.includes('conversational');
}

function inferStrengths(model: HFModel): string[] {
  const strengths: string[] = [];
  const id = model.id.toLowerCase();

  if (/72b|70b|405b|671b|large/.test(id)) strengths.push('reasoning', 'code');
  if (/8b|7b|1b|2b|small|mini|tiny/.test(id)) strengths.push('fast');
  if (/code|coder/.test(id)) strengths.push('code');
  if (/vision|vl|image/.test(id)) strengths.push('vision');

  if (strengths.length === 0) strengths.push('general');
  return [...new Set(strengths)];
}

export function mapToDiscoveredModels(
  models: HFModel[],
  preferredProvider?: string,
): DiscoveredModelLike[] {
  const now = Date.now();
  return models.map(m => {
    const pricing = getModelPricing(m, preferredProvider);
    return {
      id: `huggingface:${m.id}`,
      providerSource: 'huggingface',
      modelId: m.id,
      displayName: m.id,
      contextLength: inferContextLength(m),
      supportsVision: m.pipeline_tag === 'image-text-to-text' || m.tags.includes('vision'),
      supportsTools: inferSupportsTools(m),
      supportsStreaming: true,
      supportsImageGen: false,
      costPer1kInput: pricing.costPer1kInput,
      costPer1kOutput: pricing.costPer1kOutput,
      strengths: inferStrengths(m),
      hfDownloads: m.downloads,
      hfLikes: m.likes,
      hfTrendingScore: m.trending_score,
      hfTags: m.tags,
      hfInferenceProviders: Object.keys(m.inferenceProviderMapping ?? {}),
      lastRefreshedAt: now,
      createdAt: now,
      enabled: true,
    };
  });
}
