import type { ProviderMetadata, ModelCapabilities } from '@auxiora/providers';
import type { RoutingResult, RoutingContext, CostSummary } from './types.js';
import { TaskClassifier } from './classifier.js';
import { ModelSelector } from './selector.js';
import { CostTracker } from './cost-tracker.js';

export class ModelRouter {
  constructor(
    private classifier: TaskClassifier,
    private selector: ModelSelector,
    private costTracker: CostTracker,
    private availableProviders: Map<string, ProviderMetadata>,
  ) {}

  route(message: string, context?: RoutingContext): RoutingResult {
    const classification = this.classifier.classify(message, context);
    const costSummary = this.costTracker.getSummary();
    const selection = this.selector.select(classification, costSummary);

    // Gather alternatives (all candidates except the selected one)
    const alternatives = this.getAlternatives(message, context, selection.model);

    return {
      classification,
      selection,
      alternatives,
    };
  }

  recordUsage(provider: string, model: string, inputTokens: number, outputTokens: number): void {
    const caps = this.findModelCapabilities(provider, model);
    const cost = caps
      ? (inputTokens / 1000) * caps.costPer1kInput + (outputTokens / 1000) * caps.costPer1kOutput
      : 0;

    this.costTracker.record({
      timestamp: Date.now(),
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
    });
  }

  getCostSummary(): CostSummary {
    return this.costTracker.getSummary();
  }

  explainRouting(message: string, context?: RoutingContext): string {
    const result = this.route(message, context);
    const { classification, selection } = result;

    const lines = [
      `Task classification: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`,
      `Estimated input tokens: ${classification.inputTokenEstimate}`,
      `Sensitivity: ${classification.sensitivityLevel}`,
      `Selected: ${selection.provider}/${selection.model}`,
      `Reason: ${selection.reason}`,
      `Estimated cost: $${selection.estimatedCost.toFixed(4)}`,
    ];

    if (result.alternatives.length > 0) {
      lines.push('Alternatives:');
      for (const alt of result.alternatives.slice(0, 3)) {
        lines.push(`  - ${alt.provider}/${alt.model} ($${alt.estimatedCost.toFixed(4)})`);
      }
    }

    return lines.join('\n');
  }

  private getAlternatives(
    message: string,
    context: RoutingContext | undefined,
    selectedModel: string,
  ): import('./types.js').ModelSelection[] {
    const classification = this.classifier.classify(message, context);
    const alternatives: import('./types.js').ModelSelection[] = [];

    for (const [providerName, providerMeta] of this.availableProviders) {
      for (const [modelId, caps] of Object.entries(providerMeta.models)) {
        if (modelId === selectedModel) continue;
        if (classification.requiresVision && !caps.supportsVision) continue;

        const estimatedOutputTokens = Math.ceil(classification.inputTokenEstimate * 0.5);
        const estimatedCost =
          (classification.inputTokenEstimate / 1000) * caps.costPer1kInput +
          (estimatedOutputTokens / 1000) * caps.costPer1kOutput;

        alternatives.push({
          provider: providerName,
          model: modelId,
          reason: `Alternative: ${providerMeta.displayName} ${modelId}`,
          estimatedCost,
          isLocal: caps.isLocal,
        });
      }
    }

    return alternatives;
  }

  private findModelCapabilities(provider: string, model: string): ModelCapabilities | null {
    const providerMeta = this.availableProviders.get(provider);
    if (!providerMeta) return null;
    return providerMeta.models[model] ?? null;
  }
}
