export interface OverseerConfig {
  loopThreshold: number;
  stallTimeoutMs: number;
  maxTokenBudget: number;
  checkIntervalMs: number;
}

export interface ToolCall {
  tool: string;
  timestamp: number;
}

export interface AgentSnapshot {
  agentId: string;
  toolCalls: ToolCall[];
  tokenUsage: number;
  lastActivityAt: number;
  startedAt: number;
}

export type AlertType = 'loop_detected' | 'stall_detected' | 'budget_exceeded';

export interface OverseerAlert {
  type: AlertType;
  agentId: string;
  message: string;
  severity: 'warning' | 'critical';
  detectedAt: number;
}

export type OverseerAction = 'none' | 'alert' | 'notify' | 'cancel';

export interface LLMAssessment {
  severity: 'warning' | 'critical';
  reasoning: string;
  suggestedAction: OverseerAction;
  notification?: string;
}

export interface AssessmentResult {
  agentId: string;
  heuristicAlerts: OverseerAlert[];
  llmAssessment?: LLMAssessment;
  action: OverseerAction;
  notification?: string;
  assessedAt: number;
}

export interface LLMCallerLike {
  assessWithLLM(alerts: OverseerAlert[], snapshot: AgentSnapshot): Promise<LLMAssessment>;
}
