import type { ContextDomain, TraitMix } from '../schema.js';
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
export declare class FeedbackStore {
    private entries;
    private maxEntries;
    /** Record feedback on a response. Auto-generates id and timestamp. */
    addFeedback(entry: Omit<FeedbackEntry, 'id' | 'timestamp'>): void;
    /**
     * Analyze all feedback to produce actionable insights.
     * - too_verbose feedback -> suggest lowering verbosity (negative adjustment)
     * - too_brief feedback -> suggest raising verbosity (positive adjustment)
     * - off_target in a domain -> flag as weak domain
     * - wrong_tone -> suggest adjusting warmth up
     */
    getInsights(): FeedbackInsight;
    /** Get feedback for a specific domain. */
    getForDomain(domain: ContextDomain): FeedbackEntry[];
    /** Get the satisfaction trend over the last N entries. */
    getRecentTrend(windowSize?: number): 'improving' | 'declining' | 'stable';
    /** Serialize for encrypted storage. */
    serialize(): string;
    /** Deserialize from encrypted storage. */
    static deserialize(data: string): FeedbackStore;
    /** Clear all feedback (user data deletion). */
    clear(): void;
}
//# sourceMappingURL=feedback-store.d.ts.map