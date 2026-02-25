import { describe, it, expect, beforeEach } from 'vitest';
import { PersonalizationIntensity } from '../personalization-intensity.js';
import type { IntensityConfig } from '../personalization-intensity.js';

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('PersonalizationIntensity', () => {
  let intensity: PersonalizationIntensity;

  beforeEach(() => {
    intensity = new PersonalizationIntensity();
  });

  // ── Defaults ────────────────────────────────────────────────────────────

  it('defaults to level 0.7', () => {
    expect(intensity.getLevel()).toBe(0.7);
  });

  // ── setLevel ────────────────────────────────────────────────────────────

  it('setLevel changes level', () => {
    intensity.setLevel(0.3);
    expect(intensity.getLevel()).toBe(0.3);
  });

  it('setLevel rejects values below 0', () => {
    expect(() => intensity.setLevel(-0.1)).toThrow('Intensity level must be between 0.0 and 1.0');
  });

  it('setLevel rejects values above 1', () => {
    expect(() => intensity.setLevel(1.5)).toThrow('Intensity level must be between 0.0 and 1.0');
  });

  it('constructor rejects invalid level', () => {
    expect(() => new PersonalizationIntensity({ level: 2.0 })).toThrow('Intensity level must be between 0.0 and 1.0');
  });

  // ── getLevelLabel ───────────────────────────────────────────────────────

  describe('getLevelLabel', () => {
    it('returns minimal for level <= 0.1', () => {
      intensity.setLevel(0.0);
      expect(intensity.getLevelLabel()).toBe('minimal');
      intensity.setLevel(0.1);
      expect(intensity.getLevelLabel()).toBe('minimal');
    });

    it('returns moderate for level 0.11-0.35', () => {
      intensity.setLevel(0.2);
      expect(intensity.getLevelLabel()).toBe('moderate');
      intensity.setLevel(0.35);
      expect(intensity.getLevelLabel()).toBe('moderate');
    });

    it('returns balanced for level 0.36-0.65', () => {
      intensity.setLevel(0.5);
      expect(intensity.getLevelLabel()).toBe('balanced');
      intensity.setLevel(0.65);
      expect(intensity.getLevelLabel()).toBe('balanced');
    });

    it('returns strong for level 0.66-0.85', () => {
      intensity.setLevel(0.7);
      expect(intensity.getLevelLabel()).toBe('strong');
      intensity.setLevel(0.85);
      expect(intensity.getLevelLabel()).toBe('strong');
    });

    it('returns full for level > 0.85', () => {
      intensity.setLevel(0.9);
      expect(intensity.getLevelLabel()).toBe('full');
      intensity.setLevel(1.0);
      expect(intensity.getLevelLabel()).toBe('full');
    });
  });

  // ── scaleTraitOffset ───────────────────────────────────────────────────

  it('scaleTraitOffset scales by level', () => {
    intensity.setLevel(0.5);
    expect(intensity.scaleTraitOffset(0.2)).toBeCloseTo(0.1);
  });

  it('scaleTraitOffset returns 0 when trait mixing disabled', () => {
    intensity.setFeatures({ enableTraitMixing: false });
    expect(intensity.scaleTraitOffset(0.2)).toBe(0);
  });

  // ── scaleEmotionalAdjustment ───────────────────────────────────────────

  it('scaleEmotionalAdjustment scales by level', () => {
    intensity.setLevel(0.5);
    expect(intensity.scaleEmotionalAdjustment(0.4)).toBeCloseTo(0.2);
  });

  it('scaleEmotionalAdjustment returns 0 when disabled', () => {
    intensity.setFeatures({ enableEmotionalAdaptation: false });
    expect(intensity.scaleEmotionalAdjustment(0.4)).toBe(0);
  });

  // ── scalePreferenceWeight ──────────────────────────────────────────────

  it('scalePreferenceWeight scales by level', () => {
    intensity.setLevel(0.5);
    expect(intensity.scalePreferenceWeight(0.6)).toBeCloseTo(0.3);
  });

  it('scalePreferenceWeight returns 0 when disabled', () => {
    intensity.setFeatures({ enablePreferenceInfluence: false });
    expect(intensity.scalePreferenceWeight(0.6)).toBe(0);
  });

  // ── Boundary: level 0 ─────────────────────────────────────────────────

  it('at level 0 all scaling returns 0', () => {
    intensity.setLevel(0);
    expect(intensity.scaleTraitOffset(0.3)).toBe(0);
    expect(intensity.scaleEmotionalAdjustment(0.5)).toBe(0);
    expect(intensity.scalePreferenceWeight(0.8)).toBe(0);
  });

  // ── Boundary: level 1 ─────────────────────────────────────────────────

  it('at level 1 all scaling returns original value', () => {
    intensity.setLevel(1.0);
    expect(intensity.scaleTraitOffset(0.3)).toBeCloseTo(0.3);
    expect(intensity.scaleEmotionalAdjustment(0.5)).toBeCloseTo(0.5);
    expect(intensity.scalePreferenceWeight(0.8)).toBeCloseTo(0.8);
  });

  // ── Serialization ─────────────────────────────────────────────────────

  it('serialize and fromSerialized round-trip correctly', () => {
    intensity.setLevel(0.4);
    intensity.setFeatures({ enableTraitMixing: false });

    const serialized = intensity.serialize();
    const restored = PersonalizationIntensity.fromSerialized(serialized);

    expect(restored.getLevel()).toBe(0.4);
    expect(restored.getConfig().enableTraitMixing).toBe(false);
    expect(restored.getConfig().enableEmotionalAdaptation).toBe(true);
    expect(restored.getConfig().enablePreferenceInfluence).toBe(true);
  });

  // ── setFeatures ───────────────────────────────────────────────────────

  it('setFeatures updates individual toggles without affecting others', () => {
    intensity.setFeatures({ enableEmotionalAdaptation: false });
    const config = intensity.getConfig();
    expect(config.enableEmotionalAdaptation).toBe(false);
    expect(config.enableTraitMixing).toBe(true);
    expect(config.enablePreferenceInfluence).toBe(true);
  });

  // ── getConfig returns copy ────────────────────────────────────────────

  it('getConfig returns a copy that does not mutate internal state', () => {
    const config = intensity.getConfig();
    config.level = 0.0;
    expect(intensity.getLevel()).toBe(0.7);
  });
});
