export type WorkflowStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  assigneeId: string;
  status: StepStatus;
  dependsOn: string[];
  completedAt?: number;
  completedBy?: string;
  result?: string;
}

export interface ReminderConfig {
  enabled: boolean;
  intervalMs: number;
  maxReminders: number;
  channelType?: string;
}

export interface EscalationPolicy {
  enabled: boolean;
  escalateAfterMs: number;
  escalateToUserId: string;
  maxEscalations: number;
}

export interface WorkflowEvent {
  id: string;
  workflowId: string;
  type: 'created' | 'step_completed' | 'step_failed' | 'reminder_sent' | 'escalated' | 'completed' | 'cancelled' | 'approval_requested' | 'approved' | 'rejected';
  stepId?: string;
  userId?: string;
  details?: string;
  timestamp: number;
}

export interface HumanWorkflow {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  reminder: ReminderConfig;
  escalation: EscalationPolicy;
  events: WorkflowEvent[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}
