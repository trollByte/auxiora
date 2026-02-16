import { scoreAllDomains } from './context-detector.js';
// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
/** Clamp a value to [0, 1]. */
function clamp01(n) {
    return Math.min(1, Math.max(0, n));
}
/** Human-readable label for a domain (e.g. "code_engineering" → "Code Engineering"). */
function domainLabel(domain) {
    return domain
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
// ────────────────────────────────────────────────────────────────────────────
// ContextRecommender
// ────────────────────────────────────────────────────────────────────────────
export class ContextRecommender {
    /**
     * Analyze the detected context and determine if a recommendation should
     * be shown. Returns null if auto-detection seems right; otherwise returns
     * a recommendation with a human-readable reason and confidence score.
     *
     * Priority order:
     * 1. Correction-based (learned from user overrides)
     * 2. Low-confidence (ambiguous detection, close runner-up)
     * 3. Usage-pattern (general detected but history is concentrated)
     */
    shouldRecommend(detectedContext, correctionStore, usageHistory, userMessage) {
        // 1. Correction-based
        if (userMessage) {
            const correctionRec = this.correctionBased(detectedContext, correctionStore, userMessage);
            if (correctionRec)
                return correctionRec;
        }
        // 2. Low-confidence
        if (userMessage) {
            const lowConfRec = this.lowConfidence(detectedContext, userMessage);
            if (lowConfRec)
                return lowConfRec;
        }
        // 3. Usage-pattern
        const usageRec = this.usagePattern(detectedContext, usageHistory);
        if (usageRec)
            return usageRec;
        return null;
    }
    // ── Strategy 1: Correction-based ────────────────────────────────────────
    correctionBased(detectedContext, correctionStore, userMessage) {
        const suggested = correctionStore.suggestCorrection(userMessage, detectedContext.domain);
        if (suggested === null)
            return null;
        // Get the matching pattern's confidence from the store
        const patterns = correctionStore.getPatterns();
        const match = patterns.find(p => p.fromDomain === detectedContext.domain && p.toDomain === suggested);
        const confidence = match ? clamp01(match.confidence) : 0.7;
        return {
            suggestedDomain: suggested,
            reason: `You've previously switched from ${domainLabel(detectedContext.domain)} to ${domainLabel(suggested)} in similar messages`,
            confidence,
            source: 'correction_pattern',
        };
    }
    // ── Strategy 2: Low-confidence ──────────────────────────────────────────
    lowConfidence(detectedContext, userMessage) {
        const detectionConfidence = detectedContext.detectionConfidence ?? 1;
        if (detectionConfidence >= 0.5)
            return null;
        if (detectedContext.domain === 'general')
            return null;
        const scores = scoreAllDomains(userMessage);
        // Get the top 3 domains (excluding general) sorted by score descending
        const ranked = Object.entries(scores)
            .filter(([d]) => d !== 'general')
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3);
        if (ranked.length < 2)
            return null;
        const [first, second] = ranked;
        const gap = first[1] - second[1];
        // If the #2 domain is within 0.1 of #1, suggest it as an alternative
        if (gap > 0.1)
            return null;
        // Confidence is inversely proportional to the gap (closer = more ambiguous)
        const confidence = clamp01(1 - gap * 10);
        return {
            suggestedDomain: second[0],
            reason: `This could be ${domainLabel(first[0])} or ${domainLabel(second[0])} — want to specify?`,
            confidence,
            source: 'low_confidence',
        };
    }
    // ── Strategy 3: Usage-pattern ───────────────────────────────────────────
    usagePattern(detectedContext, usageHistory) {
        if (detectedContext.domain !== 'general')
            return null;
        const total = Object.values(usageHistory).reduce((sum, n) => sum + n, 0);
        if (total === 0)
            return null;
        // Find the most-used non-general domain
        let topDomain = null;
        let topCount = 0;
        for (const [domain, count] of Object.entries(usageHistory)) {
            if (domain === 'general')
                continue;
            if (count > topCount) {
                topCount = count;
                topDomain = domain;
            }
        }
        if (topDomain === null)
            return null;
        const percentage = topCount / total;
        if (percentage <= 0.6)
            return null;
        return {
            suggestedDomain: topDomain,
            reason: `You usually work in ${domainLabel(topDomain)} context — is that what you're doing here?`,
            confidence: clamp01(percentage),
            source: 'usage_pattern',
        };
    }
}
//# sourceMappingURL=recommender.js.map