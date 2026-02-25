import { describe, it, expect } from 'vitest';
import { CONTEXT_PROFILES } from '../context-profiles.js';
import { EMOTIONAL_OVERRIDES, applyEmotionalOverride } from '../emotional-overrides.js';
import type { TraitMix, EmotionalRegister } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Context profiles — critical trait values
// ────────────────────────────────────────────────────────────────────────────

describe('CONTEXT_PROFILES — critical trait values', () => {
  it('security_review maximizes adversarialThinking and paranoidVigilance', () => {
    const mix = CONTEXT_PROFILES.security_review;
    expect(mix.adversarialThinking).toBe(1.0);
    expect(mix.paranoidVigilance).toBe(1.0);
  });

  it('one_on_one maximizes tacticalEmpathy and warmth', () => {
    const mix = CONTEXT_PROFILES.one_on_one;
    expect(mix.tacticalEmpathy).toBe(1.0);
    expect(mix.warmth).toBe(1.0);
  });

  it('crisis_management zeroes humor and maximizes stoicCalm and ooda', () => {
    const mix = CONTEXT_PROFILES.crisis_management;
    expect(mix.humor).toBe(0.0);
    expect(mix.stoicCalm).toBe(1.0);
    expect(mix.ooda).toBe(1.0);
  });

  it('creative_work maximizes constraintCreativity and suppresses paranoidVigilance', () => {
    const mix = CONTEXT_PROFILES.creative_work;
    expect(mix.constraintCreativity).toBe(1.0);
    expect(mix.paranoidVigilance).toBeLessThanOrEqual(0.2);
  });

  it('every profile has exactly 29 traits', () => {
    for (const [domain, mix] of Object.entries(CONTEXT_PROFILES)) {
      const keys = Object.keys(mix);
      expect(keys).toHaveLength(29);
    }
  });

  it('all trait values are in the [0.0, 1.0] range', () => {
    for (const [domain, mix] of Object.entries(CONTEXT_PROFILES)) {
      for (const [trait, value] of Object.entries(mix)) {
        expect(value).toBeGreaterThanOrEqual(0.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Emotional overrides — amplification and dampening
// ────────────────────────────────────────────────────────────────────────────

describe('applyEmotionalOverride — amplification', () => {
  it('stressed override amplifies stoicCalm (multiplied by 1.5, capped at 1.0)', () => {
    // Use a profile where stoicCalm is high enough that 1.5x hits the cap
    const base = CONTEXT_PROFILES.crisis_management; // stoicCalm = 1.0
    const result = applyEmotionalOverride(base, 'stressed');
    expect(result.stoicCalm).toBe(1.0); // 1.0 * 1.5 = 1.5, capped at 1.0

    // Also verify amplification on a lower base value
    const generalBase = CONTEXT_PROFILES.general; // stoicCalm = 0.5
    const generalResult = applyEmotionalOverride(generalBase, 'stressed');
    expect(generalResult.stoicCalm).toBe(Math.min(0.5 * 1.5, 1.0)); // 0.75
  });
});

describe('applyEmotionalOverride — dampening', () => {
  it('stressed override dampens urgency (multiplied by 0.3)', () => {
    const base = CONTEXT_PROFILES.crisis_management; // urgency = 1.0
    const result = applyEmotionalOverride(base, 'stressed');
    expect(result.urgency).toBeCloseTo(1.0 * 0.3, 5); // 0.3
  });

  it('frustrated override dampens adversarialThinking (multiplied by 0.5)', () => {
    const base = CONTEXT_PROFILES.security_review; // adversarialThinking = 1.0
    const result = applyEmotionalOverride(base, 'frustrated');
    expect(result.adversarialThinking).toBeCloseTo(1.0 * 0.5, 5);
  });
});

describe('applyEmotionalOverride — invariants', () => {
  it('no trait ever exceeds 1.0 after override application', () => {
    const emotions: EmotionalRegister[] = ['stressed', 'frustrated', 'uncertain', 'excited', 'celebratory', 'neutral'];

    for (const domain of Object.keys(CONTEXT_PROFILES) as Array<keyof typeof CONTEXT_PROFILES>) {
      for (const emotion of emotions) {
        const result = applyEmotionalOverride(CONTEXT_PROFILES[domain], emotion);
        for (const [trait, value] of Object.entries(result)) {
          expect(value).toBeLessThanOrEqual(1.0);
          expect(value).toBeGreaterThanOrEqual(0.0);
        }
      }
    }
  });

  it('neutral override produces an identical mix to the input', () => {
    const base = CONTEXT_PROFILES.security_review;
    const result = applyEmotionalOverride(base, 'neutral');

    for (const key of Object.keys(base) as Array<keyof TraitMix>) {
      expect(result[key]).toBe(base[key]);
    }
  });

  it('override does not mutate the original profile', () => {
    const originalValue = CONTEXT_PROFILES.general.urgency;
    applyEmotionalOverride(CONTEXT_PROFILES.general, 'stressed');
    expect(CONTEXT_PROFILES.general.urgency).toBe(originalValue);
  });
});
