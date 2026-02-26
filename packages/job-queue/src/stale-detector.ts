export interface StaleJobInfo {
  readonly id: string;
  readonly type: string;
  readonly startedAt: number;
  readonly staleDurationMs: number;
}

export interface StaleDetectorOptions {
  readonly staleAfterMs: number;
  readonly autoKill?: boolean;
  readonly checkIntervalMs?: number;
}

/** Structural type for the database dependency */
interface JobDbLike {
  getRunningJobs(): Array<{ id: string; type: string; startedAt: number }>;
  killJob(id: string): void;
}

export class StaleJobDetector {
  private db: JobDbLike;
  private staleAfterMs: number;
  private autoKill: boolean;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(db: JobDbLike, options: StaleDetectorOptions) {
    this.db = db;
    this.staleAfterMs = options.staleAfterMs;
    this.autoKill = options.autoKill ?? false;
  }

  check(): StaleJobInfo[] {
    const now = Date.now();
    const running = this.db.getRunningJobs();
    const stale: StaleJobInfo[] = [];

    for (const job of running) {
      const elapsed = now - job.startedAt;
      if (elapsed > this.staleAfterMs) {
        stale.push({
          id: job.id,
          type: job.type,
          startedAt: job.startedAt,
          staleDurationMs: elapsed,
        });

        if (this.autoKill) {
          this.db.killJob(job.id);
        }
      }
    }

    return stale;
  }

  start(intervalMs: number): void {
    this.timer = setInterval(() => this.check(), intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
