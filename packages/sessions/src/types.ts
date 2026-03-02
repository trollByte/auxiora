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
  metadata?: Record<string, unknown>;
}

export interface SessionMetadata {
  channelType: string;
  senderId?: string;
  clientId?: string;
  createdAt: number;
  lastActiveAt: number;
  activeMode?: string;
  modeAutoDetected?: boolean;
  escalationLevel?: string;
  suspendedMode?: string;
}

export interface Session {
  id: string;
  messages: Message[];
  metadata: SessionMetadata;
  systemPrompt?: string;
}

export interface SessionConfig {
  maxContextTokens: number;
  /** Maximum user/assistant turn pairs for non-webchat channel sessions (0 = unlimited). */
  maxChannelTurns?: number;
  /** Maximum characters per message for channel context degradation (default 4000). */
  maxChannelMessageChars?: number;
  ttlMinutes: number;
  autoSave: boolean;
  compactionEnabled: boolean;
  dbPath?: string;
  sessionsDir?: string;
}

export interface Chat {
  id: string;
  title: string;
  channel: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  metadata?: Record<string, unknown>;
}

export interface ListChatsOptions {
  archived?: boolean;
  limit?: number;
  offset?: number;
}
