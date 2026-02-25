import type { TaskContext } from '../schema.js';
/**
 * Maps every trait to a function that returns a natural-language behavioral
 * instruction calibrated to the trait's weight and the current context.
 *
 * Three tiers:
 * - weight >= 0.8  — Strong, specific, foregrounded instruction
 * - weight 0.4–0.79 — Moderate, present but not dominant
 * - weight < 0.4   — Light, background awareness only
 */
export declare const TRAIT_TO_INSTRUCTION: Record<string, (weight: number, context: TaskContext) => string>;
//# sourceMappingURL=trait-to-instruction.d.ts.map