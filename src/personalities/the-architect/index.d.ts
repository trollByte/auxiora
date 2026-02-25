import type { TraitMix, TaskContext, TraitSource, ContextDomain, PromptOutput } from '../schema.js';
import { CorrectionStore } from './correction-store.js';
import type { ArchitectPreferences } from './persistence.js';
import type { EncryptedStorage } from './persistence-adapter.js';
import type { WeightPreset } from './custom-weights.js';
import type { ChatMessage, ExportedConversation } from './conversation-export.js';
import type { Decision, DecisionQuery } from './decision-log.js';
import type { FeedbackRating, FeedbackInsight } from './feedback-store.js';
import type { UserModel } from './user-model-synthesizer.js';
export type { TraitMix, TraitValue, TaskContext, TraitSource, ContextDomain, EmotionalRegister, ContextSignal, PromptOutput, } from '../schema.js';
export { ARCHITECT_BASE_PROMPT } from './system-prompt.js';
export { CONTEXT_PROFILES } from './context-profiles.js';
export { EMOTIONAL_OVERRIDES, applyEmotionalOverride } from './emotional-overrides.js';
export { detectContext, scoreAllDomains } from './context-detector.js';
export { assemblePromptModifier, getActiveSources } from './prompt-assembler.js';
export { SOURCE_MAP } from './source-map.js';
export { TRAIT_TO_INSTRUCTION } from './trait-to-instruction.js';
export { CorrectionStore } from './correction-store.js';
export type { DetectionCorrection, CorrectionPattern } from './correction-store.js';
export { ContextRecommender } from './recommender.js';
export type { ContextRecommendation } from './recommender.js';
export { ConversationContext } from './conversation-context.js';
export type { ConversationSummary, ConversationState, DetectionRecord } from './conversation-context.js';
export { EmotionalTracker, estimateIntensity } from './emotional-tracker.js';
export type { EmotionalTrajectory, EffectiveEmotion } from './emotional-tracker.js';
export { CustomWeights, WEIGHT_PRESETS } from './custom-weights.js';
export type { WeightPreset } from './custom-weights.js';
export { ConversationExporter } from './conversation-export.js';
export type { ChatMessage, AssistantMetadata, ExportedMessage, ExportedConversation } from './conversation-export.js';
export { ArchitectPersistence } from './persistence.js';
export type { ArchitectPreferences } from './persistence.js';
export type { EncryptedStorage } from './persistence-adapter.js';
export { InMemoryEncryptedStorage, VaultStorageAdapter } from './persistence-adapter.js';
export type { VaultLike } from './persistence-adapter.js';
export { PreferenceHistory } from './preference-history.js';
export type { PreferenceEntry, PreferenceConflict } from './preference-history.js';
export { DecisionLog } from './decision-log.js';
export type { Decision, DecisionQuery, DecisionStatus } from './decision-log.js';
export { FeedbackStore } from './feedback-store.js';
export type { FeedbackRating, FeedbackEntry, FeedbackInsight } from './feedback-store.js';
export { UserModelSynthesizer } from './user-model-synthesizer.js';
export type { UserModel, DomainProfile, CommunicationStyle, SatisfactionProfile, CorrectionSummary } from './user-model-synthesizer.js';
type Message = {
    role: string;
    content: string;
};
/**
 * The Architect personality engine.
 *
 * Takes a user message and optional conversation history, detects the
 * operational context, selects and modulates traits, and assembles a
 * complete prompt with full provenance for every active trait.
 *
 * When constructed with an EncryptedStorage instance, persistence is enabled:
 * corrections, usage history, and preferences are stored encrypted at rest.
 * Call `initialize()` once after construction to load persisted state.
 */
export declare class TheArchitect {
    private contextOverride;
    private correctionStore;
    private recommender;
    private conversationContext;
    private emotionalTracker;
    private customWeights;
    private preferenceHistory;
    private decisionLog;
    private feedbackStore;
    private persistence?;
    private preferences?;
    private initialized;
    constructor(storage?: EncryptedStorage);
    /**
     * Load persisted state (corrections, preferences, usage history).
     * Call once after construction. Safe to call multiple times (idempotent).
     * No-op when persistence is not configured.
     */
    initialize(): Promise<void>;
    /**
     * Primary method: user message in, complete prompt out.
     *
     * Detects context, selects the domain profile, applies emotional
     * overrides, assembles a weight-scaled prompt modifier, and returns
     * the full prompt with active trait sources for transparency.
     *
     * Also records usage asynchronously (fire-and-forget) and checks
     * the recommender for context suggestions.
     */
    generatePrompt(userMessage: string, history?: Message[]): PromptOutput;
    /**
     * Detects the full task context from a user message and optional
     * conversation history. Exposed publicly for debugging and testing.
     */
    detectContext(userMessage: string, history?: Message[]): TaskContext;
    /**
     * Returns the fully modulated trait mix for a given context.
     * Applies the domain's base profile and then emotional overrides.
     */
    getTraitMix(context: TaskContext): TraitMix;
    /** Returns the static base personality prompt. */
    getBasePrompt(): string;
    /**
     * Forces a specific domain regardless of context detection.
     * Pass `null` to return to automatic detection.
     */
    setContextOverride(domain: ContextDomain | null): void;
    /**
     * Returns all 17 context domains with human-readable labels
     * and one-line descriptions for UI rendering.
     */
    listContextDomains(): Array<{
        domain: ContextDomain;
        label: string;
        description: string;
    }>;
    /**
     * Returns the active trait sources for the given mix, or for
     * the general profile if no mix is provided.
     */
    getActiveSources(mix?: TraitMix): TraitSource[];
    /** Reset conversation context and emotional tracker for a new conversation. */
    resetConversation(): void;
    /** Get the conversation context summary. */
    getConversationSummary(): import("./conversation-context.js").ConversationSummary;
    /** Get the current emotional trajectory. */
    getEmotionalState(): import("./emotional-tracker.js").EffectiveEmotion;
    /** Set a custom trait weight offset. Records in preference history and persists. */
    setTraitOverride(trait: keyof TraitMix, offset: number, source?: 'user' | 'preset' | 'feedback', reason?: string): Promise<void>;
    /** Remove a custom trait weight override. */
    removeTraitOverride(trait: keyof TraitMix): Promise<void>;
    /** Load a preset weight configuration. Records each override in preference history. */
    loadPreset(presetName: string): Promise<void>;
    /** Returns available weight presets. */
    listPresets(): Record<string, WeightPreset>;
    /** Returns current custom weight overrides. */
    getActiveOverrides(): Partial<Record<keyof TraitMix, number>>;
    /** Persist custom weights and preference history to encrypted storage. */
    private persistCustomWeights;
    /** Get conflicts in preference history. */
    getPreferenceConflicts(): import("./preference-history.js").PreferenceConflict[];
    /** Get preference change history for a trait. */
    getPreferenceHistory(trait: keyof TraitMix): import("./preference-history.js").PreferenceEntry[];
    /** Record a decision for cross-session tracking. */
    recordDecision(decision: Omit<Decision, 'id' | 'timestamp' | 'tags'>): Promise<Decision>;
    /** Update a decision's status or outcome. */
    updateDecision(id: string, updates: Partial<Pick<Decision, 'status' | 'outcome' | 'followUpDate'>>): Promise<void>;
    /** Query decisions with filters. */
    queryDecisions(q: DecisionQuery): Decision[];
    /** Get decisions due for follow-up. */
    getDueFollowUps(): Decision[];
    /** Persist decision log to encrypted storage. */
    private persistDecisionLog;
    /** Record feedback on a response. */
    recordFeedback(feedback: {
        domain: ContextDomain;
        rating: FeedbackRating;
        traitSnapshot?: Partial<Record<keyof TraitMix, number>>;
        note?: string;
    }): Promise<void>;
    /** Get actionable feedback insights. */
    getFeedbackInsights(): FeedbackInsight;
    /** Get satisfaction trend over recent feedback. */
    getFeedbackTrend(windowSize?: number): 'improving' | 'declining' | 'stable';
    /** Persist feedback store to encrypted storage. */
    private persistFeedbackStore;
    /** Synthesize a complete user model from all data stores. */
    getUserModel(): UserModel;
    /**
     * Apply trajectory-based multipliers on top of standard emotional overrides.
     * Caps all values at 1.0.
     */
    private applyTrajectoryMultipliers;
    /**
     * Records a user correction so the engine can learn from misclassifications.
     * Also persists the updated corrections to encrypted storage when available.
     */
    recordCorrection(userMessage: string, detectedDomain: ContextDomain, correctedDomain: ContextDomain): Promise<void>;
    /** Load corrections from serialized data (e.g. from encrypted vault). */
    loadCorrections(serializedData: string): void;
    /** Export corrections as a serialized string for encrypted storage. */
    exportCorrections(): string;
    /** Get correction statistics for debugging and transparency. */
    getCorrectionStats(): ReturnType<CorrectionStore['getStats']>;
    /** Returns the current preferences. Falls back to in-memory defaults. */
    getPreferences(): Promise<ArchitectPreferences>;
    /** Update a single preference and persist. */
    updatePreference<K extends keyof ArchitectPreferences>(key: K, value: ArchitectPreferences[K]): Promise<void>;
    /** Clear all persisted data: corrections, preferences, usage history, and self-awareness stores. */
    clearAllData(): Promise<void>;
    /**
     * Export a conversation with full personality engine metadata.
     * Returns an ExportedConversation that can be serialized to JSON, Markdown, or CSV.
     */
    exportConversation(messages: ChatMessage[], conversationId: string): ExportedConversation;
    /**
     * Export a conversation in the specified format.
     * @param format - 'json' | 'markdown' | 'csv'
     */
    exportConversationAs(messages: ChatMessage[], conversationId: string, format: 'json' | 'markdown' | 'csv'): string;
    /** Export all stored data as JSON string (data portability). */
    exportData(): Promise<string>;
}
/** Creates a new Architect instance, optionally with encrypted persistence. */
export declare function createArchitect(storage?: EncryptedStorage): TheArchitect;
//# sourceMappingURL=index.d.ts.map