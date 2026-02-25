export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';

export interface Job {
  readonly id: string;
  readonly type: string;
  readonly status: JobStatus;
  readonly payload: unknown;
  readonly result: unknown | undefined;
  readonly priority: number;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly scheduledAt: number;
  readonly startedAt: number | undefined;
  readonly completedAt: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface JobOptions {
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: number;
}

export interface JobContext {
  readonly jobId: string;
  readonly attempt: number;
  readonly signal: AbortSignal;
  checkpoint(data: unknown): void;
  getCheckpoint<T = unknown>(): T | undefined;
}

export interface JobHandler<T = unknown, R = unknown> {
  (payload: T, context: JobContext): Promise<R>;
}

export interface JobQueueOptions {
  pollIntervalMs?: number;
  concurrency?: number;
}

export interface JobFilter {
  type?: string;
  status?: JobStatus;
  limit?: number;
}

export type JobEvent = 'job:started' | 'job:completed' | 'job:failed' | 'job:dead';

export interface JobQueueStats {
  pending: number;
  running: number;
  completed24h: number;
  failed24h: number;
  dead: number;
}
