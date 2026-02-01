export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error';
  content?: string;
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
