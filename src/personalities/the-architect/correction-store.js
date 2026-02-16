// ────────────────────────────────────────────────────────────────────────────
// Stopwords — common English words that carry no domain signal
// ────────────────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
    'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'them',
    'their', 'what', 'when', 'where', 'which', 'while', 'will', 'would',
    'could', 'should', 'about', 'after', 'again', 'also', 'because', 'before',
    'between', 'both', 'came', 'come', 'does', 'done', 'each', 'else', 'even',
    'every', 'good', 'great', 'here', 'into', 'just', 'know', 'like', 'long',
    'look', 'make', 'many', 'more', 'most', 'much', 'must', 'need', 'only',
    'other', 'over', 'same', 'some', 'such', 'take', 'tell', 'than', 'then',
    'there', 'these', 'thing', 'think', 'those', 'through', 'time', 'under',
    'upon', 'very', 'want', 'well', 'went', 'your', 'able', 'back', 'being',
    'call', 'case', 'down', 'find', 'first', 'give', 'going', 'hand', 'help',
    'high', 'keep', 'last', 'left', 'life', 'line', 'made', 'might', 'move',
    'name', 'next', 'open', 'part', 'place', 'point', 'right', 'show', 'side',
    'since', 'small', 'start', 'still', 'turn', 'used', 'using', 'work',
    'world', 'year', 'away', 'best', 'came', 'dear', 'didn', 'don', 'end',
    'enough', 'ever', 'far', 'few', 'get', 'got', 'had', 'has', 'her', 'him',
    'his', 'how', 'its', 'let', 'may', 'new', 'now', 'off', 'old', 'one',
    'our', 'out', 'own', 'put', 'ran', 'run', 'say', 'she', 'too', 'try',
    'two', 'use', 'way', 'who', 'why', 'big', 'can', 'day', 'did', 'for',
    'got', 'him', 'not', 'the', 'and', 'are', 'but',
]);
// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
/** Extract meaningful keywords from a message. */
function extractKeywords(message) {
    return message
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 3 && !STOPWORDS.has(w));
}
/** Generate a v4-style UUID without crypto dependency. */
function generateId() {
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
// ────────────────────────────────────────────────────────────────────────────
// CorrectionStore
// ────────────────────────────────────────────────────────────────────────────
export class CorrectionStore {
    corrections = [];
    patterns = [];
    /** Record a new correction. Generates id/timestamp and extracts keywords. */
    addCorrection(correction) {
        this.corrections.push({
            ...correction,
            id: generateId(),
            timestamp: Date.now(),
            keywords: extractKeywords(correction.userMessage),
        });
        this.recomputePatterns();
    }
    /** Get all stored corrections. */
    getCorrections() {
        return this.corrections;
    }
    /** Get correction patterns sorted by confidence descending. */
    getPatterns() {
        return [...this.patterns].sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Given a message and detected domain, check if corrections suggest a
     * different domain. Returns the corrected domain if pattern confidence
     * > 0.6 and occurrences >= 3, else null.
     */
    suggestCorrection(message, detectedDomain) {
        const messageKeywords = extractKeywords(message);
        if (messageKeywords.length === 0)
            return null;
        // Find matching patterns: keyword present in message, fromDomain matches
        const matches = this.patterns.filter(p => p.fromDomain === detectedDomain &&
            p.confidence > 0.6 &&
            p.occurrences >= 3 &&
            messageKeywords.includes(p.keyword));
        if (matches.length === 0)
            return null;
        // Pick the match with highest confidence; break ties with occurrences
        matches.sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);
        return matches[0].toDomain;
    }
    /** Recompute patterns from all stored corrections. */
    recomputePatterns() {
        // Count how many corrections contain each keyword (for confidence denominator)
        const keywordTotals = new Map();
        for (const c of this.corrections) {
            const seen = new Set(c.keywords);
            for (const kw of seen) {
                keywordTotals.set(kw, (keywordTotals.get(kw) ?? 0) + 1);
            }
        }
        // Group by (keyword, fromDomain, toDomain) and count occurrences
        const groups = new Map();
        for (const c of this.corrections) {
            const seen = new Set(c.keywords);
            for (const kw of seen) {
                const key = `${kw}|${c.detectedDomain}|${c.correctedDomain}`;
                const existing = groups.get(key);
                if (existing) {
                    existing.occurrences++;
                }
                else {
                    groups.set(key, {
                        keyword: kw,
                        fromDomain: c.detectedDomain,
                        toDomain: c.correctedDomain,
                        occurrences: 1,
                    });
                }
            }
        }
        this.patterns = [];
        for (const g of groups.values()) {
            const total = keywordTotals.get(g.keyword) ?? 1;
            this.patterns.push({
                ...g,
                confidence: g.occurrences / total,
            });
        }
    }
    /** Serialize for encrypted storage. */
    serialize() {
        return JSON.stringify({
            corrections: this.corrections,
            patterns: this.patterns,
        });
    }
    /** Deserialize from encrypted storage. */
    static deserialize(data) {
        const store = new CorrectionStore();
        const parsed = JSON.parse(data);
        store.corrections = parsed.corrections;
        store.patterns = parsed.patterns;
        return store;
    }
    /** Clear all corrections (user data deletion). */
    clear() {
        this.corrections = [];
        this.patterns = [];
    }
    /** Stats for debugging. */
    getStats() {
        const pairCounts = new Map();
        const domainDetected = new Map();
        const domainCorrected = new Map();
        for (const c of this.corrections) {
            // Count pair
            const key = `${c.detectedDomain}→${c.correctedDomain}`;
            const existing = pairCounts.get(key);
            if (existing) {
                existing.count++;
            }
            else {
                pairCounts.set(key, { from: c.detectedDomain, to: c.correctedDomain, count: 1 });
            }
            // Count detected and corrected per domain
            domainDetected.set(c.detectedDomain, (domainDetected.get(c.detectedDomain) ?? 0) + 1);
            domainCorrected.set(c.detectedDomain, (domainCorrected.get(c.detectedDomain) ?? 0) + 1);
        }
        const topMisclassifications = [...pairCounts.values()]
            .sort((a, b) => b.count - a.count);
        // correctionRate = corrections for domain / total times that domain was detected
        const correctionRate = {};
        for (const [domain, correctedCount] of domainCorrected) {
            const detectedCount = domainDetected.get(domain) ?? 1;
            correctionRate[domain] = correctedCount / detectedCount;
        }
        return {
            totalCorrections: this.corrections.length,
            topMisclassifications,
            correctionRate,
        };
    }
}
//# sourceMappingURL=correction-store.js.map