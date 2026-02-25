/**
 * Domain types — duplicated locally to avoid cross-package dependency on
 * the personality source tree. Must be kept in sync with schema.ts.
 */
export type ContextDomain =
  | 'security_review'
  | 'code_engineering'
  | 'architecture_design'
  | 'debugging'
  | 'team_leadership'
  | 'one_on_one'
  | 'sales_pitch'
  | 'negotiation'
  | 'marketing_content'
  | 'strategic_planning'
  | 'crisis_management'
  | 'creative_work'
  | 'writing_content'
  | 'decision_making'
  | 'learning_research'
  | 'personal_development'
  | 'general';

export interface JournalEntryMessage {
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
}

export interface JournalEntryContext {
  domains: ContextDomain[];
  emotionalArc?: string;
  activeDecisions?: string[];
  corrections?: string[];
  satisfaction?: number;
}

export interface JournalEntrySelfState {
  health: 'healthy' | 'degraded' | 'critical';
  activeProviders: string[];
  uptime: number;
}

export type JournalEntryType = 'message' | 'decision' | 'correction' | 'system_event';

export interface JournalEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  type: JournalEntryType;
  message?: JournalEntryMessage;
  context: JournalEntryContext;
  selfState: JournalEntrySelfState;
  summary?: string;
}

export interface SessionSummary {
  sessionId: string;
  startTime: number;
  endTime: number;
  messageCount: number;
  domains: ContextDomain[];
  decisions: string[];
  corrections: number;
  satisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
  summary: string;
}

export interface JournalSearchQuery {
  text?: string;
  domains?: ContextDomain[];
  dateRange?: { from: number; to: number };
  type?: JournalEntryType;
  limit?: number;
}
