export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type SourceType =
  | 'tool_result'
  | 'memory_recall'
  | 'knowledge_graph'
  | 'user_data'
  | 'model_generation';

export interface ConfidenceFactor {
  readonly signal: string;
  readonly impact: 'positive' | 'negative';
  readonly detail: string;
}

export interface SourceAttribution {
  readonly type: SourceType;
  readonly label: string;
  readonly confidence: number;
}

export interface TransparencyMeta {
  readonly confidence: {
    readonly level: ConfidenceLevel;
    readonly score: number;
    readonly factors: readonly ConfidenceFactor[];
  };
  readonly sources: readonly SourceAttribution[];
  readonly model: {
    readonly provider: string;
    readonly model: string;
    readonly tokens: { readonly input: number; readonly output: number };
    readonly cost: { readonly input: number; readonly output: number; readonly total: number };
    readonly finishReason: string;
    readonly latencyMs: number;
  };
  readonly personality: {
    readonly domain: string;
    readonly emotionalRegister: string;
    readonly activeTraits: ReadonlyArray<{ readonly name: string; readonly weight: number }>;
    readonly knowledgeBoundary?: {
      readonly topic: string;
      readonly corrections: number;
    };
  };
  readonly trace: {
    readonly enrichmentStages: readonly string[];
    readonly toolsUsed: readonly string[];
    readonly processingMs: number;
  };
}
