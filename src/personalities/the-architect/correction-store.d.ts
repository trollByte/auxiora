import type { ContextDomain, EmotionalRegister } from '../schema.js';
export interface DetectionCorrection {
    id: string;
    timestamp: number;
    userMessage: string;
    messageLength: number;
    detectedDomain: ContextDomain;
    correctedDomain: ContextDomain;
    detectedEmotion: EmotionalRegister;
    keywords: string[];
}
export interface CorrectionPattern {
    keyword: string;
    fromDomain: ContextDomain;
    toDomain: ContextDomain;
    occurrences: number;
    confidence: number;
}
export declare class CorrectionStore {
    private corrections;
    private patterns;
    /** Record a new correction. Generates id/timestamp and extracts keywords. */
    addCorrection(correction: Omit<DetectionCorrection, 'id' | 'timestamp' | 'keywords'>): void;
    /** Get all stored corrections. */
    getCorrections(): DetectionCorrection[];
    /** Get correction patterns sorted by confidence descending. */
    getPatterns(): CorrectionPattern[];
    /**
     * Given a message and detected domain, check if corrections suggest a
     * different domain. Returns the corrected domain if pattern confidence
     * > 0.6 and occurrences >= 3, else null.
     */
    suggestCorrection(message: string, detectedDomain: ContextDomain): ContextDomain | null;
    /** Recompute patterns from all stored corrections. */
    private recomputePatterns;
    /** Serialize for encrypted storage. */
    serialize(): string;
    /** Deserialize from encrypted storage. */
    static deserialize(data: string): CorrectionStore;
    /** Clear all corrections (user data deletion). */
    clear(): void;
    /** Stats for debugging. */
    getStats(): {
        totalCorrections: number;
        topMisclassifications: Array<{
            from: ContextDomain;
            to: ContextDomain;
            count: number;
        }>;
        correctionRate: Record<string, number>;
    };
}
//# sourceMappingURL=correction-store.d.ts.map