import type { Config } from '@auxiora/config';

export interface EnrichmentContext {
  readonly basePrompt: string;
  readonly userMessage: string;
  readonly history: ReadonlyArray<{ role: string; content: string }>;
  readonly channelType: string;
  readonly chatId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly toolsUsed: ReadonlyArray<{ name: string; success: boolean }>;
  readonly config: Config;
}

export interface StageResult {
  readonly prompt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface EnrichmentStage {
  readonly name: string;
  readonly order: number;
  enabled(ctx: EnrichmentContext): boolean;
  enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult>;
}

export interface ArchitectMeta {
  readonly detectedContext: Record<string, unknown>;
  readonly activeTraits: ReadonlyArray<Record<string, unknown>>;
  readonly traitWeights: Record<string, number>;
  readonly recommendation?: Record<string, unknown>;
  readonly escalationAlert?: boolean;
  readonly channelType: string;
}

export interface EnrichmentResult {
  readonly prompt: string;
  readonly metadata: {
    readonly architect?: ArchitectMeta;
    readonly stages: string[];
    readonly [key: string]: unknown;
  };
}
