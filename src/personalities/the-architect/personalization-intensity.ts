// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: IntensityConfig = {
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
  private config: IntensityConfig;

  constructor(config?: Partial<IntensityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateLevel(this.config.level);
  }

  /** Get current intensity level (0.0-1.0) */
  getLevel(): number {
    return this.config.level;
  }

  /** Set intensity level (0.0-1.0) */
  setLevel(level: number): void {
    this.validateLevel(level);
    this.config.level = level;
    // Intensity change logged by caller if needed
  }

  /** Get human-readable label for current level */
  getLevelLabel(): IntensityLevel {
    const level = this.config.level;
    if (level <= 0.1) return 'minimal';
    if (level <= 0.35) return 'moderate';
    if (level <= 0.65) return 'balanced';
    if (level <= 0.85) return 'strong';
    return 'full';
  }

  /** Get current config */
  getConfig(): IntensityConfig {
    return { ...this.config };
  }

  /** Update feature toggles */
  setFeatures(features: Partial<Omit<IntensityConfig, 'level'>>): void {
    if (features.enableTraitMixing !== undefined) this.config.enableTraitMixing = features.enableTraitMixing;
    if (features.enableEmotionalAdaptation !== undefined) this.config.enableEmotionalAdaptation = features.enableEmotionalAdaptation;
    if (features.enablePreferenceInfluence !== undefined) this.config.enablePreferenceInfluence = features.enablePreferenceInfluence;
  }

  /**
   * Scale a trait weight offset by the current intensity.
   * At level 0, returns 0 (no personalization).
   * At level 1, returns the original offset unchanged.
   */
  scaleTraitOffset(offset: number): number {
    if (!this.config.enableTraitMixing) return 0;
    return offset * this.config.level;
  }

  /**
   * Scale an emotional adjustment by the current intensity.
   */
  scaleEmotionalAdjustment(adjustment: number): number {
    if (!this.config.enableEmotionalAdaptation) return 0;
    return adjustment * this.config.level;
  }

  /**
   * Scale a preference weight by the current intensity.
   */
  scalePreferenceWeight(weight: number): number {
    if (!this.config.enablePreferenceInfluence) return 0;
    return weight * this.config.level;
  }

  /** Serialize for persistence */
  serialize(): IntensityConfig {
    return { ...this.config };
  }

  /** Load from persisted config */
  static fromSerialized(data: IntensityConfig): PersonalizationIntensity {
    return new PersonalizationIntensity(data);
  }

  private validateLevel(level: number): void {
    if (level < 0 || level > 1) {
      throw new Error(`Intensity level must be between 0.0 and 1.0, got ${level}`);
    }
  }
}
