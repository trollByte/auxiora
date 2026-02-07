export type MemoryCategory =
  | 'preference'     // user preferences
  | 'fact'           // factual knowledge about user
  | 'context'        // contextual information
  | 'relationship'   // shared history, inside jokes
  | 'pattern'        // observed communication patterns
  | 'personality';   // personality adaptation signals

export type MemorySource = 'extracted' | 'explicit' | 'observed';

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
