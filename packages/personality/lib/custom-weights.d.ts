import type { TraitMix } from '../schema.js';
export interface WeightPreset {
    name: string;
    description: string;
    overrides: Partial<Record<keyof TraitMix, number>>;
}
export declare const WEIGHT_PRESETS: Record<string, WeightPreset>;
/**
 * User-defined trait weight adjustments. These are ADDITIVE offsets applied
 * after context profiles and emotional overrides, allowing users to
 * permanently nudge the personality toward their preferences.
 *
 * Offsets are clamped to [-0.3, +0.3] — enough to meaningfully shift
 * behavior without fully overriding the context profile.
 */
export declare class CustomWeights {
    private overrides;
    /**
     * Set a custom weight offset for a trait.
     * Clamps to [-0.3, +0.3]. Throws if the trait key is invalid.
     */
    setOverride(trait: keyof TraitMix, offset: number): void;
    /** Remove a custom override for a single trait. */
    removeOverride(trait: keyof TraitMix): void;
    /** Get all current overrides. Returns a shallow copy. */
    getOverrides(): Partial<Record<keyof TraitMix, number>>;
    /**
     * Apply overrides to a trait mix. For each override, adds the offset
     * and clamps the result to [0.0, 1.0].
     */
    apply(baseMix: TraitMix): TraitMix;
    /** All available presets. */
    static get presets(): Record<string, WeightPreset>;
    /** Load a preset, replacing all current overrides. Throws if preset not found. */
    loadPreset(presetName: string): void;
    /** Serialize overrides to JSON string for persistence. */
    serialize(): string;
    /** Deserialize a CustomWeights instance from a JSON string. */
    static deserialize(data: string): CustomWeights;
    /** Clear all overrides. */
    clear(): void;
}
//# sourceMappingURL=custom-weights.d.ts.map