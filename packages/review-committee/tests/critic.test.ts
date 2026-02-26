import { describe, it, expect } from 'vitest';
import { ReviewCommittee } from '../src/critic.js';
import type { CriticRole, CriticReview } from '../src/types.js';

const defaultRoles: CriticRole[] = [
  { name: 'security', perspective: 'security and vulnerability analysis', weight: 1.5 },
  { name: 'performance', perspective: 'runtime efficiency and scalability', weight: 1.0 },
  { name: 'maintainability', perspective: 'code clarity and long-term maintenance', weight: 1.0 },
];

describe('ReviewCommittee', () => {
  it('aggregates reviews from multiple critics — all approve', () => {
    const committee = new ReviewCommittee(defaultRoles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 8, issues: [], approved: true },
      { critic: 'performance', score: 9, issues: [], approved: true },
      { critic: 'maintainability', score: 7, issues: [], approved: true },
    ];

    const result = committee.aggregate(reviews);

    expect(result.approved).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.totalIssues).toBe(0);
    expect(result.weightedScore).toBeGreaterThan(0);
  });

  it('rejects when any critic disapproves', () => {
    const committee = new ReviewCommittee(defaultRoles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 3, issues: [{ description: 'SQL injection risk', severity: 'critical' }], approved: false },
      { critic: 'performance', score: 8, issues: [], approved: true },
      { critic: 'maintainability', score: 7, issues: [], approved: true },
    ];

    const result = committee.aggregate(reviews);

    expect(result.approved).toBe(false);
    expect(result.blockers).toEqual(['security']);
  });

  it('computes weighted average score', () => {
    const committee = new ReviewCommittee(defaultRoles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 10, issues: [], approved: true },
      { critic: 'performance', score: 5, issues: [], approved: true },
      { critic: 'maintainability', score: 5, issues: [], approved: true },
    ];

    const result = committee.aggregate(reviews);

    // security: 10 * 1.5 = 15, performance: 5 * 1.0 = 5, maintainability: 5 * 1.0 = 5
    // total weight: 3.5, weighted sum: 25, average: 25/3.5 ~ 7.14
    expect(result.weightedScore).toBeCloseTo(25 / 3.5, 2);
  });

  it('collects all issues across critics', () => {
    const committee = new ReviewCommittee(defaultRoles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 6, issues: [{ description: 'Missing input validation', severity: 'warning' }], approved: true },
      { critic: 'performance', score: 5, issues: [{ description: 'N+1 query detected', severity: 'critical' }], approved: true },
      { critic: 'maintainability', score: 7, issues: [
        { description: 'Function too long', severity: 'suggestion' },
        { description: 'Missing JSDoc', severity: 'suggestion' },
      ], approved: true },
    ];

    const result = committee.aggregate(reviews);

    expect(result.totalIssues).toBe(4);
    expect(result.allIssues).toHaveLength(4);
    expect(result.allIssues[0]).toEqual({ description: 'Missing input validation', severity: 'warning', critic: 'security' });
    expect(result.allIssues[1]).toEqual({ description: 'N+1 query detected', severity: 'critical', critic: 'performance' });
  });

  it('builds proposal from code diff context', () => {
    const committee = new ReviewCommittee(defaultRoles);
    const before = Date.now();

    const proposal = committee.createProposal({
      title: 'Refactor auth module',
      description: 'Extract token validation into separate service',
      changes: ['src/auth/validator.ts', 'src/auth/service.ts'],
    });

    expect(proposal.title).toBe('Refactor auth module');
    expect(proposal.description).toBe('Extract token validation into separate service');
    expect(proposal.changes).toEqual(['src/auth/validator.ts', 'src/auth/service.ts']);
    expect(proposal.createdAt).toBeGreaterThanOrEqual(before);
    expect(proposal.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
