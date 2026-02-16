import type { TraitMix, TaskContext, TraitSource, ContextDomain, PromptOutput } from '../schema.js';
import { CorrectionStore } from './correction-store.js';
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
 */
export declare class TheArchitect {
    private contextOverride;
    private correctionStore;
    /**
     * Primary method: user message in, complete prompt out.
     *
     * Detects context, selects the domain profile, applies emotional
     * overrides, assembles a weight-scaled prompt modifier, and returns
     * the full prompt with active trait sources for transparency.
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
    /**
     * Records a user correction so the engine can learn from misclassifications.
     * Call this when the user manually overrides the detected context.
     */
    recordCorrection(userMessage: string, detectedDomain: ContextDomain, correctedDomain: ContextDomain): void;
    /** Load corrections from serialized data (e.g. from encrypted vault). */
    loadCorrections(serializedData: string): void;
    /** Export corrections as a serialized string for encrypted storage. */
    exportCorrections(): string;
    /** Get correction statistics for debugging and transparency. */
    getCorrectionStats(): ReturnType<CorrectionStore['getStats']>;
}
/** Creates a new Architect instance. */
export declare function createArchitect(): TheArchitect;
//# sourceMappingURL=index.d.ts.map