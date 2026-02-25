import { describe, it, expect, beforeEach } from 'vitest';
import { CorrectionStore } from '../correction-store.js';
import type { ContextDomain, EmotionalRegister } from '../../schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCorrection(overrides: Partial<{
  userMessage: string;
  messageLength: number;
  detectedDomain: ContextDomain;
  correctedDomain: ContextDomain;
  detectedEmotion: EmotionalRegister;
}> = {}) {
  const userMessage = overrides.userMessage ?? 'review this deployment pipeline config';
  return {
    userMessage,
    messageLength: overrides.messageLength ?? userMessage.length,
    detectedDomain: overrides.detectedDomain ?? 'code_engineering' as ContextDomain,
    correctedDomain: overrides.correctedDomain ?? 'architecture_design' as ContextDomain,
    detectedEmotion: overrides.detectedEmotion ?? 'neutral' as EmotionalRegister,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CorrectionStore', () => {
  let store: CorrectionStore;

  beforeEach(() => {
    store = new CorrectionStore();
  });

  // ── addCorrection ────────────────────────────────────────────────────────

  describe('addCorrection', () => {
    it('stores correction with generated id and timestamp', () => {
      store.addCorrection(makeCorrection());

      const corrections = store.getCorrections();
      expect(corrections).toHaveLength(1);
      expect(corrections[0].id).toMatch(/^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/);
      expect(corrections[0].timestamp).toBeGreaterThan(0);
      expect(corrections[0].timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('preserves all provided fields', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'help with debugging this crash',
        detectedDomain: 'general',
        correctedDomain: 'debugging',
        detectedEmotion: 'frustrated',
      }));

      const c = store.getCorrections()[0];
      expect(c.userMessage).toBe('help with debugging this crash');
      expect(c.detectedDomain).toBe('general');
      expect(c.correctedDomain).toBe('debugging');
      expect(c.detectedEmotion).toBe('frustrated');
    });

    it('generates unique ids for multiple corrections', () => {
      store.addCorrection(makeCorrection());
      store.addCorrection(makeCorrection());

      const ids = store.getCorrections().map(c => c.id);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  // ── Keyword extraction ───────────────────────────────────────────────────

  describe('keyword extraction', () => {
    it('extracts keywords, lowercased, stopwords removed, words > 3 chars', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'Review the Security vulnerabilities in this deployment',
      }));

      const kw = store.getCorrections()[0].keywords;
      expect(kw).toContain('review');
      expect(kw).toContain('security');
      expect(kw).toContain('vulnerabilities');
      expect(kw).toContain('deployment');
      // "the" and "in" and "this" are stopwords or <= 3 chars
      expect(kw).not.toContain('the');
      expect(kw).not.toContain('in');
      expect(kw).not.toContain('this');
    });

    it('strips punctuation from keywords', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'Check (vulnerabilities), crash-dump analysis!',
      }));

      const kw = store.getCorrections()[0].keywords;
      expect(kw).toContain('vulnerabilities');
      expect(kw).toContain('analysis');
      // "check" is 5 chars and not a stopword
      expect(kw).toContain('check');
    });

    it('returns empty keywords for short/stopword-only messages', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'the to an is',
      }));

      expect(store.getCorrections()[0].keywords).toEqual([]);
    });
  });

  // ── Pattern recomputation ────────────────────────────────────────────────

  describe('pattern recomputation', () => {
    it('recomputes patterns on each addition', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'deployment pipeline configuration',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));

      expect(store.getPatterns().length).toBeGreaterThan(0);

      const before = store.getPatterns().length;
      store.addCorrection(makeCorrection({
        userMessage: 'scaling infrastructure horizontally',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));

      // Should have more patterns now (new keywords)
      expect(store.getPatterns().length).toBeGreaterThan(before);
    });

    it('groups patterns by keyword, fromDomain, toDomain', () => {
      // Same keyword "deployment" in two corrections with same from→to
      store.addCorrection(makeCorrection({
        userMessage: 'deployment pipeline review',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));
      store.addCorrection(makeCorrection({
        userMessage: 'deployment strategy analysis',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));

      const deploymentPatterns = store.getPatterns().filter(p => p.keyword === 'deployment');
      expect(deploymentPatterns).toHaveLength(1);
      expect(deploymentPatterns[0].occurrences).toBe(2);
    });

    it('calculates confidence correctly', () => {
      // 3 corrections all with "deployment", all code_engineering → architecture_design
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment task number ${i + 1} extra words padding`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }

      const pattern = store.getPatterns().find(
        p => p.keyword === 'deployment' && p.fromDomain === 'code_engineering',
      );
      expect(pattern).toBeDefined();
      // All 3 corrections containing "deployment" go code_engineering → architecture_design
      // confidence = 3 / 3 = 1.0
      expect(pattern!.confidence).toBe(1.0);
      expect(pattern!.occurrences).toBe(3);
    });

    it('returns patterns sorted by confidence descending', () => {
      // High-confidence pattern
      for (let i = 0; i < 4; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment scaling task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }
      // Lower confidence for "scaling" by adding a different correction
      store.addCorrection(makeCorrection({
        userMessage: 'scaling performance issue',
        detectedDomain: 'code_engineering',
        correctedDomain: 'debugging',
      }));

      const patterns = store.getPatterns();
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
      }
    });
  });

  // ── suggestCorrection ────────────────────────────────────────────────────

  describe('suggestCorrection', () => {
    it('returns corrected domain when confidence > 0.6 and occurrences >= 3', () => {
      // Add 3 identical corrections so keyword "deployment" has confidence 1.0 and occurrences 3
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment infrastructure task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }

      const suggestion = store.suggestCorrection(
        'check the deployment status',
        'code_engineering',
      );
      expect(suggestion).toBe('architecture_design');
    });

    it('returns null when insufficient data (occurrences < 3)', () => {
      // Only 2 corrections
      store.addCorrection(makeCorrection({
        userMessage: 'deployment infrastructure first',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));
      store.addCorrection(makeCorrection({
        userMessage: 'deployment infrastructure second',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));

      const suggestion = store.suggestCorrection(
        'check the deployment status',
        'code_engineering',
      );
      expect(suggestion).toBeNull();
    });

    it('returns null when confidence too low', () => {
      // 2 corrections: deployment → architecture_design
      store.addCorrection(makeCorrection({
        userMessage: 'deployment task alpha',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));
      store.addCorrection(makeCorrection({
        userMessage: 'deployment task bravo',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));
      // 2 corrections: deployment → debugging (dilutes confidence to 0.5)
      store.addCorrection(makeCorrection({
        userMessage: 'deployment task charlie',
        detectedDomain: 'code_engineering',
        correctedDomain: 'debugging',
      }));
      store.addCorrection(makeCorrection({
        userMessage: 'deployment task delta',
        detectedDomain: 'code_engineering',
        correctedDomain: 'debugging',
      }));

      // confidence for deployment: code_engineering → architecture_design is 2/4 = 0.5 (< 0.6)
      // confidence for deployment: code_engineering → debugging is 2/4 = 0.5 (< 0.6)
      const suggestion = store.suggestCorrection(
        'deployment issue',
        'code_engineering',
      );
      expect(suggestion).toBeNull();
    });

    it('returns null when detected domain does not match any pattern', () => {
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment infrastructure task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }

      // Ask about debugging, not code_engineering
      const suggestion = store.suggestCorrection(
        'deployment has bugs',
        'debugging',
      );
      expect(suggestion).toBeNull();
    });

    it('returns null for messages with no extractable keywords', () => {
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment infrastructure task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }

      const suggestion = store.suggestCorrection('the to an', 'code_engineering');
      expect(suggestion).toBeNull();
    });

    it('picks the highest-confidence pattern when multiple match', () => {
      // 5 corrections with "deployment" → architecture_design
      for (let i = 0; i < 5; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment scaling review task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }
      // 3 corrections with "scaling" → strategic_planning (different toDomain)
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `scaling capacity plan ${i} extra padding`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'strategic_planning',
        }));
      }

      // "deployment" appears in 5 corrections total → architecture_design has confidence 5/5 = 1.0
      // "scaling" appears in 8 corrections total → architecture_design has 5/8 = 0.625, strategic_planning has 3/8 = 0.375
      // So the highest-confidence match for "deployment scaling review" with from=code_engineering
      // is deployment → architecture_design (confidence 1.0)
      const suggestion = store.suggestCorrection(
        'deployment scaling review',
        'code_engineering',
      );
      expect(suggestion).toBe('architecture_design');
    });
  });

  // ── serialize / deserialize ──────────────────────────────────────────────

  describe('serialize / deserialize', () => {
    it('round-trips correctly', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'deployment pipeline configuration',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
        detectedEmotion: 'stressed',
      }));
      store.addCorrection(makeCorrection({
        userMessage: 'crash dump analysis needed',
        detectedDomain: 'general',
        correctedDomain: 'debugging',
      }));

      const serialized = store.serialize();
      const restored = CorrectionStore.deserialize(serialized);

      expect(restored.getCorrections()).toEqual(store.getCorrections());
      expect(restored.getPatterns()).toEqual(store.getPatterns());
    });

    it('preserves all correction fields through serialization', () => {
      store.addCorrection(makeCorrection({
        userMessage: 'security vulnerability scanning',
        detectedDomain: 'code_engineering',
        correctedDomain: 'security_review',
        detectedEmotion: 'frustrated',
      }));

      const restored = CorrectionStore.deserialize(store.serialize());
      const c = restored.getCorrections()[0];

      expect(c.userMessage).toBe('security vulnerability scanning');
      expect(c.detectedDomain).toBe('code_engineering');
      expect(c.correctedDomain).toBe('security_review');
      expect(c.detectedEmotion).toBe('frustrated');
      expect(c.keywords).toContain('security');
      expect(c.keywords).toContain('vulnerability');
      expect(c.keywords).toContain('scanning');
      expect(c.id).toBeTruthy();
      expect(c.timestamp).toBeGreaterThan(0);
    });

    it('deserialized store can suggest corrections', () => {
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment infrastructure task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }

      const restored = CorrectionStore.deserialize(store.serialize());
      const suggestion = restored.suggestCorrection(
        'check the deployment status',
        'code_engineering',
      );
      expect(suggestion).toBe('architecture_design');
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all corrections and patterns', () => {
      store.addCorrection(makeCorrection());
      store.addCorrection(makeCorrection());
      expect(store.getCorrections()).toHaveLength(2);
      expect(store.getPatterns().length).toBeGreaterThan(0);

      store.clear();

      expect(store.getCorrections()).toEqual([]);
      expect(store.getPatterns()).toEqual([]);
    });

    it('cleared store returns null for suggestions', () => {
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `deployment infrastructure task ${i}`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }

      store.clear();

      const suggestion = store.suggestCorrection(
        'deployment status',
        'code_engineering',
      );
      expect(suggestion).toBeNull();
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns accurate totalCorrections count', () => {
      expect(store.getStats().totalCorrections).toBe(0);

      store.addCorrection(makeCorrection());
      store.addCorrection(makeCorrection());
      store.addCorrection(makeCorrection());

      expect(store.getStats().totalCorrections).toBe(3);
    });

    it('returns top misclassifications sorted by count', () => {
      // 3 corrections: code_engineering → architecture_design
      for (let i = 0; i < 3; i++) {
        store.addCorrection(makeCorrection({
          userMessage: `task alpha ${i} padding words`,
          detectedDomain: 'code_engineering',
          correctedDomain: 'architecture_design',
        }));
      }
      // 1 correction: general → debugging
      store.addCorrection(makeCorrection({
        userMessage: 'crash dump analysis needed',
        detectedDomain: 'general',
        correctedDomain: 'debugging',
      }));

      const stats = store.getStats();
      expect(stats.topMisclassifications[0]).toEqual({
        from: 'code_engineering',
        to: 'architecture_design',
        count: 3,
      });
      expect(stats.topMisclassifications[1]).toEqual({
        from: 'general',
        to: 'debugging',
        count: 1,
      });
    });

    it('returns correctionRate per detected domain', () => {
      // 2 corrections for code_engineering
      store.addCorrection(makeCorrection({
        userMessage: 'task alpha padding words extra',
        detectedDomain: 'code_engineering',
        correctedDomain: 'architecture_design',
      }));
      store.addCorrection(makeCorrection({
        userMessage: 'task bravo padding words extra',
        detectedDomain: 'code_engineering',
        correctedDomain: 'debugging',
      }));
      // 1 correction for general
      store.addCorrection(makeCorrection({
        userMessage: 'some random general correction',
        detectedDomain: 'general',
        correctedDomain: 'debugging',
      }));

      const stats = store.getStats();
      // code_engineering detected 2 times, corrected 2 times → rate 1.0
      expect(stats.correctionRate['code_engineering']).toBe(1.0);
      // general detected 1 time, corrected 1 time → rate 1.0
      expect(stats.correctionRate['general']).toBe(1.0);
    });

    it('returns empty stats when no corrections', () => {
      const stats = store.getStats();
      expect(stats.totalCorrections).toBe(0);
      expect(stats.topMisclassifications).toEqual([]);
      expect(stats.correctionRate).toEqual({});
    });
  });
});
