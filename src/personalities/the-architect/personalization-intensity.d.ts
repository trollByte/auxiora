export type IntensityLevel = 'minimal' | 'moderate' | 'balanced' | 'strong' | 'full';
export interface IntensityConfig {
    /** 0.0 = generic (no adaptation), 1.0 = full adaptation. Default: 0.7 */
    level: number;
    /** Whether trait mixing is enabled. Default: true */
    enableTraitMixing: boolean;
    /** Whether emotional tracking adjustments are enabled. Default: true */
    enableEmotionalAdaptation: boolean;
    /** Whether preference history influences responses. Default: true */
    enablePreferenceInfluence: boolean;
}
/**
 * Controls how aggressively The Architect adapts to user preferences.
 *
 * Acts as a backend knob that scales the effect of all personalization
 * signals — trait mixing offsets, emotional adjustments, and preference
 * weights — from 0.0 (generic, no adaptation) to 1.0 (full adaptation
 * with current defaults).
 */
export declare class PersonalizationIntensity {
    private config;
    constructor(config?: Partial<IntensityConfig>);
    /** Get current intensity level (0.0-1.0) */
    getLevel(): number;
    /** Set intensity level (0.0-1.0) */
    setLevel(level: number): void;
    /** Get human-readable label for current level */
    getLevelLabel(): IntensityLevel;
    /** Get current config */
    getConfig(): IntensityConfig;
    /** Update feature toggles */
    setFeatures(features: Partial<Omit<IntensityConfig, 'level'>>): void;
    /**
     * Scale a trait weight offset by the current intensity.
     * At level 0, returns 0 (no personalization).
     * At level 1, returns the original offset unchanged.
     */
    scaleTraitOffset(offset: number): number;
    /**
     * Scale an emotional adjustment by the current intensity.
     */
    scaleEmotionalAdjustment(adjustment: number): number;
    /**
     * Scale a preference weight by the current intensity.
     */
    scalePreferenceWeight(weight: number): number;
    /** Serialize for persistence */
    serialize(): IntensityConfig;
    /** Load from persisted config */
    static fromSerialized(data: IntensityConfig): PersonalizationIntensity;
    private validateLevel;
}
//# sourceMappingURL=personalization-intensity.d.ts.map