import type { Job } from './types.js';

export interface DeadLetterEntry {
  job: Job;
  /** When it was added to the dead letter queue */
  diedAt: number;
  /** Reason for death */
  reason: string;
  /** Number of times retry has been attempted from the DLQ */
  retryCount: number;
}

export interface DeadLetterStats {
  total: number;
  byType: Record<string, number>;
  oldestAt: number;
  newestAt: number;
}

export class DeadLetterMonitor {
  private entries = new Map<string, DeadLetterEntry>();
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /** Record a dead job */
  add(job: Job, reason: string): void {
    // Enforce max size by removing oldest
    if (this.entries.size >= this.maxEntries) {
      let oldestId: string | undefined;
      let oldestTime = Infinity;
      for (const [id, entry] of this.entries) {
        if (entry.diedAt < oldestTime) {
          oldestTime = entry.diedAt;
          oldestId = id;
        }
      }
      if (oldestId) this.entries.delete(oldestId);
    }

    this.entries.set(job.id, {
      job: { ...job },
      diedAt: Date.now(),
      reason,
      retryCount: 0,
    });
  }

  /** Get a specific dead letter entry */
  get(jobId: string): DeadLetterEntry | undefined {
    return this.entries.get(jobId);
  }

  /** List all dead letter entries, optionally filtered by type */
  list(type?: string): DeadLetterEntry[] {
    const all = [...this.entries.values()];
    if (type) return all.filter(e => e.job.type === type);
    return all;
  }

  /** Remove an entry (after successful retry or manual dismissal) */
  remove(jobId: string): boolean {
    return this.entries.delete(jobId);
  }

  /** Mark an entry as retried (increment counter) */
  markRetried(jobId: string): void {
    const entry = this.entries.get(jobId);
    if (entry) {
      entry.retryCount++;
    }
  }

  /** Get stats about the dead letter queue */
  getStats(): DeadLetterStats {
    const byType: Record<string, number> = {};
    let oldestAt = Infinity;
    let newestAt = 0;

    for (const entry of this.entries.values()) {
      byType[entry.job.type] = (byType[entry.job.type] ?? 0) + 1;
      if (entry.diedAt < oldestAt) oldestAt = entry.diedAt;
      if (entry.diedAt > newestAt) newestAt = entry.diedAt;
    }

    return {
      total: this.entries.size,
      byType,
      oldestAt: this.entries.size > 0 ? oldestAt : 0,
      newestAt: this.entries.size > 0 ? newestAt : 0,
    };
  }

  /** Clear all entries */
  clear(): void {
    this.entries.clear();
  }

  /** Get count */
  get size(): number {
    return this.entries.size;
  }
}
