import type { ModelCapabilities, ProviderMetadata } from '@auxiora/providers';
import type { ModelRouting } from '@auxiora/config';
import type { TaskClassification, ModelSelection, CostSummary } from './types.js';

export class ModelSelector {
  constructor(
    private availableProviders: Map<string, ProviderMetadata>,
    private routingConfig: ModelRouting,
  ) {}

  select(classification: TaskClassification, costSummary?: CostSummary): ModelSelection {
    // 1. Check for defaultModel override
    if (this.routingConfig.defaultModel) {
      const found = this.findModel(this.routingConfig.defaultModel);
      if (found) {
        return {
          ...found,
          reason: `Default model override: ${this.routingConfig.defaultModel}`,
        };
      }
    }

    // 2. Check explicit routing rules
    const ruleMatch = this.matchRule(classification.type);
    if (ruleMatch) {
      return ruleMatch;
    }

    // 3. Gather all candidate models
    const candidates = this.getAllCandidates(classification);

    if (candidates.length === 0) {
      throw new Error('No available models match the task requirements');
    }

    // 4. Apply preference-based filtering
    if (this.routingConfig.preferences.preferLocal && classification.sensitivityLevel !== 'normal') {
      const localCandidates = candidates.filter((c) => c.isLocal);
      if (localCandidates.length > 0) {
        const best = localCandidates[0];
        return {
          ...best,
          reason: `Local model preferred for ${classification.sensitivityLevel} content`,
        };
      }
    }

    // 5. If over budget, pick cheapest
    if (costSummary?.isOverBudget) {
      candidates.sort((a, b) => a.estimatedCost - b.estimatedCost);
      return {
        ...candidates[0],
        reason: 'Budget exceeded, selecting cheapest available model',
      };
    }

    // 6. If preferCheap, sort by cost
    if (this.routingConfig.preferences.preferCheap) {
      candidates.sort((a, b) => a.estimatedCost - b.estimatedCost);
      return {
        ...candidates[0],
        reason: `Cheapest model selected per preference: ${candidates[0].model}`,
      };
    }

    // 7. Return best scored candidate
    return candidates[0];
  }

  private matchRule(taskType: string): ModelSelection | null {
    const rules = this.routingConfig.rules
      .filter((r) => r.task === taskType)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of rules) {
      const providerMeta = this.availableProviders.get(rule.provider);
      if (!providerMeta) continue;

      const modelCaps = providerMeta.models[rule.model];
      if (!modelCaps) continue;

      const estimatedCost = this.estimateCost(modelCaps, 1000);
      return {
        provider: rule.provider,
        model: rule.model,
        reason: `Matched routing rule for task "${taskType}" (priority ${rule.priority})`,
        estimatedCost,
        isLocal: modelCaps.isLocal,
      };
    }

    return null;
  }

  private findModel(modelId: string): Omit<ModelSelection, 'reason'> | null {
    for (const [providerName, providerMeta] of this.availableProviders) {
      const modelCaps = providerMeta.models[modelId];
      if (modelCaps) {
        return {
          provider: providerName,
          model: modelId,
          estimatedCost: this.estimateCost(modelCaps, 1000),
          isLocal: modelCaps.isLocal,
        };
      }
    }
    return null;
  }

  private getAllCandidates(classification: TaskClassification): ModelSelection[] {
    const candidates: ModelSelection[] = [];

    for (const [providerName, providerMeta] of this.availableProviders) {
      for (const [modelId, caps] of Object.entries(providerMeta.models)) {
        // Filter: if vision required, model must support it
        if (classification.requiresVision && !caps.supportsVision) continue;
        // Filter: if tools required, model must support them
        if (classification.requiresTools && !caps.supportsTools) continue;

        const score = this.scoreModel(caps, classification);
        const estimatedCost = this.estimateCost(caps, classification.inputTokenEstimate);

        candidates.push({
          provider: providerName,
          model: modelId,
          reason: `Best match for "${classification.type}" (score: ${score.toFixed(2)})`,
          estimatedCost,
          isLocal: caps.isLocal,
        });
      }
    }

    // Sort by score descending (highest first)
    candidates.sort((a, b) => {
      const scoreA = this.scoreModelBySelection(a, classification);
      const scoreB = this.scoreModelBySelection(b, classification);
      return scoreB - scoreA;
    });

    return candidates;
  }

  private scoreModel(caps: ModelCapabilities, classification: TaskClassification): number {
    let score = 0;

    // Match task type to model strengths
    if (caps.strengths.includes(classification.type)) {
      score += 3;
    }

    // Bonus for matching secondary qualities
    if (classification.requiresVision && caps.supportsVision) score += 1;
    if (classification.requiresTools && caps.supportsTools) score += 1;

    // Capability breadth bonus (more strengths = more capable)
    score += caps.strengths.length * 0.1;

    // Context capacity bonus
    if (caps.maxContextTokens >= 200000) {
      score += 0.5;
    }
    if (classification.inputTokenEstimate > 50000 && caps.maxContextTokens >= 200000) {
      score += 2;
    }

    // Cost penalty (small, to break ties rather than dominate)
    const costPenalty = (caps.costPer1kInput + caps.costPer1kOutput) * 2;
    score -= costPenalty;

    // Local bonus if preferred
    if (this.routingConfig.preferences.preferLocal && caps.isLocal) {
      score += 2;
    }

    return score;
  }

  private scoreModelBySelection(selection: ModelSelection, classification: TaskClassification): number {
    for (const [, providerMeta] of this.availableProviders) {
      const caps = providerMeta.models[selection.model];
      if (caps) {
        return this.scoreModel(caps, classification);
      }
    }
    return 0;
  }

  private estimateCost(caps: ModelCapabilities, inputTokens: number): number {
    // Assume output tokens are roughly half of input for estimation
    const estimatedOutputTokens = Math.ceil(inputTokens * 0.5);
    return (inputTokens / 1000) * caps.costPer1kInput + (estimatedOutputTokens / 1000) * caps.costPer1kOutput;
  }
}
