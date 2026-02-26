// OpenRouter-specific types

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  appName?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
  };
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters?: string[];
  top_provider?: {
    max_completion_tokens?: number;
  };
}

export interface OpenRouterProviderPreference {
  order?: string[];
  allow_fallbacks?: boolean;
}

// Structural types matching @auxiora/providers (local copies to avoid cross-package imports)

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolUse {
  id: string;
  name: string;
  input: any;
}

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface CompletionResult {
  content: string;
  toolUse?: ToolUse[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'done' | 'error';
  content?: string;
  toolUse?: ToolUse;
  error?: string;
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ModelCapabilities {
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

export interface ProviderMetadata {
  name: string;
  displayName: string;
  models: Record<string, ModelCapabilities>;
  isAvailable(): Promise<boolean>;
}

export interface Provider {
  name: string;
  readonly defaultModel: string;
  metadata: ProviderMetadata;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: ChatMessage[], options?: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;
}

// Structural type matching DiscoveredModel from model-registry

export interface DiscoveredModelLike {
  id: string;
  providerSource: string;
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
  lastRefreshedAt: number;
  createdAt: number;
  enabled: boolean;
}
