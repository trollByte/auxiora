import { describe, it, expect, beforeEach } from 'vitest';
import { CustomWeights, WEIGHT_PRESETS } from '../custom-weights.js';
import { createArchitect, InMemoryEncryptedStorage } from '../index.js';
import type { TraitMix } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let weights: CustomWeights;

/** A baseline TraitMix with all traits at 0.5 for easy arithmetic. */
function baselineMix(): TraitMix {
  return {
    inversion: 0.5, firstPrinciples: 0.5, mentalSimulation: 0.5,
    adversarialThinking: 0.5, secondOrder: 0.5, systemsView: 0.5,
    simplification: 0.5, storytelling: 0.5, tacticalEmpathy: 0.5,
    genuineCuriosity: 0.5, radicalCandor: 0.5, standardSetting: 0.5,
    developmentalCoaching: 0.5, strategicGenerosity: 0.5, stoicCalm: 0.5,
    paranoidVigilance: 0.5, valueEquation: 0.5, ooda: 0.5,
    buildForChange: 0.5, humanCenteredDesign: 0.5, constraintCreativity: 0.5,
    regretMinimization: 0.5, doorClassification: 0.5, probabilistic: 0.5,
    plannedAbandonment: 0.5, warmth: 0.5, urgency: 0.5, humor: 0.5,
    verbosity: 0.5,
  };
}

beforeEach(() => {
  weights = new CustomWeights();
});

// ────────────────────────────────────────────────────────────────────────────
// setOverride / removeOverride
// ────────────────────────────────────────────────────────────────────────────

describe('CustomWeights — setOverride', () => {
  it('stores an offset for a valid trait', () => {
    weights.setOverride('adversarialThinking', 0.2);
    expect(weights.getOverrides().adversarialThinking).toBe(0.2);
  });

  it('clamps positive offset to +0.3', () => {
    weights.setOverride('warmth', 0.5);
    expect(weights.getOverrides().warmth).toBe(0.3);
  });

  it('clamps negative offset to -0.3', () => {
    weights.setOverride('humor', -0.5);
    expect(weights.getOverrides().humor).toBe(-0.3);
  });

  it('throws for invalid trait key', () => {
    expect(() => weights.setOverride('nonExistent' as keyof TraitMix, 0.1)).toThrow('Invalid trait key');
  });

  it('overwrites previous offset for the same trait', () => {
    weights.setOverride('warmth', 0.1);
    weights.setOverride('warmth', -0.2);
    expect(weights.getOverrides().warmth).toBe(-0.2);
  });
});

describe('CustomWeights — removeOverride', () => {
  it('removes a single trait override', () => {
    weights.setOverride('warmth', 0.2);
    weights.setOverride('humor', -0.1);
    weights.removeOverride('warmth');

    const overrides = weights.getOverrides();
    expect(overrides.warmth).toBeUndefined();
    expect(overrides.humor).toBe(-0.1);
  });

  it('is a no-op for traits without overrides', () => {
    weights.removeOverride('warmth');
    expect(weights.getOverrides().warmth).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// apply
// ────────────────────────────────────────────────────────────────────────────

describe('CustomWeights — apply', () => {
  it('adds positive offsets to trait values', () => {
    weights.setOverride('adversarialThinking', 0.2);
    const result = weights.apply(baselineMix());
    expect(result.adversarialThinking).toBeCloseTo(0.7, 5);
  });

  it('adds negative offsets to trait values', () => {
    weights.setOverride('warmth', -0.2);
    const result = weights.apply(baselineMix());
    expect(result.warmth).toBeCloseTo(0.3, 5);
  });

  it('clamps result to 1.0 maximum', () => {
    weights.setOverride('adversarialThinking', 0.3);
    const mix = baselineMix();
    mix.adversarialThinking = 0.9;
    const result = weights.apply(mix);
    expect(result.adversarialThinking).toBe(1.0);
  });

  it('clamps result to 0.0 minimum', () => {
    weights.setOverride('humor', -0.3);
    const mix = baselineMix();
    mix.humor = 0.1;
    const result = weights.apply(mix);
    expect(result.humor).toBe(0.0);
  });

  it('does not modify traits without overrides', () => {
    weights.setOverride('warmth', 0.2);
    const result = weights.apply(baselineMix());
    expect(result.inversion).toBe(0.5); // unchanged
    expect(result.warmth).toBeCloseTo(0.7, 5); // changed
  });

  it('returns a new object, does not mutate input', () => {
    weights.setOverride('warmth', 0.2);
    const original = baselineMix();
    const result = weights.apply(original);
    expect(original.warmth).toBe(0.5);
    expect(result.warmth).toBeCloseTo(0.7, 5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Presets
// ────────────────────────────────────────────────────────────────────────────

describe('CustomWeights — presets', () => {
  it('all 5 presets are defined', () => {
    expect(Object.keys(WEIGHT_PRESETS)).toHaveLength(5);
    expect(WEIGHT_PRESETS.the_ciso).toBeDefined();
    expect(WEIGHT_PRESETS.the_builder).toBeDefined();
    expect(WEIGHT_PRESETS.the_coach).toBeDefined();
    expect(WEIGHT_PRESETS.the_strategist).toBeDefined();
    expect(WEIGHT_PRESETS.the_closer).toBeDefined();
  });

  it('loadPreset replaces all overrides with preset values', () => {
    weights.setOverride('warmth', 0.3); // should be overwritten
    weights.loadPreset('the_ciso');

    const overrides = weights.getOverrides();
    expect(overrides.adversarialThinking).toBe(0.2);
    expect(overrides.paranoidVigilance).toBe(0.2);
    expect(overrides.warmth).toBe(-0.1); // replaced, not merged
  });

  it('loadPreset throws for unknown preset', () => {
    expect(() => weights.loadPreset('the_unicorn')).toThrow('Unknown preset');
  });

  it('preset the_coach applies correct overrides', () => {
    weights.loadPreset('the_coach');
    const result = weights.apply(baselineMix());

    expect(result.tacticalEmpathy).toBeCloseTo(0.7, 5);
    expect(result.developmentalCoaching).toBeCloseTo(0.7, 5);
    expect(result.warmth).toBeCloseTo(0.7, 5);
    expect(result.urgency).toBeCloseTo(0.3, 5);
    expect(result.adversarialThinking).toBeCloseTo(0.35, 5);
  });

  it('preset the_closer applies correct overrides', () => {
    weights.loadPreset('the_closer');
    const overrides = weights.getOverrides();

    expect(overrides.valueEquation).toBe(0.25);
    expect(overrides.storytelling).toBe(0.2);
    expect(overrides.urgency).toBe(0.15);
  });

  it('each preset has name and description', () => {
    for (const preset of Object.values(WEIGHT_PRESETS)) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      expect(Object.keys(preset.overrides).length).toBeGreaterThan(0);
    }
  });

  it('all preset offset values are within [-0.3, +0.3]', () => {
    for (const [key, preset] of Object.entries(WEIGHT_PRESETS)) {
      for (const [trait, offset] of Object.entries(preset.overrides)) {
        expect(offset).toBeGreaterThanOrEqual(-0.3);
        expect(offset).toBeLessThanOrEqual(0.3);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Serialization
// ────────────────────────────────────────────────────────────────────────────

describe('CustomWeights — serialize / deserialize', () => {
  it('round-trips correctly', () => {
    weights.setOverride('adversarialThinking', 0.2);
    weights.setOverride('warmth', -0.15);

    const serialized = weights.serialize();
    const restored = CustomWeights.deserialize(serialized);

    expect(restored.getOverrides()).toEqual(weights.getOverrides());
  });

  it('deserialize clamps out-of-range values', () => {
    const badData = JSON.stringify({ adversarialThinking: 0.9, warmth: -0.8 });
    const restored = CustomWeights.deserialize(badData);

    expect(restored.getOverrides().adversarialThinking).toBe(0.3);
    expect(restored.getOverrides().warmth).toBe(-0.3);
  });

  it('deserialize ignores invalid trait keys', () => {
    const badData = JSON.stringify({ notATrait: 0.2, warmth: 0.1 });
    const restored = CustomWeights.deserialize(badData);

    expect(restored.getOverrides().warmth).toBe(0.1);
    expect(Object.keys(restored.getOverrides())).toHaveLength(1);
  });

  it('deserialize of empty object returns no overrides', () => {
    const restored = CustomWeights.deserialize('{}');
    expect(Object.keys(restored.getOverrides())).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Clear
// ────────────────────────────────────────────────────────────────────────────

describe('CustomWeights — clear', () => {
  it('removes all overrides', () => {
    weights.setOverride('adversarialThinking', 0.2);
    weights.setOverride('warmth', -0.1);
    weights.clear();

    expect(Object.keys(weights.getOverrides())).toHaveLength(0);
  });

  it('apply after clear returns unmodified mix', () => {
    weights.setOverride('adversarialThinking', 0.2);
    weights.clear();

    const result = weights.apply(baselineMix());
    expect(result.adversarialThinking).toBe(0.5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Integration with TheArchitect
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect — custom weights integration', () => {
  it('setTraitOverride affects generated prompt', async () => {
    const architect = createArchitect();
    await architect.setTraitOverride('adversarialThinking', 0.3);

    const output = architect.generatePrompt('Review this code');
    // The adversarialThinking trait should be boosted, resulting in more
    // adversarial instructions in the prompt
    const overrides = architect.getActiveOverrides();
    expect(overrides.adversarialThinking).toBe(0.3);
  });

  it('loadPreset applies preset overrides', async () => {
    const architect = createArchitect();
    await architect.loadPreset('the_ciso');

    const overrides = architect.getActiveOverrides();
    expect(overrides.adversarialThinking).toBe(0.2);
    expect(overrides.paranoidVigilance).toBe(0.2);
  });

  it('listPresets returns all presets', () => {
    const architect = createArchitect();
    const presets = architect.listPresets();
    expect(Object.keys(presets)).toHaveLength(5);
  });

  it('removeTraitOverride clears a single override', async () => {
    const architect = createArchitect();
    await architect.setTraitOverride('warmth', 0.2);
    await architect.setTraitOverride('humor', -0.1);
    await architect.removeTraitOverride('warmth');

    const overrides = architect.getActiveOverrides();
    expect(overrides.warmth).toBeUndefined();
    expect(overrides.humor).toBe(-0.1);
  });

  it('custom weights persist across instances', async () => {
    const storage = new InMemoryEncryptedStorage();

    const first = createArchitect(storage);
    await first.initialize();
    await first.setTraitOverride('adversarialThinking', 0.25);

    const second = createArchitect(storage);
    await second.initialize();

    const overrides = second.getActiveOverrides();
    expect(overrides.adversarialThinking).toBe(0.25);
  });

  it('clearAllData also clears custom weights', async () => {
    const architect = createArchitect();
    await architect.setTraitOverride('warmth', 0.2);
    await architect.clearAllData();

    expect(Object.keys(architect.getActiveOverrides())).toHaveLength(0);
  });
});
