import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreferenceHistory } from '../preference-history.js';
import type { TraitMix } from '../../schema.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let history: PreferenceHistory;

beforeEach(() => {
  history = new PreferenceHistory();
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// record — basic recording and capacity
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — record', () => {
  it('records an entry and retrieves it via getTraitHistory', () => {
    history.record({
      trait: 'warmth',
      offset: 0.2,
      context: null,
      source: 'user',
    });

    const entries = history.getTraitHistory('warmth');
    expect(entries).toHaveLength(1);
    expect(entries[0].trait).toBe('warmth');
    expect(entries[0].offset).toBe(0.2);
    expect(entries[0].source).toBe('user');
    expect(entries[0].timestamp).toBeGreaterThan(0);
  });

  it('assigns a timestamp automatically', () => {
    const before = Date.now();
    history.record({
      trait: 'humor',
      offset: -0.1,
      context: 'creative_work',
      source: 'feedback',
    });
    const after = Date.now();

    const entries = history.getTraitHistory('humor');
    expect(entries[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(entries[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('drops oldest entries when exceeding max capacity (200)', () => {
    for (let i = 0; i < 210; i++) {
      history.record({
        trait: 'warmth',
        offset: i * 0.001,
        context: null,
        source: 'user',
      });
    }

    const entries = history.getTraitHistory('warmth');
    expect(entries).toHaveLength(200);

    // The oldest 10 should have been dropped, so the smallest offset
    // remaining is 0.010 (index 10 of the original 210).
    const offsets = entries.map(e => e.offset).sort((a, b) => a - b);
    expect(offsets[0]).toBeCloseTo(0.01, 5);
  });

  it('stores optional reason field', () => {
    history.record({
      trait: 'urgency',
      offset: 0.15,
      context: null,
      source: 'user',
      reason: 'I prefer a faster pace',
    });

    const entries = history.getTraitHistory('urgency');
    expect(entries[0].reason).toBe('I prefer a faster pace');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getEffectiveOffset — context scoping
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — getEffectiveOffset (context)', () => {
  it('returns 0 when no entries exist for the trait', () => {
    expect(history.getEffectiveOffset('warmth')).toBe(0);
  });

  it('returns the most recent context-scoped entry when domain matches', () => {
    history.record({
      trait: 'adversarialThinking',
      offset: 0.1,
      context: 'security_review',
      source: 'user',
    });
    history.record({
      trait: 'adversarialThinking',
      offset: 0.25,
      context: 'security_review',
      source: 'user',
    });
    history.record({
      trait: 'adversarialThinking',
      offset: -0.1,
      context: null,
      source: 'preset',
    });

    // Context-scoped match should take precedence
    const offset = history.getEffectiveOffset(
      'adversarialThinking',
      'security_review',
    );
    expect(offset).toBe(0.25);
  });

  it('falls back to recency weighting when no context match', () => {
    history.record({
      trait: 'warmth',
      offset: 0.2,
      context: 'team_leadership',
      source: 'user',
    });

    // Query with a different domain — no context match, falls back to recency
    const offset = history.getEffectiveOffset('warmth', 'debugging');
    expect(offset).toBeCloseTo(0.2, 5);
  });

  it('falls back to recency weighting when no domain provided', () => {
    history.record({
      trait: 'humor',
      offset: 0.15,
      context: 'creative_work',
      source: 'user',
    });

    const offset = history.getEffectiveOffset('humor');
    expect(offset).toBeCloseTo(0.15, 5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getEffectiveOffset — recency weighting
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — getEffectiveOffset (recency)', () => {
  it('weights recent entries more heavily than older ones', () => {
    // Record two entries: older one positive, newer one negative
    // With recency weighting, the newer one should dominate
    const now = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now - 1000) // first record
      .mockReturnValueOnce(now)        // second record
      .mockReturnValueOnce(now);       // getEffectiveOffset call

    history.record({
      trait: 'warmth',
      offset: 0.3,
      context: null,
      source: 'user',
    });
    history.record({
      trait: 'warmth',
      offset: -0.2,
      context: null,
      source: 'feedback',
    });

    const offset = history.getEffectiveOffset('warmth');

    // Most recent (-0.2) gets weight 1.0, older (0.3) gets weight 0.8
    // weighted = (-0.2 * 1.0 + 0.3 * 0.8) / (1.0 + 0.8)
    //          = (-0.2 + 0.24) / 1.8 = 0.04 / 1.8 ≈ 0.0222
    expect(offset).toBeCloseTo(0.04 / 1.8, 5);
  });

  it('single entry returns its offset directly', () => {
    history.record({
      trait: 'stoicCalm',
      offset: 0.15,
      context: null,
      source: 'preset',
    });

    expect(history.getEffectiveOffset('stoicCalm')).toBeCloseTo(0.15, 5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getEffectiveOffset — time decay (30+ day old entries)
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — getEffectiveOffset (time decay)', () => {
  it('entries older than 30 days decay to 10% weight', () => {
    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(thirtyOneDaysAgo) // first record timestamp
      .mockReturnValueOnce(now)              // second record timestamp
      .mockReturnValueOnce(now);             // getEffectiveOffset call

    history.record({
      trait: 'humor',
      offset: 0.3,
      context: null,
      source: 'user',
    });
    history.record({
      trait: 'humor',
      offset: -0.1,
      context: null,
      source: 'feedback',
    });

    const offset = history.getEffectiveOffset('humor');

    // Recent (-0.1): recency weight 1.0, age weight 1.0 → weight = 1.0
    // Old (0.3): recency weight 0.8, age weight 0.1 → weight = 0.08
    // weighted = (-0.1 * 1.0 + 0.3 * 0.08) / (1.0 + 0.08)
    //          = (-0.1 + 0.024) / 1.08 = -0.076 / 1.08 ≈ -0.0704
    expect(offset).toBeCloseTo(-0.076 / 1.08, 4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// detectConflicts
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — detectConflicts', () => {
  it('finds opposing entries for the same trait', () => {
    history.record({
      trait: 'warmth',
      offset: 0.2,
      context: null,
      source: 'user',
    });
    history.record({
      trait: 'warmth',
      offset: -0.15,
      context: null,
      source: 'feedback',
    });

    const conflicts = history.detectConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].trait).toBe('warmth');
    expect(conflicts[0].entries).toHaveLength(2);
    expect(conflicts[0].strategy).toBe('recency');
    expect(typeof conflicts[0].resolution).toBe('number');
  });

  it('returns empty array when entries are all in the same direction', () => {
    history.record({
      trait: 'humor',
      offset: 0.1,
      context: null,
      source: 'user',
    });
    history.record({
      trait: 'humor',
      offset: 0.2,
      context: null,
      source: 'preset',
    });

    expect(history.detectConflicts()).toHaveLength(0);
  });

  it('returns empty array when no entries exist', () => {
    expect(history.detectConflicts()).toHaveLength(0);
  });

  it('detects conflicts for multiple traits independently', () => {
    history.record({ trait: 'warmth', offset: 0.2, context: null, source: 'user' });
    history.record({ trait: 'warmth', offset: -0.1, context: null, source: 'feedback' });
    history.record({ trait: 'humor', offset: 0.15, context: null, source: 'preset' });
    history.record({ trait: 'humor', offset: -0.05, context: null, source: 'user' });
    history.record({ trait: 'urgency', offset: 0.1, context: null, source: 'user' });
    history.record({ trait: 'urgency', offset: 0.2, context: null, source: 'preset' });

    const conflicts = history.detectConflicts();
    expect(conflicts).toHaveLength(2);

    const traits = conflicts.map(c => c.trait).sort();
    expect(traits).toEqual(['humor', 'warmth']);
  });

  it('does not flag traits with only one entry', () => {
    history.record({ trait: 'warmth', offset: 0.2, context: null, source: 'user' });
    expect(history.detectConflicts()).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getTraitHistory
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — getTraitHistory', () => {
  it('returns entries sorted most recent first', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now - 2000)
      .mockReturnValueOnce(now - 1000)
      .mockReturnValueOnce(now);

    history.record({ trait: 'warmth', offset: 0.1, context: null, source: 'user' });
    history.record({ trait: 'warmth', offset: 0.2, context: null, source: 'preset' });
    history.record({ trait: 'warmth', offset: 0.3, context: null, source: 'feedback' });

    const entries = history.getTraitHistory('warmth');
    expect(entries).toHaveLength(3);
    expect(entries[0].offset).toBe(0.3); // most recent
    expect(entries[1].offset).toBe(0.2);
    expect(entries[2].offset).toBe(0.1); // oldest
  });

  it('returns empty array for trait with no history', () => {
    expect(history.getTraitHistory('humor')).toHaveLength(0);
  });

  it('only returns entries for the requested trait', () => {
    history.record({ trait: 'warmth', offset: 0.1, context: null, source: 'user' });
    history.record({ trait: 'humor', offset: 0.2, context: null, source: 'user' });
    history.record({ trait: 'warmth', offset: 0.3, context: null, source: 'user' });

    const entries = history.getTraitHistory('warmth');
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.trait === 'warmth')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Serialization
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — serialize / deserialize', () => {
  it('round-trips correctly', () => {
    history.record({ trait: 'warmth', offset: 0.2, context: 'team_leadership', source: 'user' });
    history.record({ trait: 'humor', offset: -0.1, context: null, source: 'feedback', reason: 'too many jokes' });

    const serialized = history.serialize();
    const restored = PreferenceHistory.deserialize(serialized);

    const warmthEntries = restored.getTraitHistory('warmth');
    const humorEntries = restored.getTraitHistory('humor');

    expect(warmthEntries).toHaveLength(1);
    expect(warmthEntries[0].offset).toBe(0.2);
    expect(warmthEntries[0].context).toBe('team_leadership');

    expect(humorEntries).toHaveLength(1);
    expect(humorEntries[0].offset).toBe(-0.1);
    expect(humorEntries[0].reason).toBe('too many jokes');
  });

  it('deserialize of empty object returns empty history', () => {
    const restored = PreferenceHistory.deserialize('{}');
    expect(restored.getTraitHistory('warmth')).toHaveLength(0);
  });

  it('deserialize of corrupt data returns empty history', () => {
    const restored = PreferenceHistory.deserialize('not-valid-json!!!');
    expect(restored.getTraitHistory('warmth')).toHaveLength(0);
  });

  it('deserialize of empty string returns empty history', () => {
    const restored = PreferenceHistory.deserialize('');
    expect(restored.getTraitHistory('warmth')).toHaveLength(0);
  });

  it('serialized form is valid JSON with entries array', () => {
    history.record({ trait: 'warmth', offset: 0.1, context: null, source: 'user' });
    const parsed = JSON.parse(history.serialize());
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// clear
// ────────────────────────────────────────────────────────────────────────────

describe('PreferenceHistory — clear', () => {
  it('removes all entries', () => {
    history.record({ trait: 'warmth', offset: 0.2, context: null, source: 'user' });
    history.record({ trait: 'humor', offset: -0.1, context: null, source: 'feedback' });
    history.clear();

    expect(history.getTraitHistory('warmth')).toHaveLength(0);
    expect(history.getTraitHistory('humor')).toHaveLength(0);
  });

  it('getEffectiveOffset returns 0 after clear', () => {
    history.record({ trait: 'warmth', offset: 0.3, context: null, source: 'user' });
    history.clear();

    expect(history.getEffectiveOffset('warmth')).toBe(0);
  });

  it('detectConflicts returns empty after clear', () => {
    history.record({ trait: 'warmth', offset: 0.2, context: null, source: 'user' });
    history.record({ trait: 'warmth', offset: -0.1, context: null, source: 'feedback' });
    history.clear();

    expect(history.detectConflicts()).toHaveLength(0);
  });
});
