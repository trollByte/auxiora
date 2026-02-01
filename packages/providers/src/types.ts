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
  type: 'text' | 'tool_use' | 'done' | 'error';
  content?: string;
  toolUse?: ToolUse;
  error?: string;
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
}

export interface CompletionResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface Provider {
  name: string;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;
}

export interface ProviderConfig {
  anthropic?: {
    apiKey?: string;
    oauthToken?: string;
    model?: string;
    maxTokens?: number;
    /** Read credentials from Claude CLI (~/.claude/.credentials.json) */
    useCliCredentials?: boolean;
  };
  openai?: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
  };
}
