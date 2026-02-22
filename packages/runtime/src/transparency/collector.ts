import type { EnrichmentResult } from '../enrichment/types.js';
import type { TransparencyMeta } from './types.js';
import { scoreConfidence } from './confidence-scorer.js';
import { attributeSources, countHedgePhrases } from './source-attributor.js';

export interface CollectorInput {
  readonly enrichment: EnrichmentResult;
  readonly completion: {
    readonly content: string;
    readonly toolUse?: ReadonlyArray<{ readonly name: string }>;
    readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
    readonly model: string;
    readonly finishReason: string;
  };
  readonly capabilities: {
    readonly costPer1kInput: number;
    readonly costPer1kOutput: number;
  };
  readonly providerName: string;
  readonly awarenessSignals: ReadonlyArray<{
    readonly dimension: string;
    readonly data: Record<string, unknown>;
  }>;
  readonly responseText: string;
  readonly processingStartTime: number;
}

export function collectTransparencyMeta(input: CollectorInput): TransparencyMeta {
  const { enrichment, completion, capabilities, providerName, awarenessSignals, responseText, processingStartTime } = input;
  const architectMeta = enrichment.metadata.architect;

  // Extract knowledge boundary from awareness signals
  const kbSignal = awarenessSignals.find(s => s.dimension === 'knowledge-boundary');
  const knowledgeBoundaryCorrections = typeof kbSignal?.data?.corrections === 'number'
    ? kbSignal.data.corrections as number
    : 0;
  const knowledgeBoundaryTopic = typeof kbSignal?.data?.topic === 'string'
    ? kbSignal.data.topic as string
    : undefined;

  // Determine source signals
  const toolsUsed = completion.toolUse?.map(t => t.name) ?? [];
  const hasMemoryRecall = enrichment.metadata.stages.includes('memory');
  const hasKnowledgeGraph = toolsUsed.some(t => t.includes('knowledge') || t.includes('graph'));
  const hasUserData = enrichment.metadata.stages.includes('self-awareness');
  const hedgePhraseCount = countHedgePhrases(responseText);

  // Score confidence
  const confidence = scoreConfidence({
    toolsUsed,
    hasMemoryRecall,
    hasUserData,
    finishReason: completion.finishReason,
    knowledgeBoundaryCorrections,
    hedgePhraseCount,
    escalationAlert: architectMeta?.escalationAlert ?? false,
  });

  // Attribute sources
  const sources = attributeSources({ toolsUsed, hasMemoryRecall, hasKnowledgeGraph, hasUserData });

  // Calculate cost
  const costInput = (completion.usage.inputTokens / 1000) * capabilities.costPer1kInput;
  const costOutput = (completion.usage.outputTokens / 1000) * capabilities.costPer1kOutput;

  // Extract active traits
  const activeTraits: Array<{ name: string; weight: number }> = [];
  if (architectMeta?.traitWeights) {
    for (const [name, weight] of Object.entries(architectMeta.traitWeights)) {
      activeTraits.push({ name, weight: weight as number });
    }
    activeTraits.sort((a, b) => b.weight - a.weight);
  }

  // Extract emotional register from architect context
  const emotionalRegister = typeof architectMeta?.detectedContext?.emotionalRegister === 'string'
    ? architectMeta.detectedContext.emotionalRegister as string
    : 'neutral';

  return {
    confidence,
    sources,
    model: {
      provider: providerName,
      model: completion.model,
      tokens: { input: completion.usage.inputTokens, output: completion.usage.outputTokens },
      cost: {
        input: Math.round(costInput * 10000) / 10000,
        output: Math.round(costOutput * 10000) / 10000,
        total: Math.round((costInput + costOutput) * 10000) / 10000,
      },
      finishReason: completion.finishReason,
      latencyMs: Date.now() - processingStartTime,
    },
    personality: {
      domain: typeof architectMeta?.detectedContext?.domain === 'string'
        ? architectMeta.detectedContext.domain as string
        : 'general',
      emotionalRegister,
      activeTraits,
      ...(knowledgeBoundaryTopic ? {
        knowledgeBoundary: { topic: knowledgeBoundaryTopic, corrections: knowledgeBoundaryCorrections },
      } : {}),
    },
    trace: {
      enrichmentStages: [...enrichment.metadata.stages],
      toolsUsed,
      processingMs: Date.now() - processingStartTime,
    },
  };
}
