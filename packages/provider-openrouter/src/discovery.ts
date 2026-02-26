import type { OpenRouterModel, DiscoveredModelLike } from './types.js';
import { inferStrengths } from './strengths.js';

export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://auxiora.dev',
      'X-Title': 'Auxiora',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { data: OpenRouterModel[] };
  return data.data;
}

export function mapToDiscoveredModels(models: OpenRouterModel[]): DiscoveredModelLike[] {
  const now = Date.now();
  return models.map(m => ({
    id: `openrouter:${m.id}`,
    providerSource: 'openrouter',
    modelId: m.id,
    displayName: m.name,
    contextLength: m.context_length,
    supportsVision: m.architecture?.input_modalities?.includes('image') ?? false,
    supportsTools: (m.supported_parameters ?? []).includes('tools'),
    supportsStreaming: true,
    supportsImageGen: m.architecture?.output_modalities?.includes('image') ?? false,
    costPer1kInput: parseFloat(m.pricing.prompt) * 1000,
    costPer1kOutput: parseFloat(m.pricing.completion) * 1000,
    strengths: inferStrengths(m.id),
    rawMetadata: JSON.stringify(m),
    lastRefreshedAt: now,
    createdAt: now,
    enabled: true,
  }));
}
