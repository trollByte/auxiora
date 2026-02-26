/** Structural types to avoid direct imports */
interface TelemetryTrackerLike {
  recordJob(outcome: { type: string; success: boolean; durationMs: number; jobId: string; error?: string }): void;
}

interface JobEmitterLike {
  on(event: string, listener: (data: unknown) => void): void;
}

/**
 * Wire job queue events to telemetry tracker.
 *
 * Listens to job:completed, job:failed, job:dead events and records
 * them for operational telemetry and self-improvement loops.
 */
export function wireTelemetry(emitter: JobEmitterLike, tracker: TelemetryTrackerLike): void {
  emitter.on('job:completed', (data: unknown) => {
    const { job } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number } };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: true, durationMs, jobId: job.id });
  });

  emitter.on('job:failed', (data: unknown) => {
    const { job, error } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number }; error?: Error };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: false, durationMs, jobId: job.id, error: error?.message });
  });

  emitter.on('job:dead', (data: unknown) => {
    const { job, error } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number }; error?: Error };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: false, durationMs, jobId: job.id, error: error?.message ?? 'dead letter' });
  });
}
