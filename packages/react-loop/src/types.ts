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

/** Checkpoint data saved after each step for crash recovery */
export interface ReActCheckpoint {
  sessionId: string;
  goal: string;
  steps: ReActStep[];
  totalTokens: number;
  status: LoopStatus;
  savedAt: number;
}

/** Handler for persisting and loading checkpoints */
export interface CheckpointHandler {
  save(checkpoint: ReActCheckpoint): Promise<void>;
  load(sessionId: string): Promise<ReActCheckpoint | undefined>;
}

/** Result of validating a step */
export interface StepValidation {
  valid: boolean;
  message?: string;
  /** If true, abort the loop on validation failure */
  abort?: boolean;
}

export interface ReActConfig {
  maxSteps?: number;
  maxTokenBudget?: number;
  requireApproval?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  timeoutMs?: number;
  sessionId?: string;
  checkpointHandler?: CheckpointHandler;
  validateStep?: (step: ReActStep, allSteps: ReActStep[]) => Promise<StepValidation>;
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
