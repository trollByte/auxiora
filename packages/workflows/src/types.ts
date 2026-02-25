export type WorkflowStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

/** An action that can be auto-executed by the AutonomousExecutor. */
export interface AutonomousAction {
  /** Tool name to execute (e.g. 'file_read', 'bash', 'email_compose'). */
  tool: string;
  /** Parameters to pass to the tool. */
  params: Record<string, unknown>;
  /** Trust domain for gate checking (e.g. 'files', 'shell', 'email'). */
  trustDomain: string;
  /** Minimum trust level required (0-4). */
  trustRequired: number;
  /** Optional tool to call for rollback on failure. */
  rollbackTool?: string;
  /** Optional params for the rollback tool. */
  rollbackParams?: Record<string, unknown>;
}

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
  /** If present, step can be auto-executed by AutonomousExecutor. */
  action?: AutonomousAction;
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
  type: 'created' | 'step_completed' | 'step_failed' | 'step_trust_denied' | 'step_rolled_back' | 'reminder_sent' | 'escalated' | 'completed' | 'cancelled' | 'approval_requested' | 'approved' | 'rejected';
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
  /** If true, steps with actions are auto-executed by AutonomousExecutor. */
  autonomous?: boolean;
}
