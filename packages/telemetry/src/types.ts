export interface ToolInvocation {
  readonly tool: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly context?: string;
  readonly error?: string;
}

export interface ToolStats {
  readonly tool: string;
  readonly totalCalls: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly lastError: string;
}

export interface JobOutcome {
  readonly type: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly jobId: string;
  readonly error?: string;
}

export interface JobTypeStats {
  readonly type: string;
  readonly totalJobs: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly lastError: string;
}
