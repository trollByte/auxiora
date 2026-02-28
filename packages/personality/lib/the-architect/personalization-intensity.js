// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    level: 0.7,
    enableTraitMixing: true,
    enableEmotionalAdaptation: true,
    enablePreferenceInfluence: true,
};
// ────────────────────────────────────────────────────────────────────────────
// PersonalizationIntensity
// ────────────────────────────────────────────────────────────────────────────
/**
 * Controls how aggressively The Architect adapts to user preferences.
 *
 * Acts as a backend knob that scales the effect of all personalization
 * signals — trait mixing offsets, emotional adjustments, and preference
 * weights — from 0.0 (generic, no adaptation) to 1.0 (full adaptation
 * with current defaults).
 */
export class PersonalizationIntensity {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.validateLevel(this.config.level);
    }
    /** Get current intensity level (0.0-1.0) */
    getLevel() {
        return this.config.level;
    }
    /** Set intensity level (0.0-1.0) */
    setLevel(level) {
        this.validateLevel(level);
        this.config.level = level;
        // Intensity change logged by caller if needed
    }
    /** Get human-readable label for current level */
    getLevelLabel() {
        const level = this.config.level;
        if (level <= 0.1)
            return 'minimal';
        if (level <= 0.35)
            return 'moderate';
        if (level <= 0.65)
            return 'balanced';
        if (level <= 0.85)
            return 'strong';
        return 'full';
    }
    /** Get current config */
    getConfig() {
        return { ...this.config };
    }
    /** Update feature toggles */
    setFeatures(features) {
        if (features.enableTraitMixing !== undefined)
            this.config.enableTraitMixing = features.enableTraitMixing;
        if (features.enableEmotionalAdaptation !== undefined)
            this.config.enableEmotionalAdaptation = features.enableEmotionalAdaptation;
        if (features.enablePreferenceInfluence !== undefined)
            this.config.enablePreferenceInfluence = features.enablePreferenceInfluence;
    }
    /**
     * Scale a trait weight offset by the current intensity.
     * At level 0, returns 0 (no personalization).
     * At level 1, returns the original offset unchanged.
     */
    scaleTraitOffset(offset) {
        if (!this.config.enableTraitMixing)
            return 0;
        return offset * this.config.level;
    }
    /**
     * Scale an emotional adjustment by the current intensity.
     */
    scaleEmotionalAdjustment(adjustment) {
        if (!this.config.enableEmotionalAdaptation)
            return 0;
        return adjustment * this.config.level;
    }
    /**
     * Scale a preference weight by the current intensity.
     */
    scalePreferenceWeight(weight) {
        if (!this.config.enablePreferenceInfluence)
            return 0;
        return weight * this.config.level;
    }
    /** Serialize for persistence */
    serialize() {
        return { ...this.config };
    }
    /** Load from persisted config */
    static fromSerialized(data) {
        return new PersonalizationIntensity(data);
    }
    validateLevel(level) {
        if (level < 0 || level > 1) {
            throw new Error(`Intensity level must be between 0.0 and 1.0, got ${level}`);
        }
    }
}
//# sourceMappingURL=personalization-intensity.js.map