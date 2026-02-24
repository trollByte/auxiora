export type MemoryCategory =
  | 'preference'     // user preferences
  | 'fact'           // factual knowledge about user
  | 'context'        // contextual information
  | 'relationship'   // shared history, inside jokes
  | 'pattern'        // observed communication patterns
  | 'personality';   // personality adaptation signals

export type MemorySource = 'extracted' | 'explicit' | 'observed';

/** Tracks the origin and derivation of a memory. */
export interface MemoryProvenance {
  /** How this memory was created: 'user_stated', 'extracted', 'inferred', 'merged' */
  origin: 'user_stated' | 'extracted' | 'inferred' | 'merged';
  /** ID of the conversation/session where this memory was created */
  sessionId?: string;
  /** Agent or system that created this memory */
  createdBy?: string;
  /** Source message or context excerpt (truncated to 200 chars) */
  sourceExcerpt?: string;
  /** IDs of memories this was derived from (for merged/inferred) */
  derivedFrom?: string[];
  /** Confidence score at time of creation (0-1) */
  extractionConfidence?: number;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  tags: string[];
  importance: number;
  confidence: number;
  expiresAt?: number;
  relatedMemories?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  encrypted?: boolean;
  /** Provenance tracking for this memory. */
  provenance?: MemoryProvenance;
  /** Partition this memory belongs to. Defaults to 'global'. */
  partitionId?: string;
  /** User ID that created this memory. */
  sourceUserId?: string;
}

/** A memory partition for per-user or shared storage. */
export interface MemoryPartition {
  id: string;
  name: string;
  type: 'private' | 'shared' | 'global';
  ownerId?: string;
  memberIds?: string[];
  createdAt: number;
}

export interface RelationshipMemory {
  type: 'inside_joke' | 'shared_experience' | 'milestone' | 'callback';
  originalContext?: string;
  useCount: number;
  lastUsed: number;
}

export interface PatternMemory {
  type: 'communication' | 'schedule' | 'topic' | 'mood';
  pattern: string;
  observations: number;
  confidence: number;
  examples?: string[];
}

export interface PersonalityAdaptation {
  trait: string;
  adjustment: number;
  reason: string;
  signalCount: number;
}

export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  sentiment: SentimentLabel;
  confidence: number;
  keywords: string[];
}

export interface SentimentSnapshot {
  sentiment: SentimentLabel;
  confidence: number;
  timestamp: number;
  hour: number;
  dayOfWeek: number;
}

export interface LivingMemoryState {
  facts: MemoryEntry[];
  relationships: MemoryEntry[];
  patterns: MemoryEntry[];
  adaptations: PersonalityAdaptation[];
  stats: {
    totalMemories: number;
    oldestMemory: number;
    newestMemory: number;
    averageImportance: number;
    topTags: Array<{ tag: string; count: number }>;
  };
}
