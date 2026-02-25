import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackStore } from '../feedback-store.js';
import type { FeedbackEntry } from '../feedback-store.js';
import type { ContextDomain, TraitMix } from '../../schema.js';

describe('FeedbackStore', () => {
  let store: FeedbackStore;

  const snapshot: Partial<Record<keyof TraitMix, number>> = {
    warmth: 0.6,
    verbosity: 0.5,
    humor: 0.3,
  };

  beforeEach(() => {
    store = new FeedbackStore();
  });

  // ── addFeedback ─────────────────────────────────────────────────────────

  describe('addFeedback', () => {
    it('generates id and timestamp', () => {
      store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });

      const entries = store.getForDomain('general');
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(entries[0].timestamp).toBeGreaterThan(0);
      expect(entries[0].domain).toBe('general');
      expect(entries[0].rating).toBe('helpful');
    });

    it('preserves optional note', () => {
      store.addFeedback({
        domain: 'debugging',
        rating: 'too_verbose',
        traitSnapshot: snapshot,
        note: 'Way too long',
      });

      const entries = store.getForDomain('debugging');
      expect(entries[0].note).toBe('Way too long');
    });

    it('enforces maxEntries (500) capacity by dropping oldest', () => {
      for (let i = 0; i < 510; i++) {
        store.addFeedback({
          domain: 'general',
          rating: 'helpful',
          traitSnapshot: { warmth: i / 510 },
        });
      }

      const insights = store.getInsights();
      expect(insights.totalFeedback).toBe(500);

      // The first 10 entries should have been dropped, so the first
      // remaining entry should have warmth close to 10/510
      const entries = store.getForDomain('general');
      expect(entries[0].traitSnapshot.warmth).toBeCloseTo(10 / 510, 5);
    });
  });

  // ── getInsights ─────────────────────────────────────────────────────────

  describe('getInsights', () => {
    it('returns sensible defaults for empty store', () => {
      const insights = store.getInsights();

      expect(insights.suggestedAdjustments).toEqual({});
      expect(insights.weakDomains).toEqual([]);
      expect(insights.trend).toBe('stable');
      expect(insights.totalFeedback).toBe(0);
    });

    it('suggests lowering verbosity for too_verbose feedback (>= 5)', () => {
      for (let i = 0; i < 5; i++) {
        store.addFeedback({ domain: 'general', rating: 'too_verbose', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.verbosity).toBe(-0.3); // -0.1 * 5 = -0.5, capped at -0.3
    });

    it('does not suggest verbosity adjustment below threshold (< 5)', () => {
      for (let i = 0; i < 4; i++) {
        store.addFeedback({ domain: 'general', rating: 'too_verbose', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.verbosity).toBeUndefined();
    });

    it('caps too_verbose adjustment at -0.3', () => {
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'too_verbose', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.verbosity).toBe(-0.3);
    });

    it('suggests raising verbosity for too_brief feedback (>= 5)', () => {
      for (let i = 0; i < 5; i++) {
        store.addFeedback({ domain: 'general', rating: 'too_brief', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.verbosity).toBe(0.3); // 0.1 * 5 = 0.5, capped at 0.3
    });

    it('caps too_brief adjustment at +0.3', () => {
      for (let i = 0; i < 8; i++) {
        store.addFeedback({ domain: 'general', rating: 'too_brief', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.verbosity).toBe(0.3);
    });

    it('suggests warmth adjustment for wrong_tone feedback (>= 5)', () => {
      for (let i = 0; i < 6; i++) {
        store.addFeedback({ domain: 'general', rating: 'wrong_tone', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.warmth).toBe(0.1);
    });

    it('does not suggest warmth adjustment below threshold (< 5)', () => {
      for (let i = 0; i < 4; i++) {
        store.addFeedback({ domain: 'general', rating: 'wrong_tone', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.suggestedAdjustments.warmth).toBeUndefined();
    });

    it('flags off_target weak domains (>= 3 per domain)', () => {
      for (let i = 0; i < 3; i++) {
        store.addFeedback({ domain: 'debugging', rating: 'off_target', traitSnapshot: snapshot });
      }
      for (let i = 0; i < 2; i++) {
        store.addFeedback({ domain: 'security_review', rating: 'off_target', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.weakDomains).toContain('debugging');
      expect(insights.weakDomains).not.toContain('security_review');
    });

    it('detects improving trend', () => {
      // First half: mostly off_target
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'off_target', traitSnapshot: snapshot });
      }
      // Second half: mostly helpful
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.trend).toBe('improving');
    });

    it('detects declining trend', () => {
      // First half: mostly helpful
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      }
      // Second half: mostly off_target
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'off_target', traitSnapshot: snapshot });
      }

      const insights = store.getInsights();
      expect(insights.trend).toBe('declining');
    });

    it('detects stable trend when halves are similar', () => {
      // Even mix of helpful and off_target throughout
      for (let i = 0; i < 20; i++) {
        store.addFeedback({
          domain: 'general',
          rating: i % 2 === 0 ? 'helpful' : 'off_target',
          traitSnapshot: snapshot,
        });
      }

      const insights = store.getInsights();
      expect(insights.trend).toBe('stable');
    });
  });

  // ── getForDomain ────────────────────────────────────────────────────────

  describe('getForDomain', () => {
    it('filters entries by domain', () => {
      store.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: snapshot });
      store.addFeedback({ domain: 'security_review', rating: 'too_verbose', traitSnapshot: snapshot });
      store.addFeedback({ domain: 'debugging', rating: 'off_target', traitSnapshot: snapshot });

      const debugging = store.getForDomain('debugging');
      expect(debugging).toHaveLength(2);
      expect(debugging.every(e => e.domain === 'debugging')).toBe(true);

      const security = store.getForDomain('security_review');
      expect(security).toHaveLength(1);
    });

    it('returns empty array for domain with no entries', () => {
      store.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: snapshot });

      expect(store.getForDomain('creative_work')).toEqual([]);
    });
  });

  // ── getRecentTrend ──────────────────────────────────────────────────────

  describe('getRecentTrend', () => {
    it('uses default window size of 20', () => {
      // Add 30 entries: first 10 are noise, then 10 bad, then 10 good
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      }
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'off_target', traitSnapshot: snapshot });
      }
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      }

      // Last 20: first half off_target, second half helpful -> improving
      expect(store.getRecentTrend()).toBe('improving');
    });

    it('respects custom window size', () => {
      // Add 10 helpful then 10 off_target
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      }
      for (let i = 0; i < 10; i++) {
        store.addFeedback({ domain: 'general', rating: 'off_target', traitSnapshot: snapshot });
      }

      // Window of 10 over the last 10 (all off_target) -> stable (both halves 0)
      expect(store.getRecentTrend(10)).toBe('stable');

      // Window of 20 -> declining (first half helpful, second half off_target)
      expect(store.getRecentTrend(20)).toBe('declining');
    });

    it('returns stable for empty store', () => {
      expect(store.getRecentTrend()).toBe('stable');
    });

    it('returns stable for single entry', () => {
      store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      expect(store.getRecentTrend()).toBe('stable');
    });
  });

  // ── Serialization ───────────────────────────────────────────────────────

  describe('serialization', () => {
    it('round-trips correctly', () => {
      store.addFeedback({ domain: 'debugging', rating: 'helpful', traitSnapshot: snapshot, note: 'Great' });
      store.addFeedback({ domain: 'security_review', rating: 'too_verbose', traitSnapshot: { warmth: 0.8 } });

      const serialized = store.serialize();
      const restored = FeedbackStore.deserialize(serialized);

      expect(restored.getInsights().totalFeedback).toBe(2);

      const debugging = restored.getForDomain('debugging');
      expect(debugging).toHaveLength(1);
      expect(debugging[0].rating).toBe('helpful');
      expect(debugging[0].note).toBe('Great');

      const security = restored.getForDomain('security_review');
      expect(security).toHaveLength(1);
      expect(security[0].traitSnapshot.warmth).toBe(0.8);
    });

    it('deserializes empty entries gracefully', () => {
      const restored = FeedbackStore.deserialize(JSON.stringify({ entries: [] }));
      expect(restored.getInsights().totalFeedback).toBe(0);
    });

    it('handles corrupt/missing entries field', () => {
      const restored = FeedbackStore.deserialize(JSON.stringify({ foo: 'bar' }));
      expect(restored.getInsights().totalFeedback).toBe(0);
    });

    it('throws on completely invalid JSON', () => {
      expect(() => FeedbackStore.deserialize('not json')).toThrow();
    });
  });

  // ── clear ───────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('resets all state', () => {
      store.addFeedback({ domain: 'general', rating: 'helpful', traitSnapshot: snapshot });
      store.addFeedback({ domain: 'debugging', rating: 'off_target', traitSnapshot: snapshot });

      expect(store.getInsights().totalFeedback).toBe(2);

      store.clear();

      expect(store.getInsights().totalFeedback).toBe(0);
      expect(store.getForDomain('general')).toEqual([]);
      expect(store.getForDomain('debugging')).toEqual([]);
      expect(store.getInsights().trend).toBe('stable');
    });
  });
});
