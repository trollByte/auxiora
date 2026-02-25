import { describe, it, expect, beforeEach } from 'vitest';
import { UserModelSynthesizer } from '../user-model-synthesizer.js';
import type { UserModel } from '../user-model-synthesizer.js';
import { PreferenceHistory } from '../preference-history.js';
import { DecisionLog } from '../decision-log.js';
import { FeedbackStore } from '../feedback-store.js';
import { CorrectionStore } from '../correction-store.js';
import { TheArchitect } from '../index.js';
import type { ArchitectPreferences } from '../persistence.js';
import type { ContextDomain } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makePreferences(overrides: Partial<ArchitectPreferences> = {}): ArchitectPreferences {
  return {
    corrections: '{"corrections":[],"patterns":[]}',
    showContextIndicator: true,
    showSourcesButton: true,
    autoDetectContext: true,
    defaultContext: null,
    contextUsageHistory: {} as Record<ContextDomain, number>,
    totalInteractions: 0,
    firstUsed: 0,
    lastUsed: 0,
    version: 2,
    ...overrides,
  };
}

function makeSynthesizer(opts: {
  preferenceHistory?: PreferenceHistory;
  decisionLog?: DecisionLog;
  feedbackStore?: FeedbackStore;
  correctionStore?: CorrectionStore;
  preferences?: ArchitectPreferences;
} = {}): UserModelSynthesizer {
  return new UserModelSynthesizer({
    preferenceHistory: opts.preferenceHistory ?? new PreferenceHistory(),
    decisionLog: opts.decisionLog ?? new DecisionLog(),
    feedbackStore: opts.feedbackStore ?? new FeedbackStore(),
    correctionStore: opts.correctionStore ?? new CorrectionStore(),
    preferences: opts.preferences,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('UserModelSynthesizer', () => {
  // ── 1. Empty stores ───────────────────────────────────────────────────

  describe('empty stores', () => {
    it('returns empty topDomains and zero totalInteractions', () => {
      const model = makeSynthesizer().synthesize();
      expect(model.topDomains).toEqual([]);
      expect(model.totalInteractions).toBe(0);
    });

    it('all labels are balanced', () => {
      const model = makeSynthesizer().synthesize();
      expect(model.communicationStyle.verbosityLabel).toBe('balanced');
      expect(model.communicationStyle.toneLabel).toBe('balanced');
    });

    it('narrative contains "new user"', () => {
      const model = makeSynthesizer().synthesize();
      expect(model.narrative).toContain('new user');
    });

    it('sets synthesizedAt to current time', () => {
      const before = Date.now();
      const model = makeSynthesizer().synthesize();
      expect(model.synthesizedAt).toBeGreaterThanOrEqual(before);
      expect(model.synthesizedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  // ── 2. Domain profiles ────────────────────────────────────────────────

  describe('domain profiles', () => {
    it('sorts descending by count and limits to top 5', () => {
      const prefs = makePreferences({
        contextUsageHistory: {
          security_review: 20,
          code_engineering: 50,
          debugging: 30,
          architecture_design: 10,
          team_leadership: 5,
          creative_work: 3,
        } as Record<ContextDomain, number>,
        totalInteractions: 118,
      });

      const model = makeSynthesizer({ preferences: prefs }).synthesize();

      expect(model.topDomains).toHaveLength(5);
      expect(model.topDomains[0].domain).toBe('code_engineering');
      expect(model.topDomains[1].domain).toBe('debugging');
      expect(model.topDomains[2].domain).toBe('security_review');
      // 6th domain (creative_work: 3) excluded
      expect(model.topDomains.map(d => d.domain)).not.toContain('creative_work');
    });

    it('share values sum to <= 1.0', () => {
      const prefs = makePreferences({
        contextUsageHistory: {
          code_engineering: 60,
          debugging: 40,
        } as Record<ContextDomain, number>,
        totalInteractions: 100,
      });

      const model = makeSynthesizer({ preferences: prefs }).synthesize();
      const totalShare = model.topDomains.reduce((sum, d) => sum + d.share, 0);
      expect(totalShare).toBeCloseTo(1.0, 5);
    });

    it('excludes domains with zero count', () => {
      const prefs = makePreferences({
        contextUsageHistory: {
          code_engineering: 10,
          debugging: 0,
        } as Record<ContextDomain, number>,
        totalInteractions: 10,
      });

      const model = makeSynthesizer({ preferences: prefs }).synthesize();
      expect(model.topDomains).toHaveLength(1);
      expect(model.topDomains[0].domain).toBe('code_engineering');
    });
  });

  // ── 3. Per-domain satisfaction ────────────────────────────────────────

  describe('per-domain satisfaction', () => {
    it('computes satisfactionRate as helpful / total', () => {
      const feedbackStore = new FeedbackStore();
      feedbackStore.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: {} });
      feedbackStore.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: {} });
      feedbackStore.addFeedback({ domain: 'debugging', rating: 'off_target', traitSnapshot: {} });

      const prefs = makePreferences({
        contextUsageHistory: { debugging: 10 } as Record<ContextDomain, number>,
        totalInteractions: 10,
      });

      const model = makeSynthesizer({ feedbackStore, preferences: prefs }).synthesize();
      const debugProfile = model.topDomains.find(d => d.domain === 'debugging')!;
      expect(debugProfile.satisfactionRate).toBeCloseTo(2 / 3, 5);
      expect(debugProfile.feedbackCount).toBe(3);
    });

    it('returns null satisfactionRate when no feedback for domain', () => {
      const prefs = makePreferences({
        contextUsageHistory: { code_engineering: 5 } as Record<ContextDomain, number>,
        totalInteractions: 5,
      });

      const model = makeSynthesizer({ preferences: prefs }).synthesize();
      const profile = model.topDomains[0];
      expect(profile.satisfactionRate).toBeNull();
      expect(profile.feedbackCount).toBe(0);
    });
  });

  // ── 4. Communication style ────────────────────────────────────────────

  describe('communication style', () => {
    it('positive verbosity offset maps to detailed', () => {
      const prefHistory = new PreferenceHistory();
      prefHistory.record({ trait: 'verbosity', offset: 0.2, context: null, source: 'user' });

      const model = makeSynthesizer({ preferenceHistory: prefHistory }).synthesize();
      expect(model.communicationStyle.verbosityLabel).toBe('detailed');
      expect(model.communicationStyle.verbosityPreference).toBeCloseTo(0.2, 2);
    });

    it('negative warmth offset maps to analytical', () => {
      const prefHistory = new PreferenceHistory();
      prefHistory.record({ trait: 'warmth', offset: -0.2, context: null, source: 'user' });

      const model = makeSynthesizer({ preferenceHistory: prefHistory }).synthesize();
      expect(model.communicationStyle.toneLabel).toBe('analytical');
    });

    it('incorporates feedback-suggested adjustments', () => {
      const feedbackStore = new FeedbackStore();
      // Add 5+ too_verbose feedbacks to trigger verbosity adjustment
      for (let i = 0; i < 6; i++) {
        feedbackStore.addFeedback({ domain: 'general', rating: 'too_verbose', traitSnapshot: {} });
      }

      const model = makeSynthesizer({ feedbackStore }).synthesize();
      // Feedback suggests lowering verbosity, so total should be negative
      expect(model.communicationStyle.verbosityPreference).toBeLessThan(0);
      expect(model.communicationStyle.verbosityLabel).toBe('concise');
    });
  });

  // ── 5. Satisfaction profile ───────────────────────────────────────────

  describe('satisfaction profile', () => {
    it('surfaces weakDomains from feedback insights', () => {
      const feedbackStore = new FeedbackStore();
      // 3+ off_target in debugging triggers weak domain
      for (let i = 0; i < 4; i++) {
        feedbackStore.addFeedback({ domain: 'debugging', rating: 'off_target', traitSnapshot: {} });
      }

      const model = makeSynthesizer({ feedbackStore }).synthesize();
      expect(model.satisfaction.weakDomains).toContain('debugging');
    });

    it('strongDomains need >80% helpful with >=3 entries', () => {
      const feedbackStore = new FeedbackStore();
      // 4 helpful + 0 negative = 100% > 80%, and 4 >= 3
      for (let i = 0; i < 4; i++) {
        feedbackStore.addFeedback({ domain: 'security_review', rating: 'helpful', traitSnapshot: {} });
      }

      const prefs = makePreferences({
        contextUsageHistory: { security_review: 20 } as Record<ContextDomain, number>,
        totalInteractions: 20,
      });

      const model = makeSynthesizer({ feedbackStore, preferences: prefs }).synthesize();
      expect(model.satisfaction.strongDomains).toContain('security_review');
    });

    it('does not include domain with <=80% helpful as strong', () => {
      const feedbackStore = new FeedbackStore();
      // 2 helpful + 1 off_target = 66.7% <= 80%
      feedbackStore.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: {} });
      feedbackStore.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: {} });
      feedbackStore.addFeedback({ domain: 'debugging', rating: 'off_target', traitSnapshot: {} });

      const prefs = makePreferences({
        contextUsageHistory: { debugging: 10 } as Record<ContextDomain, number>,
        totalInteractions: 10,
      });

      const model = makeSynthesizer({ feedbackStore, preferences: prefs }).synthesize();
      expect(model.satisfaction.strongDomains).not.toContain('debugging');
    });
  });

  // ── 6. Active decisions ───────────────────────────────────────────────

  describe('active decisions', () => {
    it('includes active and revisit statuses only', () => {
      const log = new DecisionLog();
      log.addDecision({ domain: 'code_engineering', summary: 'Use Vite', context: 'Build tool decision', status: 'active' });
      log.addDecision({ domain: 'debugging', summary: 'Fix memory leak', context: 'Performance', status: 'revisit' });
      log.addDecision({ domain: 'general', summary: 'Old decision', context: 'Done', status: 'completed' });
      log.addDecision({ domain: 'general', summary: 'Dropped idea', context: 'N/A', status: 'abandoned' });

      const model = makeSynthesizer({ decisionLog: log }).synthesize();
      expect(model.activeDecisions).toHaveLength(2);
      const statuses = model.activeDecisions.map(d => d.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('revisit');
      expect(statuses).not.toContain('completed');
      expect(statuses).not.toContain('abandoned');
    });
  });

  // ── 7. Due follow-ups ────────────────────────────────────────────────

  describe('due follow-ups', () => {
    it('includes decisions with past followUpDate', () => {
      const log = new DecisionLog();
      const d = log.addDecision({
        domain: 'architecture_design',
        summary: 'Evaluate microservices',
        context: 'Architecture review',
        status: 'active',
        followUpDate: Date.now() - 1000, // in the past
      });

      const model = makeSynthesizer({ decisionLog: log }).synthesize();
      expect(model.dueFollowUps).toHaveLength(1);
      expect(model.dueFollowUps[0].id).toBe(d.id);
    });

    it('excludes decisions with future followUpDate', () => {
      const log = new DecisionLog();
      log.addDecision({
        domain: 'code_engineering',
        summary: 'Future task',
        context: 'Not yet',
        status: 'active',
        followUpDate: Date.now() + 100_000,
      });

      const model = makeSynthesizer({ decisionLog: log }).synthesize();
      expect(model.dueFollowUps).toHaveLength(0);
    });
  });

  // ── 8. Preference conflicts ──────────────────────────────────────────

  describe('preference conflicts', () => {
    it('surfaces opposing offsets for the same trait', () => {
      const prefHistory = new PreferenceHistory();
      prefHistory.record({ trait: 'warmth', offset: 0.2, context: null, source: 'user', reason: 'warmer' });
      prefHistory.record({ trait: 'warmth', offset: -0.1, context: null, source: 'preset', reason: 'analytical preset' });

      const model = makeSynthesizer({ preferenceHistory: prefHistory }).synthesize();
      expect(model.preferenceConflicts).toHaveLength(1);
      expect(model.preferenceConflicts[0].trait).toBe('warmth');
    });
  });

  // ── 9. Correction summary ────────────────────────────────────────────

  describe('correction summary', () => {
    it('limits topPatterns to 3', () => {
      const store = new CorrectionStore();
      // Create 4 distinct correction patterns
      const domains: ContextDomain[] = ['code_engineering', 'debugging', 'security_review', 'architecture_design'];
      for (let i = 0; i < domains.length; i++) {
        store.addCorrection({
          userMessage: `test message about ${domains[i]} topic keywords here`,
          messageLength: 40,
          detectedDomain: 'general',
          correctedDomain: domains[i],
          detectedEmotion: 'neutral',
        });
      }

      const model = makeSynthesizer({ correctionStore: store }).synthesize();
      expect(model.correctionSummary.topPatterns.length).toBeLessThanOrEqual(3);
      expect(model.correctionSummary.totalCorrections).toBe(4);
    });
  });

  // ── 10. Narrative generation ──────────────────────────────────────────

  describe('narrative generation', () => {
    it('says "new user" for zero interactions', () => {
      const model = makeSynthesizer().synthesize();
      expect(model.narrative).toContain('new user');
    });

    it('says "just getting started" for < 5 interactions', () => {
      const prefs = makePreferences({
        totalInteractions: 3,
        contextUsageHistory: { general: 3 } as Record<ContextDomain, number>,
      });
      const model = makeSynthesizer({ preferences: prefs }).synthesize();
      expect(model.narrative).toContain('just getting started');
    });

    it('says "primarily works in" for single top domain', () => {
      const prefs = makePreferences({
        totalInteractions: 50,
        contextUsageHistory: { security_review: 50 } as Record<ContextDomain, number>,
      });
      const model = makeSynthesizer({ preferences: prefs }).synthesize();
      expect(model.narrative).toContain('primarily works in');
      expect(model.narrative).toContain('security review');
    });

    it('says "focuses on" for multiple top domains', () => {
      const prefs = makePreferences({
        totalInteractions: 100,
        contextUsageHistory: {
          code_engineering: 40,
          debugging: 35,
          security_review: 25,
        } as Record<ContextDomain, number>,
      });
      const model = makeSynthesizer({ preferences: prefs }).synthesize();
      expect(model.narrative).toContain('focuses on');
    });

    it('mentions declining recalibration when trend is declining', () => {
      const feedbackStore = new FeedbackStore();
      // First half: helpful, second half: off_target → declining trend
      for (let i = 0; i < 5; i++) {
        feedbackStore.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: {} });
      }
      for (let i = 0; i < 5; i++) {
        feedbackStore.addFeedback({ domain: 'general', rating: 'off_target', traitSnapshot: {} });
      }

      const model = makeSynthesizer({ feedbackStore }).synthesize();
      expect(model.narrative).toContain('declining');
      expect(model.narrative).toContain('recalibration');
    });

    it('mentions active decision threads', () => {
      const log = new DecisionLog();
      log.addDecision({ domain: 'code_engineering', summary: 'Choose ORM', context: 'DB layer', status: 'active' });
      log.addDecision({ domain: 'debugging', summary: 'Fix leak', context: 'Perf', status: 'active' });

      const prefs = makePreferences({ totalInteractions: 10 });

      const model = makeSynthesizer({ decisionLog: log, preferences: prefs }).synthesize();
      expect(model.narrative).toContain('2 active decision threads');
    });
  });

  // ── 11. TheArchitect integration ──────────────────────────────────────

  describe('TheArchitect integration', () => {
    // This test exercises the synthesizer through TheArchitect, imported dynamically
    // to avoid circular dependency issues in the test file.

    it('getUserModel() returns data reflecting recorded state', async () => {
      const architect = new TheArchitect();

      // Record some feedback
      await architect.recordFeedback({ domain: 'debugging', rating: 'helpful' });
      await architect.recordFeedback({ domain: 'debugging', rating: 'helpful' });

      const model = architect.getUserModel();
      expect(model).toBeDefined();
      expect(model.synthesizedAt).toBeGreaterThan(0);
      expect(model.satisfaction.totalFeedback).toBe(2);
      expect(model.narrative).toBeTruthy();
    });

    it('generatePrompt() does NOT include userModel', () => {
      const architect = new TheArchitect();
      const output = architect.generatePrompt('Hello world');
      expect(output).not.toHaveProperty('userModel');
    });
  });
});
