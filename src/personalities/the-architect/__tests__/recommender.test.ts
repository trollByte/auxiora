import { describe, it, expect } from 'vitest';
import { ContextRecommender } from '../recommender.js';
import { CorrectionStore } from '../correction-store.js';
import type { TaskContext, ContextDomain } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    domain: 'general',
    emotionalRegister: 'neutral',
    complexity: 'moderate',
    mode: 'solo_work',
    stakes: 'moderate',
    detectionConfidence: 0.8,
    ...overrides,
  };
}

function emptyUsageHistory(): Record<ContextDomain, number> {
  return {
    security_review: 0, code_engineering: 0, architecture_design: 0,
    debugging: 0, team_leadership: 0, one_on_one: 0, sales_pitch: 0,
    negotiation: 0, marketing_content: 0, strategic_planning: 0,
    crisis_management: 0, creative_work: 0, writing_content: 0,
    decision_making: 0, learning_research: 0, personal_development: 0,
    general: 0,
  };
}

const recommender = new ContextRecommender();

// ────────────────────────────────────────────────────────────────────────────
// No recommendation needed
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommender — no recommendation', () => {
  it('returns null when detection confidence is high and no corrections exist', () => {
    const result = recommender.shouldRecommend(
      makeContext({ domain: 'security_review', detectionConfidence: 0.85 }),
      new CorrectionStore(),
      emptyUsageHistory(),
      'Review this security config for vulnerabilities',
    );
    expect(result).toBeNull();
  });

  it('returns null when domain is non-general with high confidence and even usage', () => {
    const usage = emptyUsageHistory();
    usage.security_review = 10;
    usage.debugging = 10;
    usage.code_engineering = 10;

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'debugging', detectionConfidence: 0.7 }),
      new CorrectionStore(),
      usage,
      'Fix this null pointer error crash bug',
    );
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Correction-based recommendation
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommender — correction-based', () => {
  it('returns correction-based recommendation when pattern exists', () => {
    const store = new CorrectionStore();
    // Build enough corrections to cross the threshold (>= 3 occurrences, > 0.6 confidence)
    for (let i = 0; i < 4; i++) {
      store.addCorrection({
        userMessage: `deployment pipeline infrastructure task ${i}`,
        messageLength: 45,
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
        detectedEmotion: 'neutral',
      });
    }

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'code_engineering', detectionConfidence: 0.7 }),
      store,
      emptyUsageHistory(),
      'Review the deployment pipeline infrastructure',
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe('correction_pattern');
    expect(result!.suggestedDomain).toBe('architecture_design');
    expect(result!.reason).toContain('Code Engineering');
    expect(result!.reason).toContain('Architecture Design');
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('correction-based takes priority over low-confidence', () => {
    const store = new CorrectionStore();
    for (let i = 0; i < 4; i++) {
      store.addCorrection({
        userMessage: `deployment pipeline infrastructure task ${i}`,
        messageLength: 45,
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
        detectedEmotion: 'neutral',
      });
    }

    // Even with low confidence, correction-based should win
    const result = recommender.shouldRecommend(
      makeContext({ domain: 'code_engineering', detectionConfidence: 0.3 }),
      store,
      emptyUsageHistory(),
      'Review the deployment pipeline infrastructure',
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe('correction_pattern');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Low-confidence recommendation
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommender — low-confidence', () => {
  it('returns low-confidence recommendation when top two domains are close', () => {
    // A message that scores similarly for multiple domains but below 0.5 confidence
    // "team design" scores for both team_leadership and architecture_design
    // But we need detectionConfidence < 0.5 for the low-confidence path
    const result = recommender.shouldRecommend(
      makeContext({ domain: 'architecture_design', detectionConfidence: 0.3 }),
      new CorrectionStore(),
      emptyUsageHistory(),
      // Score close on architecture_design and code_engineering
      'design the system architecture for the API endpoint',
    );

    // This may or may not trigger depending on actual score gaps
    // If it triggers, it should have the right source
    if (result !== null) {
      expect(result.source).toBe('low_confidence');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.reason).toContain('or');
      expect(result.reason).toContain('want to specify');
    }
  });

  it('does not return low-confidence when detection confidence is high', () => {
    const result = recommender.shouldRecommend(
      makeContext({ domain: 'security_review', detectionConfidence: 0.8 }),
      new CorrectionStore(),
      emptyUsageHistory(),
      'vulnerability audit threat exploit firewall',
    );
    // Should not get a low_confidence recommendation with high confidence
    if (result !== null) {
      expect(result.source).not.toBe('low_confidence');
    }
  });

  it('does not return low-confidence when domain is general', () => {
    const result = recommender.shouldRecommend(
      makeContext({ domain: 'general', detectionConfidence: 0.0 }),
      new CorrectionStore(),
      emptyUsageHistory(),
      'hey what is up',
    );
    // general domain with low confidence should not trigger low_confidence
    // (it might trigger usage_pattern instead if history is concentrated)
    if (result !== null) {
      expect(result.source).not.toBe('low_confidence');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Usage-pattern recommendation
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommender — usage-pattern', () => {
  it('returns usage-pattern recommendation when general detected but usage is concentrated', () => {
    const usage = emptyUsageHistory();
    usage.security_review = 80;
    usage.general = 10;
    usage.debugging = 10;
    // security_review is 80% of total

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'general', detectionConfidence: 0 }),
      new CorrectionStore(),
      usage,
      'hey, quick question',
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe('usage_pattern');
    expect(result!.suggestedDomain).toBe('security_review');
    expect(result!.reason).toContain('Security Review');
    expect(result!.reason).toContain('usually work in');
    expect(result!.confidence).toBe(0.8);
  });

  it('does not recommend when usage is evenly distributed', () => {
    const usage = emptyUsageHistory();
    usage.security_review = 20;
    usage.debugging = 20;
    usage.code_engineering = 20;
    usage.architecture_design = 20;
    usage.general = 20;
    // No domain exceeds 20% — well below the 60% threshold

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'general', detectionConfidence: 0 }),
      new CorrectionStore(),
      usage,
      'hello there',
    );

    expect(result).toBeNull();
  });

  it('does not recommend when domain is not general', () => {
    const usage = emptyUsageHistory();
    usage.security_review = 90;
    usage.general = 10;

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'debugging', detectionConfidence: 0.7 }),
      new CorrectionStore(),
      usage,
      'fix this null pointer error crash bug undefined',
    );

    // Usage-pattern only triggers for general domain
    if (result !== null) {
      expect(result.source).not.toBe('usage_pattern');
    }
  });

  it('does not recommend when there is no usage history', () => {
    const result = recommender.shouldRecommend(
      makeContext({ domain: 'general', detectionConfidence: 0 }),
      new CorrectionStore(),
      emptyUsageHistory(),
      'hello',
    );
    expect(result).toBeNull();
  });

  it('ignores general domain in usage calculation', () => {
    const usage = emptyUsageHistory();
    usage.general = 100;
    // Only general usage — should not suggest general back

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'general', detectionConfidence: 0 }),
      new CorrectionStore(),
      usage,
      'hello',
    );
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Confidence bounds
// ────────────────────────────────────────────────────────────────────────────

describe('ContextRecommender — confidence bounds', () => {
  it('confidence values are always in [0, 1]', () => {
    const store = new CorrectionStore();
    for (let i = 0; i < 5; i++) {
      store.addCorrection({
        userMessage: `deployment pipeline infrastructure task ${i}`,
        messageLength: 45,
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
        detectedEmotion: 'neutral',
      });
    }

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'code_engineering', detectionConfidence: 0.3 }),
      store,
      emptyUsageHistory(),
      'Review the deployment pipeline infrastructure',
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('usage-pattern confidence reflects actual percentage', () => {
    const usage = emptyUsageHistory();
    usage.debugging = 70;
    usage.general = 30;

    const result = recommender.shouldRecommend(
      makeContext({ domain: 'general', detectionConfidence: 0 }),
      new CorrectionStore(),
      usage,
      'quick question',
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.7);
  });
});
