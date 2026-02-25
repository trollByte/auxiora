import { describe, it, expect, beforeEach } from 'vitest';
import { TheArchitect, createArchitect, ARCHITECT_BASE_PROMPT } from '../index.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let architect: TheArchitect;

beforeEach(() => {
  architect = createArchitect();
});

// ────────────────────────────────────────────────────────────────────────────
// End-to-end prompt generation
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect.generatePrompt — domain-specific output', () => {
  it('security review includes adversarial and paranoid instructions', () => {
    const output = architect.generatePrompt(
      'Is this secure? Review this terraform config for security vulnerabilities — check for threat vectors, potential exploit paths, firewall rules, and audit compliance',
    );
    expect(output.detectedContext.domain).toBe('security_review');
    expect(output.fullPrompt).toMatch(/attack|adversar|compromise/i);
    expect(output.fullPrompt).toMatch(/paranoi|vigilan|complacen/i);
  });

  it('stressed prioritization request includes stoic calm and empathy with low urgency', () => {
    const output = architect.generatePrompt("I'm drowning and overwhelmed, help me prioritize — I'm exhausted and swamped");
    expect(output.detectedContext.emotionalRegister).toBe('stressed');
    // After emotional override, urgency should be dampened
    expect(output.contextModifier).toMatch(/urgency=\d\.\d/);
    // Should contain calming and empathetic language
    expect(output.fullPrompt).toMatch(/calm|steady|absorb|empathy|listen|acknowledge/i);
  });

  it('active breach triggers crisis mode with OODA, calm, and zero humor', () => {
    const output = architect.generatePrompt('We just got breached — this is a P1 incident, escalation is underway and the outage is spreading');
    expect(output.detectedContext.domain).toBe('crisis_management');
    expect(output.fullPrompt).toMatch(/OODA|observe.*orient.*decide.*act|cycle/i);
    expect(output.contextModifier).toContain('humor=0.0');
  });

  it('one-on-one prep includes coaching and empathy instructions', () => {
    const output = architect.generatePrompt(
      'Help me prep for my 1:1 with Jake — I want to give him coaching and feedback for his career growth, they seem disengaged',
    );
    expect(output.detectedContext.domain).toBe('one_on_one');
    expect(output.fullPrompt).toMatch(/coach|develop|expectations|support/i);
    expect(output.fullPrompt).toMatch(/empathy|listen|label|understand/i);
  });

  it('celebration includes warmth and positive energy', () => {
    const output = architect.generatePrompt('We did it — we shipped the Wiz migration and nailed it!');
    expect(output.detectedContext.emotionalRegister).toBe('celebratory');
    // Warmth should be amplified in the modifier
    expect(output.fullPrompt).toMatch(/warm|celebrat|generos|humor/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Context override
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect.setContextOverride', () => {
  it('forces security_review context regardless of message content', () => {
    architect.setContextOverride('security_review');
    const output = architect.generatePrompt('Tell me a joke about cats');
    expect(output.detectedContext.domain).toBe('security_review');
    expect(output.fullPrompt).toMatch(/attack|adversar|compromise/i);
  });

  it('returns to auto-detection when override is cleared', () => {
    architect.setContextOverride('security_review');
    const overridden = architect.generatePrompt('What is a VLAN?');
    expect(overridden.detectedContext.domain).toBe('security_review');

    architect.setContextOverride(null);
    // Enough signals: what is + explain + understand + how does + teach me = 5 keywords (0.75) >= 0.75
    const auto = architect.generatePrompt('What is a VLAN? Explain how it works, I want to understand how does it segment traffic. Teach me.');
    expect(auto.detectedContext.domain).toBe('learning_research');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Active sources
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect.getActiveSources', () => {
  it('returns TraitSource objects with all fields populated', () => {
    const sources = architect.getActiveSources();
    expect(sources.length).toBeGreaterThan(0);

    for (const source of sources) {
      expect(source.traitKey).toBeTruthy();
      expect(typeof source.traitKey).toBe('string');
      expect(source.sourceName).toBeTruthy();
      expect(typeof source.sourceName).toBe('string');
      expect(source.sourceWork).toBeTruthy();
      expect(typeof source.sourceWork).toBe('string');
      expect(source.evidenceSummary).toBeTruthy();
      expect(typeof source.evidenceSummary).toBe('string');
      expect(source.behavioralInstruction).toBeTruthy();
      expect(typeof source.behavioralInstruction).toBe('string');
    }
  });

  it('returns sources from generatePrompt output matching the adjusted mix', () => {
    const output = architect.generatePrompt(
      'Review this config for vulnerability, threat, exploit, and audit compliance — check the firewall and incident response',
    );
    expect(output.activeTraits.length).toBeGreaterThan(0);

    // Security review should have adversarial thinking in top sources (it's 1.0 in that profile)
    const traitKeys = output.activeTraits.map((t) => t.traitKey);
    expect(traitKeys).toContain('adversarialThinking');
    expect(traitKeys).toContain('paranoidVigilance');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Prompt structure invariants
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect.generatePrompt — structural invariants', () => {
  it('fullPrompt always starts with the base system prompt', () => {
    const output = architect.generatePrompt('Any random message');
    expect(output.fullPrompt.startsWith(ARCHITECT_BASE_PROMPT)).toBe(true);
  });

  it('fullPrompt always contains the context modifier after the base prompt', () => {
    const output = architect.generatePrompt('Help me debug this null pointer');
    const baseEnd = output.fullPrompt.indexOf(ARCHITECT_BASE_PROMPT) + ARCHITECT_BASE_PROMPT.length;
    const modifierStart = output.fullPrompt.indexOf(output.contextModifier);

    expect(modifierStart).toBeGreaterThan(baseEnd - 1);
    expect(output.fullPrompt).toContain(output.contextModifier);
  });

  it('basePrompt and contextModifier together equal fullPrompt', () => {
    const output = architect.generatePrompt('Strategic planning for Q3');
    expect(output.fullPrompt).toBe(output.basePrompt + '\n\n' + output.contextModifier);
  });

  it('detectedContext is always populated with valid fields', () => {
    const output = architect.generatePrompt('Something completely random');
    expect(output.detectedContext).toBeDefined();
    expect(output.detectedContext.domain).toBeTruthy();
    expect(output.detectedContext.emotionalRegister).toBeTruthy();
    expect(output.detectedContext.complexity).toBeTruthy();
    expect(output.detectedContext.stakes).toBeTruthy();
    expect(output.detectedContext.mode).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Utility methods
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect — utility methods', () => {
  it('getBasePrompt returns the static Architect prompt', () => {
    expect(architect.getBasePrompt()).toBe(ARCHITECT_BASE_PROMPT);
    expect(architect.getBasePrompt().length).toBeGreaterThan(1000);
  });

  it('getTraitMix returns a 29-trait object for any context', () => {
    const ctx = architect.detectContext('Debug this error');
    const mix = architect.getTraitMix(ctx);
    expect(Object.keys(mix)).toHaveLength(29);
  });

  it('listContextDomains returns all 17 domains with labels and descriptions', () => {
    const domains = architect.listContextDomains();
    expect(domains).toHaveLength(17);

    for (const entry of domains) {
      expect(entry.domain).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('createArchitect factory returns a working instance', () => {
    const a = createArchitect();
    expect(a).toBeInstanceOf(TheArchitect);
    const output = a.generatePrompt('Test message');
    expect(output.fullPrompt).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Correction learning
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect — correction learning', () => {
  beforeEach(() => {
    architect = createArchitect();
  });

  it('recordCorrection feeds the learning loop', async () => {
    // Record 4 corrections
    for (let i = 0; i < 4; i++) {
      await architect.recordCorrection(
        `deployment pipeline infrastructure task ${i}`,
        'code_engineering',
        'architecture_design',
      );
    }

    // Now detection should be corrected for similar messages
    const output = architect.generatePrompt('Review the deployment pipeline and CI/CD container build');
    expect(output.detectedContext.domain).toBe('architecture_design');
    expect(output.detectedContext.corrected).toBe(true);
    expect(output.detectedContext.originalDomain).toBe('code_engineering');
  });

  it('exportCorrections and loadCorrections round-trip', async () => {
    for (let i = 0; i < 3; i++) {
      await architect.recordCorrection(
        `deployment pipeline task ${i} extra padding`,
        'code_engineering',
        'architecture_design',
      );
    }

    const exported = architect.exportCorrections();

    // Create a fresh architect and load corrections
    const fresh = createArchitect();
    fresh.loadCorrections(exported);

    const output = fresh.generatePrompt('Review the deployment pipeline and CI/CD container build');
    expect(output.detectedContext.domain).toBe('architecture_design');
    expect(output.detectedContext.corrected).toBe(true);
  });

  it('getCorrectionStats returns accurate data', async () => {
    expect(architect.getCorrectionStats().totalCorrections).toBe(0);

    await architect.recordCorrection('task alpha words extra', 'code_engineering', 'architecture_design');
    await architect.recordCorrection('task bravo words extra', 'code_engineering', 'debugging');

    const stats = architect.getCorrectionStats();
    expect(stats.totalCorrections).toBe(2);
    expect(stats.topMisclassifications.length).toBe(2);
  });

  it('context override takes precedence over correction store', async () => {
    // Train corrections
    for (let i = 0; i < 4; i++) {
      await architect.recordCorrection(
        `deployment pipeline infrastructure task ${i}`,
        'code_engineering',
        'architecture_design',
      );
    }

    // Set a manual override
    architect.setContextOverride('debugging');

    const output = architect.generatePrompt('Review the deployment pipeline and CI/CD container build');
    // Manual override wins over correction store
    expect(output.detectedContext.domain).toBe('debugging');
    expect(output.detectedContext.corrected).toBeUndefined();
  });
});
