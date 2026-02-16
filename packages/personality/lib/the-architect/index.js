import { ARCHITECT_BASE_PROMPT } from './system-prompt.js';
import { CONTEXT_PROFILES } from './context-profiles.js';
import { applyEmotionalOverride } from './emotional-overrides.js';
import { detectContext } from './context-detector.js';
import { assemblePromptModifier, getActiveSources } from './prompt-assembler.js';
import { CorrectionStore } from './correction-store.js';
import { ArchitectPersistence } from './persistence.js';
import { ContextRecommender } from './recommender.js';
// Re-export building blocks for advanced consumers
export { ARCHITECT_BASE_PROMPT } from './system-prompt.js';
export { CONTEXT_PROFILES } from './context-profiles.js';
export { EMOTIONAL_OVERRIDES, applyEmotionalOverride } from './emotional-overrides.js';
export { detectContext, scoreAllDomains } from './context-detector.js';
export { assemblePromptModifier, getActiveSources } from './prompt-assembler.js';
export { SOURCE_MAP } from './source-map.js';
export { TRAIT_TO_INSTRUCTION } from './trait-to-instruction.js';
export { CorrectionStore } from './correction-store.js';
export { ContextRecommender } from './recommender.js';
export { ArchitectPersistence } from './persistence.js';
export { InMemoryEncryptedStorage, VaultStorageAdapter } from './persistence-adapter.js';
// ────────────────────────────────────────────────────────────────────────────
// Domain metadata
// ────────────────────────────────────────────────────────────────────────────
const DOMAIN_METADATA = [
    { domain: 'security_review', label: 'Security Review', description: 'Adversarial analysis, threat modeling, vulnerability assessment' },
    { domain: 'code_engineering', label: 'Code Engineering', description: 'Writing, refactoring, testing, and deploying code' },
    { domain: 'architecture_design', label: 'Architecture Design', description: 'System design, trade-off analysis, pattern selection' },
    { domain: 'debugging', label: 'Debugging', description: 'Root cause analysis, mental execution tracing, fix verification' },
    { domain: 'team_leadership', label: 'Team Leadership', description: 'Culture building, standard setting, team performance' },
    { domain: 'one_on_one', label: 'One-on-One', description: 'Personal coaching, career development, empathetic listening' },
    { domain: 'sales_pitch', label: 'Sales Pitch', description: 'Value communication, transformation framing, objection handling' },
    { domain: 'negotiation', label: 'Negotiation', description: 'Tactical empathy, position analysis, leverage assessment' },
    { domain: 'marketing_content', label: 'Marketing Content', description: 'Positioning, messaging, audience-first content creation' },
    { domain: 'strategic_planning', label: 'Strategic Planning', description: 'Roadmap design, resource allocation, initiative prioritization' },
    { domain: 'crisis_management', label: 'Crisis Management', description: 'Incident response, stakeholder communication, rapid stabilization' },
    { domain: 'creative_work', label: 'Creative Work', description: 'Brainstorming, ideation, constraint-driven innovation' },
    { domain: 'writing_content', label: 'Writing Content', description: 'Drafting, editing, tone calibration, audience-aware prose' },
    { domain: 'decision_making', label: 'Decision Making', description: 'Option analysis, probability assessment, regret minimization' },
    { domain: 'personal_development', label: 'Personal Development', description: 'Career pathing, skill development, growth coaching' },
    { domain: 'learning_research', label: 'Learning & Research', description: 'Concept explanation, deep dives, teaching from first principles' },
    { domain: 'general', label: 'General', description: 'Balanced baseline for unclassified or mixed-domain conversations' },
];
// ────────────────────────────────────────────────────────────────────────────
// The Architect
// ────────────────────────────────────────────────────────────────────────────
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
export class TheArchitect {
    contextOverride = null;
    correctionStore;
    recommender;
    persistence;
    preferences;
    initialized = false;
    constructor(storage) {
        this.correctionStore = new CorrectionStore();
        this.recommender = new ContextRecommender();
        if (storage) {
            this.persistence = new ArchitectPersistence(storage);
        }
    }
    /**
     * Load persisted state (corrections, preferences, usage history).
     * Call once after construction. Safe to call multiple times (idempotent).
     * No-op when persistence is not configured.
     */
    async initialize() {
        if (this.initialized || !this.persistence)
            return;
        const prefs = await this.persistence.load();
        this.correctionStore = CorrectionStore.deserialize(prefs.corrections);
        this.preferences = prefs;
        if (prefs.defaultContext) {
            this.contextOverride = prefs.defaultContext;
        }
        this.initialized = true;
    }
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
    generatePrompt(userMessage, history) {
        const rawContext = this.detectContext(userMessage, history);
        const context = this.contextOverride
            ? { ...rawContext, domain: this.contextOverride, corrected: undefined, originalDomain: undefined }
            : rawContext;
        const baseMix = CONTEXT_PROFILES[context.domain];
        const adjustedMix = applyEmotionalOverride(baseMix, context.emotionalRegister);
        const modifier = assemblePromptModifier(adjustedMix, context);
        const sources = getActiveSources(adjustedMix);
        // Fire-and-forget persistence of usage
        if (this.persistence) {
            this.persistence.recordUsage(context.domain).catch(() => { });
        }
        // Check for recommendations (only when no manual override is active)
        let recommendation;
        if (!this.contextOverride) {
            const usageHistory = this.preferences?.contextUsageHistory ?? {};
            recommendation = this.recommender.shouldRecommend(context, this.correctionStore, usageHistory, userMessage) ?? undefined;
        }
        return {
            basePrompt: ARCHITECT_BASE_PROMPT,
            contextModifier: modifier,
            fullPrompt: ARCHITECT_BASE_PROMPT + '\n\n' + modifier,
            activeTraits: sources,
            detectedContext: context,
            recommendation,
        };
    }
    /**
     * Detects the full task context from a user message and optional
     * conversation history. Exposed publicly for debugging and testing.
     */
    detectContext(userMessage, history) {
        return detectContext(userMessage, history, this.correctionStore);
    }
    /**
     * Returns the fully modulated trait mix for a given context.
     * Applies the domain's base profile and then emotional overrides.
     */
    getTraitMix(context) {
        const base = CONTEXT_PROFILES[context.domain];
        return applyEmotionalOverride(base, context.emotionalRegister);
    }
    /** Returns the static base personality prompt. */
    getBasePrompt() {
        return ARCHITECT_BASE_PROMPT;
    }
    /**
     * Forces a specific domain regardless of context detection.
     * Pass `null` to return to automatic detection.
     */
    setContextOverride(domain) {
        this.contextOverride = domain;
    }
    /**
     * Returns all 17 context domains with human-readable labels
     * and one-line descriptions for UI rendering.
     */
    listContextDomains() {
        return DOMAIN_METADATA;
    }
    /**
     * Returns the active trait sources for the given mix, or for
     * the general profile if no mix is provided.
     */
    getActiveSources(mix) {
        const m = mix ?? CONTEXT_PROFILES['general'];
        return getActiveSources(m);
    }
    // ── Correction learning ──────────────────────────────────────────────
    /**
     * Records a user correction so the engine can learn from misclassifications.
     * Also persists the updated corrections to encrypted storage when available.
     */
    async recordCorrection(userMessage, detectedDomain, correctedDomain) {
        const emotionalRegister = detectContext(userMessage).emotionalRegister;
        this.correctionStore.addCorrection({
            userMessage,
            messageLength: userMessage.length,
            detectedDomain,
            correctedDomain,
            detectedEmotion: emotionalRegister,
        });
        if (this.persistence) {
            await this.persistence.saveCorrections(this.correctionStore);
        }
    }
    /** Load corrections from serialized data (e.g. from encrypted vault). */
    loadCorrections(serializedData) {
        this.correctionStore = CorrectionStore.deserialize(serializedData);
    }
    /** Export corrections as a serialized string for encrypted storage. */
    exportCorrections() {
        return this.correctionStore.serialize();
    }
    /** Get correction statistics for debugging and transparency. */
    getCorrectionStats() {
        return this.correctionStore.getStats();
    }
    // ── Preferences ───────────────────────────────────────────────────────
    /** Returns the current preferences. Falls back to in-memory defaults. */
    async getPreferences() {
        if (this.persistence) {
            const prefs = await this.persistence.load();
            this.preferences = prefs;
            return prefs;
        }
        // Return a default snapshot when no persistence
        return {
            corrections: this.correctionStore.serialize(),
            showContextIndicator: true,
            showSourcesButton: true,
            autoDetectContext: true,
            defaultContext: null,
            contextUsageHistory: {},
            totalInteractions: 0,
            firstUsed: 0,
            lastUsed: 0,
            version: 1,
        };
    }
    /** Update a single preference and persist. */
    async updatePreference(key, value) {
        if (!this.persistence)
            return;
        const prefs = await this.persistence.load();
        prefs[key] = value;
        await this.persistence.save(prefs);
        this.preferences = prefs;
        // Apply side effects
        if (key === 'defaultContext') {
            this.contextOverride = value;
        }
    }
    /** Clear all persisted data: corrections, preferences, usage history. */
    async clearAllData() {
        this.correctionStore = new CorrectionStore();
        this.contextOverride = null;
        this.preferences = undefined;
        if (this.persistence) {
            await this.persistence.clearAll();
        }
    }
    /** Export all stored data as JSON string (data portability). */
    async exportData() {
        if (this.persistence) {
            return this.persistence.exportAll();
        }
        return JSON.stringify(await this.getPreferences(), null, 2);
    }
}
// ────────────────────────────────────────────────────────────────────────────
// Convenience factory
// ────────────────────────────────────────────────────────────────────────────
/** Creates a new Architect instance, optionally with encrypted persistence. */
export function createArchitect(storage) {
    return new TheArchitect(storage);
}
//# sourceMappingURL=index.js.map