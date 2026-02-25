import type { TraitMix, EmotionalRegister } from '../schema.js';
/**
 * Multipliers applied on top of the context profile's base trait values.
 * Values > 1.0 amplify a trait; values < 1.0 dampen it.
 * After multiplication, all traits are capped at 1.0 by `applyEmotionalOverride`.
 */
export declare const EMOTIONAL_OVERRIDES: Record<EmotionalRegister, Partial<Record<keyof TraitMix, number>>>;
/**
 * Applies emotional multipliers to a base trait mix, producing a new TraitMix
 * where each trait is multiplied by its override value (defaulting to 1.0)
 * and capped at 1.0.
 */
export declare function applyEmotionalOverride(baseMix: TraitMix, emotion: EmotionalRegister): TraitMix;
//# sourceMappingURL=emotional-overrides.d.ts.map