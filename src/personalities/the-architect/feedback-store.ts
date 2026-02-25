import type { ContextDomain, TraitMix } from '../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type FeedbackRating = 'helpful' | 'off_target' | 'too_verbose' | 'too_brief' | 'wrong_tone';

export interface FeedbackEntry {
  id: string;
  timestamp: number;
  domain: ContextDomain;
  rating: FeedbackRating;
  traitSnapshot: Partial<Record<keyof TraitMix, number>>;
  note?: string;
}

export interface FeedbackInsight {
  /** Trait adjustments suggested by accumulated feedback. */
  suggestedAdjustments: Partial<Record<keyof TraitMix, number>>;
  /** Domains where responses consistently miss. */
  weakDomains: ContextDomain[];
  /** Overall satisfaction trend: improving, declining, or stable. */
  trend: 'improving' | 'declining' | 'stable';
  /** Total feedback count. */
  totalFeedback: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Generate a v4-style UUID without crypto dependency. */
function generateId(): string {
  const hex = '0123456789abcdef';
  const segments = [8, 4, 4, 4, 12];
  return segments.map(len => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += hex[Math.floor(Math.random() * 16)];
    }
    return s;
  }).join('-');
}

/**
 * Compute the helpful ratio for a slice of entries.
 * Returns 0 if the slice is empty.
 */
function helpfulRatio(entries: FeedbackEntry[]): number {
  if (entries.length === 0) return 0;
  const helpful = entries.filter(e => e.rating === 'helpful').length;
  return helpful / entries.length;
}

/**
 * Compare helpful ratios of first half vs second half.
 * A difference > 0.10 in either direction triggers a trend change.
 */
function computeTrend(entries: FeedbackEntry[]): 'improving' | 'declining' | 'stable' {
  if (entries.length < 2) return 'stable';

  const mid = Math.floor(entries.length / 2);
  const firstHalf = entries.slice(0, mid);
  const secondHalf = entries.slice(mid);

  const firstRatio = helpfulRatio(firstHalf);
  const secondRatio = helpfulRatio(secondHalf);
  const diff = secondRatio - firstRatio;

  if (diff > 0.10) return 'improving';
  if (diff < -0.10) return 'declining';
  return 'stable';
}

// ────────────────────────────────────────────────────────────────────────────
// FeedbackStore
// ────────────────────────────────────────────────────────────────────────────

export class FeedbackStore {
  private entries: FeedbackEntry[] = [];
  private maxEntries = 500;

  /** Record feedback on a response. Auto-generates id and timestamp. */
  addFeedback(entry: Omit<FeedbackEntry, 'id' | 'timestamp'>): void {
    this.entries.push({
      ...entry,
      id: generateId(),
      timestamp: Date.now(),
    });

    // Drop oldest entries when exceeding capacity
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
  }

  /**
   * Analyze all feedback to produce actionable insights.
   * - too_verbose feedback -> suggest lowering verbosity (negative adjustment)
   * - too_brief feedback -> suggest raising verbosity (positive adjustment)
   * - off_target in a domain -> flag as weak domain
   * - wrong_tone -> suggest adjusting warmth up
   */
  getInsights(): FeedbackInsight {
    const suggestedAdjustments: Partial<Record<keyof TraitMix, number>> = {};
    const weakDomains: ContextDomain[] = [];

    // Count each rating type across all entries
    let tooVerboseCount = 0;
    let tooBriefCount = 0;
    let wrongToneCount = 0;

    // Count off_target per domain
    const offTargetByDomain = new Map<ContextDomain, number>();

    for (const entry of this.entries) {
      switch (entry.rating) {
        case 'too_verbose':
          tooVerboseCount++;
          break;
        case 'too_brief':
          tooBriefCount++;
          break;
        case 'wrong_tone':
          wrongToneCount++;
          break;
        case 'off_target': {
          const count = offTargetByDomain.get(entry.domain) ?? 0;
          offTargetByDomain.set(entry.domain, count + 1);
          break;
        }
      }
    }

    // too_verbose (>= 5) -> lower verbosity, capped at -0.3
    if (tooVerboseCount >= 5) {
      const adj = -0.1 * tooVerboseCount;
      suggestedAdjustments.verbosity = Math.max(adj, -0.3);
    }

    // too_brief (>= 5) -> raise verbosity, capped at +0.3
    if (tooBriefCount >= 5) {
      const adj = 0.1 * tooBriefCount;
      suggestedAdjustments.verbosity = Math.min(adj, 0.3);
    }

    // wrong_tone (>= 5) -> adjust warmth up
    if (wrongToneCount >= 5) {
      suggestedAdjustments.warmth = 0.1;
    }

    // off_target in a domain (>= 3) -> weak domain
    for (const [domain, count] of offTargetByDomain) {
      if (count >= 3) {
        weakDomains.push(domain);
      }
    }

    const trend = computeTrend(this.entries);

    return {
      suggestedAdjustments,
      weakDomains,
      trend,
      totalFeedback: this.entries.length,
    };
  }

  /** Get feedback for a specific domain. */
  getForDomain(domain: ContextDomain): FeedbackEntry[] {
    return this.entries.filter(e => e.domain === domain);
  }

  /** Get the satisfaction trend over the last N entries. */
  getRecentTrend(windowSize = 20): 'improving' | 'declining' | 'stable' {
    const window = this.entries.slice(-windowSize);
    return computeTrend(window);
  }

  /** Serialize for encrypted storage. */
  serialize(): string {
    return JSON.stringify({ entries: this.entries });
  }

  /** Deserialize from encrypted storage. */
  static deserialize(data: string): FeedbackStore {
    const store = new FeedbackStore();
    const parsed = JSON.parse(data) as { entries: FeedbackEntry[] };
    if (Array.isArray(parsed.entries)) {
      store.entries = parsed.entries;
    }
    return store;
  }

  /** Clear all feedback (user data deletion). */
  clear(): void {
    this.entries = [];
  }
}
