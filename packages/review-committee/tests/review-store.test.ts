import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReviewStore } from '../src/review-store.js';
import type { AggregatedReview } from '../src/types.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'review-store-'));
}

function makeReview(approved: boolean, score = 0.8): AggregatedReview {
  return {
    approved,
    weightedScore: score,
    totalIssues: approved ? 0 : 1,
    allIssues: [],
    blockers: approved ? [] : ['security'],
    reviews: [],
  };
}

describe('ReviewStore', () => {
  const dirs: string[] = [];
  const stores: ReviewStore[] = [];

  afterEach(() => {
    for (const s of stores) s.close();
    stores.length = 0;
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('stores and retrieves reviews', () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const store = new ReviewStore(join(dir, 'reviews.db'));
    stores.push(store);

    store.record('Add logging', makeReview(true, 0.9));
    const recent = store.getRecent(10);

    expect(recent).toHaveLength(1);
    expect(recent[0].proposalTitle).toBe('Add logging');
    expect(recent[0].approved).toBe(true);
  });

  it('filters by approval status', () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const store = new ReviewStore(join(dir, 'reviews.db'));
    stores.push(store);

    store.record('Good change', makeReview(true));
    store.record('Bad change', makeReview(false));

    const rejected = store.getByStatus(false);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].proposalTitle).toBe('Bad change');
  });

  it('computes approval rate', () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const store = new ReviewStore(join(dir, 'reviews.db'));
    stores.push(store);

    store.record('A', makeReview(true));
    store.record('B', makeReview(true));
    store.record('C', makeReview(false));

    const rate = store.getApprovalRate();
    expect(rate).toBeCloseTo(0.667, 2);
  });
});
