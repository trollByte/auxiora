import type { TraitMix, TaskContext, TraitSource } from '../schema.js';
/**
 * Assembles a context-specific prompt modifier from the current trait mix.
 *
 * Selects the top 10 weighted traits, generates a weight-scaled behavioral
 * instruction for each, and composes them into a prompt block that sits
 * between the base personality prompt and the user message.
 */
export declare function assemblePromptModifier(mix: TraitMix, context: TaskContext): string;
/**
 * Returns the SOURCE_MAP entries for the top N weighted traits in the mix.
 * Useful for transparency — explaining *why* the personality is behaving
 * a certain way and which historical minds are driving the response.
 */
export declare function getActiveSources(mix: TraitMix, topN?: number): TraitSource[];
//# sourceMappingURL=prompt-assembler.d.ts.map