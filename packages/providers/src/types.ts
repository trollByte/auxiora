/**
 * Thinking/reasoning budget levels.
 * Maps to provider-specific parameters:
 * - Anthropic: thinking budget_tokens
 * - OpenAI: reasoning_effort (for o-series models)
 */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Tool definition for AI providers
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool use request from the AI
 */
export interface ToolUse {
  id: string;
  name: string;
  input: any;
}

/**
 * Tool result to send back to the AI
 */
export interface ToolResultMessage {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
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

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stream?: boolean;
  tools?: ToolDefinition[];
  /** Thinking/reasoning budget level. Default: 'off'. */
  thinkingLevel?: ThinkingLevel;
  /** When true, don't filter Claude Code emulation tool calls — yield them as normal tool_use events. */
  passThroughAllTools?: boolean;
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
  stream(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;
}

export interface ProviderConfig {
  anthropic?: {
    apiKey?: string;
    apiKeys?: string[];
    oauthToken?: string;
    model?: string;
    maxTokens?: number;
    /** Read credentials from Claude CLI (~/.claude/.credentials.json) */
    useCliCredentials?: boolean;
    /** Callback to refresh the OAuth token when expired. Returns new access token. */
    onTokenRefresh?: () => Promise<string | null>;
    /** When the current OAuth token expires (epoch ms). Used for proactive refresh. */
    tokenExpiresAt?: number;
  };
  openai?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  google?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  ollama?: {
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
  };
  openaiCompatible?: {
    baseUrl: string;
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    name?: string;
  };
  groq?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  replicate?: {
    apiToken?: string;
    apiTokens?: string[];
    model?: string;
    pollInterval?: number;
  };
  deepseek?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  cohere?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  xai?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  openrouter?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    appName?: string;
  };
  huggingface?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    preferredInferenceProvider?: string;
  };
}
