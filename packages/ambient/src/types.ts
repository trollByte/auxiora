/** Types of patterns the ambient engine can detect. */
export type AmbientPatternType = 'schedule' | 'preference' | 'trigger' | 'correlation';

/** Notification priority levels for quiet notifications. */
export type NotificationPriority = 'whisper' | 'nudge' | 'alert';

/** A detected ambient pattern from user behavior. */
export interface AmbientPattern {
  id: string;
  /** Pattern type. */
  type: AmbientPatternType;
  /** Human-readable description. */
  description: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Evidence supporting this pattern. */
  evidence: string[];
  /** When the pattern was first detected. */
  detectedAt: number;
  /** When the pattern was last confirmed. */
  lastConfirmedAt: number;
  /** Number of times this pattern has been observed. */
  occurrences: number;
}

/** An anticipated user need based on detected patterns. */
export interface Anticipation {
  id: string;
  /** What the user might need. */
  description: string;
  /** When this need is expected. */
  expectedAt: number;
  /** Confidence that this anticipation is correct (0-1). */
  confidence: number;
  /** Patterns that led to this anticipation. */
  sourcePatterns: string[];
  /** Suggested action to fulfill the need. */
  suggestedAction?: string;
}

/** A quiet notification queued for the user. */
export interface QuietNotification {
  id: string;
  /** Priority level. */
  priority: NotificationPriority;
  /** Notification message. */
  message: string;
  /** Detailed content (optional). */
  detail?: string;
  /** When the notification was created. */
  createdAt: number;
  /** Whether the notification has been dismissed. */
  dismissed: boolean;
  /** Source of the notification. */
  source: string;
}

/** Configuration for personalized briefings. */
export interface BriefingConfig {
  /** Whether briefings are enabled. */
  enabled: boolean;
  /** Time of day for morning briefing (HH:MM). */
  morningTime: string;
  /** Time of day for evening summary (HH:MM). */
  eveningTime: string;
  /** Categories to include in briefings. */
  categories: string[];
  /** Maximum number of items per section. */
  maxItemsPerSection: number;
}

export const DEFAULT_BRIEFING_CONFIG: BriefingConfig = {
  enabled: true,
  morningTime: '08:00',
  eveningTime: '20:00',
  categories: ['calendar', 'tasks', 'weather', 'news', 'patterns'],
  maxItemsPerSection: 5,
};

/** An observed event for the pattern engine. */
export interface ObservedEvent {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
