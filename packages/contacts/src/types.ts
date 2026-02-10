export interface Contact {
  id: string;
  displayName: string;
  emails: string[];
  phones?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string; // ISO date
  sources: ContactSource[];
  relationship: RelationshipScore;
  lastInteraction?: number; // timestamp
  notes?: string[];
  tags?: string[];
}

export interface ContactSource {
  type: 'email' | 'calendar' | 'social' | 'channel' | 'manual';
  sourceId: string;
  importedAt: number;
}

export interface RelationshipScore {
  strength: number;    // 0-1
  frequency: number;   // interactions per 30 days
  recency: number;     // days since last interaction
  context: string;     // e.g. "colleague", "client", "friend"
}

export interface Interaction {
  contactId: string;
  type: 'email' | 'meeting' | 'message' | 'social';
  timestamp: number;
  summary?: string;
}

export interface ContactGraphConfig {
  mergeThreshold?: number; // similarity threshold for auto-merge, default 0.8
  decayDays?: number;      // relationship decay period, default 90
}
