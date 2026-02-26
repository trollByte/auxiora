export interface ReasoningStep {
  name: string;
  description: string;
  order: number;
  required: boolean;
}

export type StepStatus = 'pending' | 'available' | 'completed' | 'skipped';

export interface StepState {
  step: ReasoningStep;
  status: StepStatus;
  output?: Record<string, unknown>;
  completedAt?: number;
}

export interface StepProgress {
  completed: number;
  total: number;
  percentage: number;
}
