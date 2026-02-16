import { ARCHITECT_BASE_PROMPT } from './system-prompt.js';
import { CONTEXT_PROFILES } from './context-profiles.js';
import { applyEmotionalOverride } from './emotional-overrides.js';
import { detectContext } from './context-detector.js';
import { assemblePromptModifier, getActiveSources } from './prompt-assembler.js';
// Re-export building blocks for advanced consumers
export { ARCHITECT_BASE_PROMPT } from './system-prompt.js';
export { CONTEXT_PROFILES } from './context-profiles.js';
export { EMOTIONAL_OVERRIDES, applyEmotionalOverride } from './emotional-overrides.js';
export { detectContext, scoreAllDomains } from './context-detector.js';
export { assemblePromptModifier, getActiveSources } from './prompt-assembler.js';
export { SOURCE_MAP } from './source-map.js';
export { TRAIT_TO_INSTRUCTION } from './trait-to-instruction.js';
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
 */
export class TheArchitect {
    contextOverride = null;
    /**
     * Primary method: user message in, complete prompt out.
     *
     * Detects context, selects the domain profile, applies emotional
     * overrides, assembles a weight-scaled prompt modifier, and returns
     * the full prompt with active trait sources for transparency.
     */
    generatePrompt(userMessage, history) {
        const rawContext = this.detectContext(userMessage, history);
        const context = this.contextOverride
            ? { ...rawContext, domain: this.contextOverride }
            : rawContext;
        const baseMix = CONTEXT_PROFILES[context.domain];
        const adjustedMix = applyEmotionalOverride(baseMix, context.emotionalRegister);
        const modifier = assemblePromptModifier(adjustedMix, context);
        const sources = getActiveSources(adjustedMix);
        return {
            basePrompt: ARCHITECT_BASE_PROMPT,
            contextModifier: modifier,
            fullPrompt: ARCHITECT_BASE_PROMPT + '\n\n' + modifier,
            activeTraits: sources,
            detectedContext: context,
        };
    }
    /**
     * Detects the full task context from a user message and optional
     * conversation history. Exposed publicly for debugging and testing.
     */
    detectContext(userMessage, history) {
        return detectContext(userMessage, history);
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
}
// ────────────────────────────────────────────────────────────────────────────
// Convenience factory
// ────────────────────────────────────────────────────────────────────────────
/** Creates a new Architect instance. */
export function createArchitect() {
    return new TheArchitect();
}
//# sourceMappingURL=index.js.map