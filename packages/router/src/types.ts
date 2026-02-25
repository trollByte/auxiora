export type TaskType =
  | 'reasoning'
  | 'code'
  | 'creative'
  | 'vision'
  | 'long-context'
  | 'fast'
  | 'private'
  | 'image-gen'
  | 'general';

export interface TaskClassification {
  type: TaskType;
  confidence: number;
  inputTokenEstimate: number;
  requiresTools: boolean;
  requiresVision: boolean;
  sensitivityLevel: 'normal' | 'private' | 'secret';
}

export interface ModelSelection {
  provider: string;
  model: string;
  reason: string;
  estimatedCost: number;
  isLocal: boolean;
}

export interface RoutingResult {
  classification: TaskClassification;
  selection: ModelSelection;
  alternatives: ModelSelection[];
}

export interface RoutingContext {
  hasImages?: boolean;
  messageCount?: number;
  conversationTokens?: number;
}

export interface CostRecord {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface CostSummary {
  today: number;
  thisMonth: number;
  budgetRemaining?: number;
  isOverBudget: boolean;
  warningThresholdReached: boolean;
}
