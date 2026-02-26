import type { HFModel } from './types.js';

const PROVIDER_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'cerebras': { inputPer1k: 0.0001, outputPer1k: 0.0001 },
  'fireworks-ai': { inputPer1k: 0.0009, outputPer1k: 0.0009 },
  'together': { inputPer1k: 0.0008, outputPer1k: 0.0008 },
  'sambanova': { inputPer1k: 0.0001, outputPer1k: 0.0001 },
  'novita': { inputPer1k: 0.0005, outputPer1k: 0.0005 },
  'hyperbolic': { inputPer1k: 0.0004, outputPer1k: 0.0004 },
  'nebius': { inputPer1k: 0.0005, outputPer1k: 0.0005 },
  'hf-inference': { inputPer1k: 0, outputPer1k: 0 },
};

export function getModelPricing(
  model: HFModel,
  preferredProvider?: string,
): { costPer1kInput: number; costPer1kOutput: number } {
  const providers = Object.keys(model.inferenceProviderMapping ?? {});

  // Use preferred provider if available
  if (preferredProvider && providers.includes(preferredProvider)) {
    const pricing = PROVIDER_PRICING[preferredProvider];
    if (pricing) return { costPer1kInput: pricing.inputPer1k, costPer1kOutput: pricing.outputPer1k };
  }

  // Find cheapest available provider
  let cheapest = { costPer1kInput: 0.001, costPer1kOutput: 0.001 }; // default fallback
  let cheapestTotal = Infinity;

  for (const p of providers) {
    const pricing = PROVIDER_PRICING[p];
    if (pricing) {
      const total = pricing.inputPer1k + pricing.outputPer1k;
      if (total < cheapestTotal) {
        cheapestTotal = total;
        cheapest = { costPer1kInput: pricing.inputPer1k, costPer1kOutput: pricing.outputPer1k };
      }
    }
  }

  return cheapest;
}
