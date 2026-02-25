import type { TaskContext, ContextDomain } from '../schema.js';
import type { CorrectionStore } from './correction-store.js';
export interface ContextRecommendation {
    suggestedDomain: ContextDomain;
    reason: string;
    confidence: number;
    source: 'correction_pattern' | 'low_confidence' | 'usage_pattern';
}
export declare class ContextRecommender {
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
    shouldRecommend(detectedContext: TaskContext, correctionStore: CorrectionStore, usageHistory: Record<ContextDomain, number>, userMessage?: string): ContextRecommendation | null;
    private correctionBased;
    private lowConfidence;
    private usagePattern;
}
//# sourceMappingURL=recommender.d.ts.map