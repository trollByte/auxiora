import type { TraitMix, ContextDomain } from '../schema.js';
export interface PreferenceEntry {
    trait: keyof TraitMix;
    offset: number;
    timestamp: number;
    context: ContextDomain | null;
    source: 'user' | 'preset' | 'feedback';
    reason?: string;
}
export interface PreferenceConflict {
    trait: keyof TraitMix;
    entries: PreferenceEntry[];
    resolution: number;
    strategy: 'recency' | 'context';
}
export declare class PreferenceHistory {
    private entries;
    private maxEntries;
    /** Record a preference change (called by CustomWeights wrapper). */
    record(entry: Omit<PreferenceEntry, 'timestamp'>): void;
    /**
     * Get the effective offset for a trait, using recency-weighted resolution.
     *
     * 1. If a context-scoped entry exists for the current domain, use it
     *    (strategy: 'context').
     * 2. Otherwise, use exponential recency weighting: recent entries count
     *    more (decay factor 0.8 per entry) (strategy: 'recency').
     * 3. Entries older than 30 days decay to 10 % weight.
     */
    getEffectiveOffset(trait: keyof TraitMix, currentDomain?: ContextDomain): number;
    /**
     * Detect conflicts: entries for the same trait that pull in opposite
     * directions. Returns conflicts with the resolved value and strategy used.
     */
    detectConflicts(): PreferenceConflict[];
    /** Get history for a specific trait, most recent first. */
    getTraitHistory(trait: keyof TraitMix): PreferenceEntry[];
    /** Serialize for encrypted storage. */
    serialize(): string;
    /** Deserialize from encrypted storage. Validates entry shapes defensively. */
    static deserialize(data: string): PreferenceHistory;
    /** Clear all preference history (user data deletion). */
    clear(): void;
}
//# sourceMappingURL=preference-history.d.ts.map