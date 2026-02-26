/**
 * A model discovered from an external provider API (OpenRouter, HuggingFace, etc.).
 */
export interface DiscoveredModel {
  /** Composite key: `${providerSource}:${modelId}` */
  id: string;
  /** Source provider that discovered this model */
  providerSource: string;
  /** Original model ID from the external API */
  modelId: string;
  displayName: string;
  contextLength: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsImageGen: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
  strengths: string[];
  rawMetadata?: string;
  /** HuggingFace-specific fields */
  hfModelCard?: string;
  hfDownloads?: number;
  hfLikes?: number;
  hfTrendingScore?: number;
  hfTags?: string[];
  hfBenchmarkScores?: Record<string, number>;
  hfInferenceProviders?: string[];
  lastRefreshedAt: number;
  createdAt: number;
  enabled: boolean;
}

export interface ModelSearchOptions {
  source?: string;
  query?: string;
  supportsVision?: boolean;
  supportsTools?: boolean;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Structural type matching ModelCapabilities from @auxiora/providers
 * to avoid a hard dependency on that package.
 */
export interface ModelCapabilitiesLike {
  maxContextTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsImageGen: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
  strengths: string[];
  isLocal: boolean;
}
