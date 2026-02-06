export type BehaviorType = 'scheduled' | 'monitor' | 'one-shot';
export type BehaviorStatus = 'active' | 'paused' | 'deleted' | 'missed';

export interface BehaviorSchedule {
  cron: string;
  timezone: string;
}

export interface BehaviorPolling {
  intervalMs: number;
  condition: string;
}

export interface BehaviorDelay {
  fireAt: string; // ISO timestamp
}

export interface BehaviorChannel {
  type: string;
  id: string;
  overridden: boolean;
}

export interface Behavior {
  id: string;
  type: BehaviorType;
  status: BehaviorStatus;
  action: string;
  schedule?: BehaviorSchedule;
  polling?: BehaviorPolling;
  delay?: BehaviorDelay;
  channel: BehaviorChannel;
  createdBy: string;
  createdAt: string;
  lastRun?: string;
  lastResult?: string;
  runCount: number;
  failCount: number;
  maxFailures: number;
}

export interface BehaviorExecution {
  behaviorId: string;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  result?: string;
  error?: string;
}

export const BEHAVIOR_DEFAULTS = {
  maxFailures: 3,
  minPollingIntervalMs: 60_000,
  maxPollingIntervalMs: 86_400_000,
  maxActiveBehaviors: 50,
  executionTimeoutMs: 60_000,
  retryDelayMs: 30_000,
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
} as const;
