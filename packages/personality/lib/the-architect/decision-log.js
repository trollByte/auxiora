// ────────────────────────────────────────────────────────────────────────────
// Stopwords — common English words filtered from tag extraction
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
/** Extract meaningful keyword tags from text. */
function extractTags(text) {
    const words = text
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length >= 4 && !STOPWORDS.has(w));
    // Deduplicate while preserving order
    return [...new Set(words)];
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
// DecisionLog
// ────────────────────────────────────────────────────────────────────────────
export class DecisionLog {
    decisions = [];
    maxDecisions = 500;
    /** Record a new decision. Auto-generates id, timestamp, and tags. */
    addDecision(decision) {
        const entry = {
            ...decision,
            id: generateId(),
            timestamp: Date.now(),
            tags: extractTags(`${decision.summary} ${decision.context}`),
        };
        this.decisions.push(entry);
        // Enforce capacity — drop oldest when over limit
        if (this.decisions.length > this.maxDecisions) {
            this.decisions = this.decisions.slice(this.decisions.length - this.maxDecisions);
        }
        return entry;
    }
    /** Update an existing decision's status or outcome. */
    updateDecision(id, updates) {
        const decision = this.decisions.find(d => d.id === id);
        if (!decision) {
            throw new Error(`Decision not found: ${id}`);
        }
        if (updates.status !== undefined)
            decision.status = updates.status;
        if (updates.outcome !== undefined)
            decision.outcome = updates.outcome;
        if (updates.followUpDate !== undefined)
            decision.followUpDate = updates.followUpDate;
    }
    /** Query decisions with filters. All filters are AND-combined. */
    query(q) {
        let results = this.decisions.filter(d => {
            if (q.domain !== undefined && d.domain !== q.domain)
                return false;
            if (q.status !== undefined && d.status !== q.status)
                return false;
            if (q.since !== undefined && d.timestamp < q.since)
                return false;
            if (q.search !== undefined) {
                const needle = q.search.toLowerCase();
                const haystack = `${d.summary} ${d.context} ${d.tags.join(' ')}`.toLowerCase();
                if (!haystack.includes(needle))
                    return false;
            }
            return true;
        });
        // Sort by timestamp descending (most recent first)
        results.sort((a, b) => b.timestamp - a.timestamp);
        if (q.limit !== undefined && q.limit > 0) {
            results = results.slice(0, q.limit);
        }
        return results;
    }
    /** Get decisions due for follow-up (followUpDate <= now). */
    getDueFollowUps() {
        const now = Date.now();
        return this.decisions
            .filter(d => d.followUpDate !== undefined && d.followUpDate <= now)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    /** Get recent decisions for a domain (for context in new conversations). */
    getRecentForDomain(domain, limit = 10) {
        return this.decisions
            .filter(d => d.domain === domain)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
    /** Serialize for encrypted storage. */
    serialize() {
        return JSON.stringify({ decisions: this.decisions });
    }
    /** Deserialize from encrypted storage. */
    static deserialize(data) {
        const log = new DecisionLog();
        try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed.decisions)) {
                log.decisions = parsed.decisions;
            }
        }
        catch {
            // Corrupt data — return empty log
        }
        return log;
    }
    /** Clear all decisions (user data deletion). */
    clear() {
        this.decisions = [];
    }
}
//# sourceMappingURL=decision-log.js.map