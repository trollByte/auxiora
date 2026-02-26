import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

interface ProviderInfo {
  provider: {
    defaultModel: string;
    metadata: {
      displayName: string;
      models: Record<string, { maxContextTokens: number; supportsVision?: boolean }>;
    };
  };
  model?: string;
}

export class ModelIdentityStage implements EnrichmentStage {
  readonly name = 'model-identity';
  readonly order = 500;

  constructor(
    private readonly getProviderInfo: () => ProviderInfo,
    private readonly version?: string,
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    return true;
  }

  async enrich(_ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const { provider, model } = this.getProviderInfo();
    const activeModel = model ?? provider.defaultModel;
    const caps = provider.metadata.models[activeModel];

    const fragment = '\n\n[Model Identity]\n'
      + `You are running as ${activeModel} via ${provider.metadata.displayName}.`
      + (this.version ? ` Auxiora version: ${this.version}.` : '')
      + (caps ? ` Context window: ${caps.maxContextTokens.toLocaleString()} tokens.` : '')
      + (caps?.supportsVision ? ' You have vision capabilities.' : '')
      + ` Today's date: ${new Date().toISOString().slice(0, 10)}.`;

    return { prompt: currentPrompt + fragment };
  }
}
