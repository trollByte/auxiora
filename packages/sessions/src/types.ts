export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  tokens?: {
    input?: number;
    output?: number;
  };
}

export interface SessionMetadata {
  channelType: string;
  senderId?: string;
  clientId?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface Session {
  id: string;
  messages: Message[];
  metadata: SessionMetadata;
  systemPrompt?: string;
}

export interface SessionConfig {
  maxContextTokens: number;
  ttlMinutes: number;
  autoSave: boolean;
  compactionEnabled: boolean;
}
