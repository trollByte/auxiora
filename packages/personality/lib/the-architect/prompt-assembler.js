import { TRAIT_TO_INSTRUCTION } from './trait-to-instruction.js';
import { SOURCE_MAP } from './source-map.js';
// ────────────────────────────────────────────────────────────────────────────
// Prompt modifier assembly
// ────────────────────────────────────────────────────────────────────────────
/**
 * Assembles a context-specific prompt modifier from the current trait mix.
 *
 * Selects the top 10 weighted traits, generates a weight-scaled behavioral
 * instruction for each, and composes them into a prompt block that sits
 * between the base personality prompt and the user message.
 */
export function assemblePromptModifier(mix, context) {
    const entries = Object.entries(mix);
    // Sort by weight descending, take top 10
    const top = entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    const instructions = [];
    for (const [key, value] of top) {
        const fn = TRAIT_TO_INSTRUCTION[key];
        if (fn) {
            instructions.push(fn(value, context));
        }
    }
    return [
        '## Current Context Adaptation',
        '',
        `You are operating in a **${formatDomain(context.domain)}** context.`,
        `The user's emotional state appears **${context.emotionalRegister}**.`,
        `Stakes: **${context.stakes}**. Complexity: **${context.complexity}**.`,
        '',
        'For this interaction, emphasize:',
        '',
        ...instructions.map((i) => `- ${i}`),
        '',
        `Tone: warmth=${mix.warmth.toFixed(1)}, urgency=${mix.urgency.toFixed(1)}, humor=${mix.humor.toFixed(1)}, depth=${mix.verbosity.toFixed(1)}`,
    ].join('\n');
}
// ────────────────────────────────────────────────────────────────────────────
// Active source retrieval
// ────────────────────────────────────────────────────────────────────────────
/**
 * Returns the SOURCE_MAP entries for the top N weighted traits in the mix.
 * Useful for transparency — explaining *why* the personality is behaving
 * a certain way and which historical minds are driving the response.
 */
export function getActiveSources(mix, topN = 10) {
    const entries = Object.entries(mix);
    return entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([key]) => SOURCE_MAP[key])
        .filter(Boolean);
}
// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
/** Converts a snake_case domain key to a human-readable label. */
function formatDomain(domain) {
    return domain
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
//# sourceMappingURL=prompt-assembler.js.map