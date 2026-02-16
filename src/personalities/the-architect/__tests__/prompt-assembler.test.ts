import { describe, it, expect } from 'vitest';
import { assemblePromptModifier, getActiveSources } from '../prompt-assembler.js';
import { CONTEXT_PROFILES } from '../context-profiles.js';
import { TRAIT_TO_INSTRUCTION } from '../trait-to-instruction.js';
import type { TaskContext, TraitMix } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const securityContext: TaskContext = {
  domain: 'security_review',
  emotionalRegister: 'neutral',
  complexity: 'deep_analysis',
  stakes: 'high',
  mode: 'solo_work',
};

const crisisContext: TaskContext = {
  domain: 'crisis_management',
  emotionalRegister: 'stressed',
  complexity: 'crisis',
  stakes: 'critical',
  mode: 'team_context',
};

// ────────────────────────────────────────────────────────────────────────────
// Top-N trait selection
// ────────────────────────────────────────────────────────────────────────────

describe('assemblePromptModifier — trait selection', () => {
  it('selects exactly 10 traits for the instructions list', () => {
    const modifier = assemblePromptModifier(CONTEXT_PROFILES.security_review, securityContext);
    // Count bullet points (each instruction is prefixed with "- ")
    const bullets = modifier.match(/^- .+/gm);
    expect(bullets).toHaveLength(10);
  });

  it('maps each selected trait to a non-empty instruction string', () => {
    const modifier = assemblePromptModifier(CONTEXT_PROFILES.general, {
      domain: 'general',
      emotionalRegister: 'neutral',
      complexity: 'moderate',
      stakes: 'moderate',
      mode: 'solo_work',
    });
    const bullets = modifier.match(/^- .+/gm)!;
    for (const bullet of bullets) {
      // Each bullet should have meaningful content beyond the "- " prefix
      expect(bullet.length).toBeGreaterThan(10);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Weight-tier differentiation
// ────────────────────────────────────────────────────────────────────────────

describe('assemblePromptModifier — weight-tier differentiation', () => {
  it('produces different instructions for the same trait at different weight tiers', () => {
    const context: TaskContext = {
      domain: 'general',
      emotionalRegister: 'neutral',
      complexity: 'moderate',
      stakes: 'moderate',
      mode: 'solo_work',
    };

    const highInstruction = TRAIT_TO_INSTRUCTION['adversarialThinking']!(0.9, context);
    const midInstruction = TRAIT_TO_INSTRUCTION['adversarialThinking']!(0.5, context);
    const lowInstruction = TRAIT_TO_INSTRUCTION['adversarialThinking']!(0.2, context);

    // All three tiers should produce distinct text
    expect(highInstruction).not.toBe(midInstruction);
    expect(midInstruction).not.toBe(lowInstruction);
    expect(highInstruction).not.toBe(lowInstruction);
  });

  it('high-weight instructions are longer and more specific than low-weight ones', () => {
    const context: TaskContext = {
      domain: 'general',
      emotionalRegister: 'neutral',
      complexity: 'moderate',
      stakes: 'moderate',
      mode: 'solo_work',
    };

    const highInstruction = TRAIT_TO_INSTRUCTION['stoicCalm']!(0.9, context);
    const lowInstruction = TRAIT_TO_INSTRUCTION['stoicCalm']!(0.2, context);

    expect(highInstruction.length).toBeGreaterThan(lowInstruction.length);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tone calibration and context metadata
// ────────────────────────────────────────────────────────────────────────────

describe('assemblePromptModifier — output format', () => {
  it('includes tone calibration values in the output', () => {
    const mix = CONTEXT_PROFILES.security_review;
    const modifier = assemblePromptModifier(mix, securityContext);

    expect(modifier).toContain(`warmth=${mix.warmth.toFixed(1)}`);
    expect(modifier).toContain(`urgency=${mix.urgency.toFixed(1)}`);
    expect(modifier).toContain(`humor=${mix.humor.toFixed(1)}`);
    expect(modifier).toContain(`depth=${mix.verbosity.toFixed(1)}`);
  });

  it('includes the context domain in the output', () => {
    const modifier = assemblePromptModifier(CONTEXT_PROFILES.security_review, securityContext);
    expect(modifier).toContain('Security Review');
  });

  it('includes the emotional register in the output', () => {
    const modifier = assemblePromptModifier(CONTEXT_PROFILES.crisis_management, crisisContext);
    expect(modifier).toContain('stressed');
  });

  it('includes stakes and complexity in the output', () => {
    const modifier = assemblePromptModifier(CONTEXT_PROFILES.crisis_management, crisisContext);
    expect(modifier).toContain('critical');
    expect(modifier).toContain('crisis');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Active sources
// ────────────────────────────────────────────────────────────────────────────

describe('getActiveSources', () => {
  it('returns 10 sources by default', () => {
    const sources = getActiveSources(CONTEXT_PROFILES.security_review);
    expect(sources).toHaveLength(10);
  });

  it('respects custom topN parameter', () => {
    const sources = getActiveSources(CONTEXT_PROFILES.general, 5);
    expect(sources).toHaveLength(5);
  });

  it('returns TraitSource objects with all required fields populated', () => {
    const sources = getActiveSources(CONTEXT_PROFILES.security_review);
    for (const source of sources) {
      expect(source.traitKey).toBeTruthy();
      expect(source.sourceName).toBeTruthy();
      expect(source.sourceWork).toBeTruthy();
      expect(source.evidenceSummary).toBeTruthy();
      expect(source.behavioralInstruction).toBeTruthy();
    }
  });

  it('returns sources ordered by trait weight (highest first)', () => {
    const mix = CONTEXT_PROFILES.security_review;
    const sources = getActiveSources(mix, 29);

    for (let i = 0; i < sources.length - 1; i++) {
      const currentWeight = (mix as Record<string, number>)[sources[i].traitKey];
      const nextWeight = (mix as Record<string, number>)[sources[i + 1].traitKey];
      expect(currentWeight).toBeGreaterThanOrEqual(nextWeight);
    }
  });
});
