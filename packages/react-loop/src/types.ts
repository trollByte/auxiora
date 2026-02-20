export type StepType = 'thought' | 'action' | 'observation' | 'answer';
export type LoopStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'max_steps_reached';

export interface ReActStep {
  type: StepType;
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: string;
  timestamp: number;
  durationMs?: number;
}

export interface ReActConfig {
  maxSteps?: number;
  maxTokenBudget?: number;
  requireApproval?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  timeoutMs?: number;
}

export interface ReActResult {
  status: LoopStatus;
  steps: ReActStep[];
  answer?: string;
  totalTokens: number;
  totalDurationMs: number;
  error?: string;
}

export interface ReActCallbacks {
  think: (goal: string, history: ReActStep[]) => Promise<{
    thought: string;
    action?: { tool: string; params: Record<string, unknown> };
    answer?: string;
  }>;
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<string>;
  onStep?: (step: ReActStep) => void;
  onApprovalNeeded?: (step: ReActStep) => Promise<boolean>;
  estimateTokens?: (text: string) => number;
}
