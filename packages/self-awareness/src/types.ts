import type { Message } from '@auxiora/sessions';

// -- Signal types -------------------------------------------------------------

export interface AwarenessSignal {
  /** Which collector produced this signal */
  dimension: string;
  /** 0-1, higher = more important to include in prompt budget */
  priority: number;
  /** Human-readable text for prompt injection */
  text: string;
  /** Structured data for programmatic use */
  data: Record<string, unknown>;
}

// -- Context types ------------------------------------------------------------

export interface CollectionContext {
  userId: string;
  sessionId: string;
  chatId: string;
  currentMessage: string;
  recentMessages: Message[];
}

export interface PostResponseContext extends CollectionContext {
  response: string;
  responseTime: number;
  tokensUsed: { input: number; output: number };
}

// -- Collector interface ------------------------------------------------------

export interface SignalCollector {
  readonly name: string;
  enabled: boolean;
  collect(context: CollectionContext): Promise<AwarenessSignal[]>;
  afterResponse?(context: PostResponseContext): Promise<void>;
}

// -- Storage interface --------------------------------------------------------

export interface AwarenessStorage {
  read(namespace: string, key: string): Promise<Record<string, unknown> | null>;
  write(namespace: string, key: string, data: Record<string, unknown>): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
}

// -- Config -------------------------------------------------------------------

export interface SelfAwarenessConfig {
  enabled: boolean;
  tokenBudget: number;
  collectors: {
    conversationReflector: boolean;
    capacityMonitor: boolean;
    knowledgeBoundary: boolean;
    relationshipModel: boolean;
    temporalTracker: boolean;
    environmentSensor: boolean;
    metaCognitor: boolean;
  };
  proactiveInsights: boolean;
}
