import { describe, it, expect } from 'vitest';
import { RelationshipScorer } from '../src/relationship.js';
import type { Interaction } from '../src/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeInteraction(
  overrides: Partial<Interaction> = {},
): Interaction {
  return {
    contactId: 'test-id',
    type: 'email',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('RelationshipScorer', () => {
  it('score with recent frequent interactions produces high strength', () => {
    const scorer = new RelationshipScorer();
    const interactions = Array.from({ length: 15 }, (_, i) =>
      makeInteraction({ timestamp: Date.now() - i * DAY_MS }),
    );
    const result = scorer.score(interactions);
    expect(result.strength).toBeGreaterThan(0.7);
  });

  it('score with old interactions produces low strength', () => {
    const scorer = new RelationshipScorer();
    const interactions = [
      makeInteraction({ timestamp: Date.now() - 120 * DAY_MS }),
    ];
    const result = scorer.score(interactions);
    expect(result.strength).toBeLessThan(0.2);
  });

  it('score frequency calculation correct', () => {
    const scorer = new RelationshipScorer();
    const interactions = Array.from({ length: 5 }, () =>
      makeInteraction({ timestamp: Date.now() - DAY_MS }),
    );
    const result = scorer.score(interactions);
    expect(result.frequency).toBe(5);
  });

  it('score recency calculation correct', () => {
    const scorer = new RelationshipScorer();
    const twoDaysAgo = Date.now() - 2 * DAY_MS;
    const interactions = [makeInteraction({ timestamp: twoDaysAgo })];
    const result = scorer.score(interactions);
    expect(result.recency).toBeCloseTo(2, 0);
  });

  it('context inference: mostly email results in professional', () => {
    const scorer = new RelationshipScorer();
    const interactions = [
      makeInteraction({ type: 'email' }),
      makeInteraction({ type: 'email' }),
      makeInteraction({ type: 'email' }),
      makeInteraction({ type: 'message' }),
    ];
    const result = scorer.score(interactions);
    expect(result.context).toBe('professional');
  });

  it('context inference: mostly message results in personal', () => {
    const scorer = new RelationshipScorer();
    const interactions = [
      makeInteraction({ type: 'message' }),
      makeInteraction({ type: 'message' }),
      makeInteraction({ type: 'message' }),
      makeInteraction({ type: 'email' }),
    ];
    const result = scorer.score(interactions);
    expect(result.context).toBe('personal');
  });

  it('strength clamped to [0, 1]', () => {
    const scorer = new RelationshipScorer();
    // Many recent interactions to try to push strength high
    const interactions = Array.from({ length: 50 }, () =>
      makeInteraction({ timestamp: Date.now() }),
    );
    const result = scorer.score(interactions);
    expect(result.strength).toBeLessThanOrEqual(1);
    expect(result.strength).toBeGreaterThanOrEqual(0);
  });

  it('empty interactions produce zero score', () => {
    const scorer = new RelationshipScorer();
    const result = scorer.score([]);
    expect(result.strength).toBe(0);
    expect(result.frequency).toBe(0);
    expect(result.recency).toBe(Infinity);
    expect(result.context).toBe('unknown');
  });
});
