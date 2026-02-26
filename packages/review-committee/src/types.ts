export interface CriticRole {
  name: string;
  perspective: string;
  weight: number;
}

export interface ReviewIssue {
  description: string;
  severity: 'critical' | 'warning' | 'suggestion';
}

export interface CriticReview {
  critic: string;
  score: number;
  issues: ReviewIssue[];
  approved: boolean;
}

export interface ReviewProposal {
  title: string;
  description: string;
  changes: string[];
  createdAt: number;
}

export interface AggregatedReview {
  approved: boolean;
  weightedScore: number;
  totalIssues: number;
  allIssues: Array<ReviewIssue & { critic: string }>;
  blockers: string[];
  reviews: CriticReview[];
}
