import type { ContextDomain } from '../schema.js';
import type { PreferenceHistory, PreferenceConflict } from './preference-history.js';
import type { DecisionLog, Decision } from './decision-log.js';
import type { FeedbackStore } from './feedback-store.js';
import type { CorrectionStore } from './correction-store.js';
import type { ArchitectPreferences } from './persistence.js';
export interface DomainProfile {
    domain: ContextDomain;
    count: number;
    share: number;
    satisfactionRate: number | null;
    feedbackCount: number;
}
export interface CommunicationStyle {
    verbosityPreference: number;
    warmthPreference: number;
    humorPreference: number;
    verbosityLabel: 'concise' | 'balanced' | 'detailed';
    toneLabel: 'analytical' | 'balanced' | 'warm';
}
export interface SatisfactionProfile {
    overallTrend: 'improving' | 'declining' | 'stable';
    strongDomains: ContextDomain[];
    weakDomains: ContextDomain[];
    totalFeedback: number;
}
export interface CorrectionSummary {
    totalCorrections: number;
    topPatterns: Array<{
        from: ContextDomain;
        to: ContextDomain;
        count: number;
    }>;
}
export interface UserModel {
    synthesizedAt: number;
    topDomains: DomainProfile[];
    communicationStyle: CommunicationStyle;
    satisfaction: SatisfactionProfile;
    activeDecisions: Decision[];
    dueFollowUps: Decision[];
    preferenceConflicts: PreferenceConflict[];
    correctionSummary: CorrectionSummary;
    totalInteractions: number;
    firstUsed: number;
    lastUsed: number;
    narrative: string;
}
interface SynthesizerDeps {
    preferenceHistory: PreferenceHistory;
    decisionLog: DecisionLog;
    feedbackStore: FeedbackStore;
    correctionStore: CorrectionStore;
    preferences?: ArchitectPreferences;
}
/**
 * Read-only aggregator that synthesizes a coherent user model from
 * all personality engine data stores. Does not persist its own state.
 *
 * Instantiate fresh and call `synthesize()` to produce a `UserModel`.
 */
export declare class UserModelSynthesizer {
    private readonly preferenceHistory;
    private readonly decisionLog;
    private readonly feedbackStore;
    private readonly correctionStore;
    private readonly preferences?;
    constructor(deps: SynthesizerDeps);
    /** Synthesize a complete user model. Pure computation, no side effects. */
    synthesize(): UserModel;
    /**
     * Build domain profiles from contextUsageHistory.
     * Returns top 5 non-zero domains sorted by count descending.
     */
    private buildDomainProfiles;
    /**
     * Build communication style from preference history effective offsets.
     * Factors in feedback-suggested adjustments.
     */
    private buildCommunicationStyle;
    /**
     * Build satisfaction profile from feedback store insights.
     * Strong domains: >80% helpful with >=3 feedback entries.
     */
    private buildSatisfactionProfile;
    /**
     * Get active and revisit decisions.
     */
    private getActiveDecisions;
    /**
     * Build correction summary from correction store stats.
     */
    private buildCorrectionSummary;
    /**
     * Generate a deterministic 1-3 sentence narrative describing the user.
     */
    private generateNarrative;
}
export {};
//# sourceMappingURL=user-model-synthesizer.d.ts.map