// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
/** Exponential decay factor per entry (most recent = 1, next = 0.8, etc.). */
const RECENCY_DECAY = 0.8;
/** Entries older than this (ms) decay to 10 % weight. */
const AGE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Minimum weight for entries older than AGE_THRESHOLD_MS. */
const OLD_ENTRY_WEIGHT = 0.1;
// ────────────────────────────────────────────────────────────────────────────
// PreferenceHistory
// ────────────────────────────────────────────────────────────────────────────
export class PreferenceHistory {
    entries = [];
    maxEntries = 200;
    // ── Record ──────────────────────────────────────────────────────────────
    /** Record a preference change (called by CustomWeights wrapper). */
    record(entry) {
        this.entries.push({ ...entry, timestamp: Date.now() });
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(this.entries.length - this.maxEntries);
        }
    }
    // ── Effective offset ────────────────────────────────────────────────────
    /**
     * Get the effective offset for a trait, using recency-weighted resolution.
     *
     * 1. If a context-scoped entry exists for the current domain, use it
     *    (strategy: 'context').
     * 2. Otherwise, use exponential recency weighting: recent entries count
     *    more (decay factor 0.8 per entry) (strategy: 'recency').
     * 3. Entries older than 30 days decay to 10 % weight.
     */
    getEffectiveOffset(trait, currentDomain) {
        const traitEntries = this.entries.filter(e => e.trait === trait);
        if (traitEntries.length === 0)
            return 0;
        // Strategy 1: context-scoped match
        if (currentDomain) {
            const contextEntries = traitEntries.filter(e => e.context === currentDomain);
            if (contextEntries.length > 0) {
                // Use the most recent context-scoped entry
                return contextEntries[contextEntries.length - 1].offset;
            }
        }
        // Strategy 2: recency-weighted average
        const now = Date.now();
        const sorted = [...traitEntries].sort((a, b) => b.timestamp - a.timestamp); // most recent first
        let weightedSum = 0;
        let totalWeight = 0;
        for (let i = 0; i < sorted.length; i++) {
            let weight = Math.pow(RECENCY_DECAY, i);
            // Age decay: entries older than 30 days get capped at 10 %
            const ageMs = now - sorted[i].timestamp;
            if (ageMs > AGE_THRESHOLD_MS) {
                weight *= OLD_ENTRY_WEIGHT;
            }
            weightedSum += sorted[i].offset * weight;
            totalWeight += weight;
        }
        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }
    // ── Conflict detection ──────────────────────────────────────────────────
    /**
     * Detect conflicts: entries for the same trait that pull in opposite
     * directions. Returns conflicts with the resolved value and strategy used.
     */
    detectConflicts() {
        const byTrait = new Map();
        for (const entry of this.entries) {
            const existing = byTrait.get(entry.trait);
            if (existing) {
                existing.push(entry);
            }
            else {
                byTrait.set(entry.trait, [entry]);
            }
        }
        const conflicts = [];
        for (const [trait, entries] of byTrait) {
            if (entries.length < 2)
                continue;
            const hasPositive = entries.some(e => e.offset > 0);
            const hasNegative = entries.some(e => e.offset < 0);
            if (hasPositive && hasNegative) {
                const resolution = this.getEffectiveOffset(trait);
                conflicts.push({
                    trait,
                    entries: [...entries],
                    resolution,
                    strategy: 'recency',
                });
            }
        }
        return conflicts;
    }
    // ── Trait history ───────────────────────────────────────────────────────
    /** Get history for a specific trait, most recent first. */
    getTraitHistory(trait) {
        return this.entries
            .filter(e => e.trait === trait)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    // ── Serialization ─────────────────────────────────────────────────────
    /** Serialize for encrypted storage. */
    serialize() {
        return JSON.stringify({ entries: this.entries });
    }
    /** Deserialize from encrypted storage. Validates entry shapes defensively. */
    static deserialize(data) {
        const history = new PreferenceHistory();
        try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed.entries)) {
                history.entries = parsed.entries.filter((e) => typeof e === 'object' && e !== null &&
                    typeof e.trait === 'string' &&
                    typeof e.offset === 'number' &&
                    typeof e.timestamp === 'number');
            }
        }
        catch {
            // Corrupt data — return empty history
        }
        return history;
    }
    // ── Lifecycle ──────────────────────────────────────────────────────────
    /** Clear all preference history (user data deletion). */
    clear() {
        this.entries = [];
    }
}
//# sourceMappingURL=preference-history.js.map