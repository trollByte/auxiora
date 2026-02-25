export interface JobMetricsSnapshot {
  /** Total jobs enqueued since startup */
  enqueuedTotal: number;
  /** Total jobs started since startup */
  startedTotal: number;
  /** Total jobs completed successfully since startup */
  completedTotal: number;
  /** Total jobs failed (retriable) since startup */
  failedTotal: number;
  /** Total jobs dead (non-retriable) since startup */
  deadTotal: number;
  /** Total jobs recovered on startup */
  recoveredTotal: number;
  /** Completed job durations in ms (for histogram) */
  durationHistogram: number[];
  /** Jobs by type */
  byType: Record<string, { enqueued: number; completed: number; failed: number; dead: number }>;
}

export class JobQueueMetrics {
  private enqueuedTotal = 0;
  private startedTotal = 0;
  private completedTotal = 0;
  private failedTotal = 0;
  private deadTotal = 0;
  private recoveredTotal = 0;
  private durations: number[] = [];
  private byType = new Map<string, { enqueued: number; completed: number; failed: number; dead: number }>();
  private maxDurations = 1000;

  recordEnqueued(type: string): void {
    this.enqueuedTotal++;
    const entry = this.getTypeEntry(type);
    entry.enqueued++;
  }

  recordStarted(): void {
    this.startedTotal++;
  }

  recordCompleted(type: string, durationMs: number): void {
    this.completedTotal++;
    this.durations.push(durationMs);
    if (this.durations.length > this.maxDurations) {
      this.durations.shift();
    }
    const entry = this.getTypeEntry(type);
    entry.completed++;
  }

  recordFailed(type: string): void {
    this.failedTotal++;
    const entry = this.getTypeEntry(type);
    entry.failed++;
  }

  recordDead(type: string): void {
    this.deadTotal++;
    const entry = this.getTypeEntry(type);
    entry.dead++;
  }

  recordRecovery(count: number): void {
    this.recoveredTotal += count;
  }

  getSnapshot(): JobMetricsSnapshot {
    const byType: Record<string, { enqueued: number; completed: number; failed: number; dead: number }> = {};
    for (const [type, entry] of this.byType) {
      byType[type] = { ...entry };
    }

    return {
      enqueuedTotal: this.enqueuedTotal,
      startedTotal: this.startedTotal,
      completedTotal: this.completedTotal,
      failedTotal: this.failedTotal,
      deadTotal: this.deadTotal,
      recoveredTotal: this.recoveredTotal,
      durationHistogram: [...this.durations],
      byType,
    };
  }

  /** Get percentile from duration histogram */
  getDurationPercentile(p: number): number {
    if (this.durations.length === 0) return 0;
    const sorted = [...this.durations].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /** Get average duration */
  getAverageDuration(): number {
    if (this.durations.length === 0) return 0;
    return this.durations.reduce((a, b) => a + b, 0) / this.durations.length;
  }

  reset(): void {
    this.enqueuedTotal = 0;
    this.startedTotal = 0;
    this.completedTotal = 0;
    this.failedTotal = 0;
    this.deadTotal = 0;
    this.recoveredTotal = 0;
    this.durations = [];
    this.byType.clear();
  }

  private getTypeEntry(type: string) {
    let entry = this.byType.get(type);
    if (!entry) {
      entry = { enqueued: 0, completed: 0, failed: 0, dead: 0 };
      this.byType.set(type, entry);
    }
    return entry;
  }
}
