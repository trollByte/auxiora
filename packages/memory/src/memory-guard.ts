import { getLogger } from '@auxiora/logger';
import type { MemoryEntry } from './types.js';

const logger = getLogger('memory:guard');

export interface MemoryAnomaly {
  type: 'bulk_insertion' | 'contradiction' | 'untrusted_source' | 'confidence_anomaly';
  severity: 'low' | 'medium' | 'high';
  description: string;
  memoryId?: string;
  /** Whether the memory should be blocked (true) or just flagged (false) */
  block: boolean;
}

export interface MemoryGuardOptions {
  /** Max insertions within the time window before flagging. Default: 10 */
  bulkThreshold?: number;
  /** Time window for bulk detection in ms. Default: 60_000 */
  bulkWindowMs?: number;
  /** List of trusted source user IDs. If empty, all sources trusted. */
  trustedSourceIds?: string[];
  /** Confidence threshold for anomaly detection. Default: 0.95 */
  confidenceAnomalyThreshold?: number;
  /** Tag overlap ratio to consider two memories related. Default: 0.5 */
  contradictionTagOverlap?: number;
}

export class MemoryGuard {
  private readonly bulkThreshold: number;
  private readonly bulkWindowMs: number;
  private readonly trustedSourceIds: Set<string>;
  private readonly confidenceAnomalyThreshold: number;
  private readonly contradictionTagOverlap: number;
  private recentInsertions: number[] = [];

  constructor(options?: MemoryGuardOptions) {
    this.bulkThreshold = options?.bulkThreshold ?? 10;
    this.bulkWindowMs = options?.bulkWindowMs ?? 60_000;
    this.trustedSourceIds = new Set(options?.trustedSourceIds ?? []);
    this.confidenceAnomalyThreshold = options?.confidenceAnomalyThreshold ?? 0.95;
    this.contradictionTagOverlap = options?.contradictionTagOverlap ?? 0.5;
  }

  /**
   * Check a memory entry against all anomaly detectors.
   * Returns an array of anomalies found (empty = safe).
   */
  check(entry: MemoryEntry, existingMemories: MemoryEntry[]): MemoryAnomaly[] {
    const anomalies: MemoryAnomaly[] = [];

    anomalies.push(...this.checkBulkInsertion());
    anomalies.push(...this.checkContradiction(entry, existingMemories));
    anomalies.push(...this.checkUntrustedSource(entry));
    anomalies.push(...this.checkConfidenceAnomaly(entry));

    if (anomalies.length > 0) {
      logger.warn('Memory anomalies detected', {
        memoryId: entry.id,
        anomalyCount: anomalies.length,
        types: anomalies.map(a => a.type),
      });
    }

    return anomalies;
  }

  /** Record that an insertion happened (call before check for accurate bulk detection) */
  recordInsertion(): void {
    this.recentInsertions.push(Date.now());
  }

  /** Clear insertion history (for testing) */
  resetHistory(): void {
    this.recentInsertions = [];
  }

  private checkBulkInsertion(): MemoryAnomaly[] {
    const now = Date.now();
    // Prune old entries
    this.recentInsertions = this.recentInsertions.filter(t => now - t < this.bulkWindowMs);

    if (this.recentInsertions.length >= this.bulkThreshold) {
      return [{
        type: 'bulk_insertion',
        severity: 'high',
        description: `${this.recentInsertions.length} memories inserted within ${this.bulkWindowMs / 1000}s (threshold: ${this.bulkThreshold})`,
        block: true,
      }];
    }
    return [];
  }

  private checkContradiction(entry: MemoryEntry, existing: MemoryEntry[]): MemoryAnomaly[] {
    const anomalies: MemoryAnomaly[] = [];

    for (const mem of existing) {
      // Check tag overlap
      const overlap = this.tagOverlap(entry.tags, mem.tags);
      if (overlap < this.contradictionTagOverlap) continue;

      // Check sentiment contradiction
      if (entry.sentiment && mem.sentiment &&
          entry.sentiment !== 'neutral' && mem.sentiment !== 'neutral' &&
          entry.sentiment !== mem.sentiment) {
        anomalies.push({
          type: 'contradiction',
          severity: 'medium',
          description: `New memory contradicts existing memory "${mem.id}": sentiment ${entry.sentiment} vs ${mem.sentiment} (${Math.round(overlap * 100)}% tag overlap)`,
          memoryId: mem.id,
          block: false,
        });
      }
    }

    return anomalies;
  }

  private checkUntrustedSource(entry: MemoryEntry): MemoryAnomaly[] {
    if (this.trustedSourceIds.size === 0) return []; // No trust list = trust all

    if (entry.sourceUserId && !this.trustedSourceIds.has(entry.sourceUserId)) {
      return [{
        type: 'untrusted_source',
        severity: 'medium',
        description: `Memory from untrusted source: ${entry.sourceUserId}`,
        block: false,
      }];
    }
    return [];
  }

  private checkConfidenceAnomaly(entry: MemoryEntry): MemoryAnomaly[] {
    const origin = entry.provenance?.origin;
    // Only flag non-user-stated memories with suspiciously high confidence
    if (origin && origin !== 'user_stated' && entry.confidence > this.confidenceAnomalyThreshold) {
      return [{
        type: 'confidence_anomaly',
        severity: 'low',
        description: `${origin} memory has unusually high confidence: ${entry.confidence}`,
        block: false,
      }];
    }
    return [];
  }

  private tagOverlap(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 || tags2.length === 0) return 0;
    const set2 = new Set(tags2);
    const overlap = tags1.filter(t => set2.has(t)).length;
    return overlap / Math.max(tags1.length, tags2.length);
  }
}
