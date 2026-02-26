import type { CriticRole, CriticReview, ReviewProposal, AggregatedReview, ReviewIssue } from './types.js';

export class ReviewCommittee {
  private readonly roles: CriticRole[];

  constructor(roles: CriticRole[]) {
    this.roles = [...roles];
  }

  aggregate(reviews: CriticReview[]): AggregatedReview {
    const roleMap = new Map<string, CriticRole>();
    for (const role of this.roles) {
      roleMap.set(role.name, role);
    }

    let weightedSum = 0;
    let totalWeight = 0;
    const allIssues: Array<ReviewIssue & { critic: string }> = [];
    const blockers: string[] = [];

    for (const review of reviews) {
      const role = roleMap.get(review.critic);
      const weight = role?.weight ?? 1;

      weightedSum += review.score * weight;
      totalWeight += weight;

      if (!review.approved) {
        blockers.push(review.critic);
      }

      for (const issue of review.issues) {
        allIssues.push({ ...issue, critic: review.critic });
      }
    }

    const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const approved = blockers.length === 0;

    return {
      approved,
      weightedScore,
      totalIssues: allIssues.length,
      allIssues,
      blockers,
      reviews,
    };
  }

  createProposal(input: { title: string; description: string; changes: string[] }): ReviewProposal {
    return {
      title: input.title,
      description: input.description,
      changes: [...input.changes],
      createdAt: Date.now(),
    };
  }

  getRoles(): CriticRole[] {
    return [...this.roles];
  }
}
