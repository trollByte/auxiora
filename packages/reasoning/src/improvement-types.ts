export interface ImprovementProposal {
  observations: Record<string, unknown>;
  reflections: Record<string, unknown>;
  hypotheses: Record<string, unknown>;
  validations: Record<string, unknown>;
  status: 'pending_review' | 'approved' | 'rejected' | 'applied';
  createdAt: number;
}

export interface StepDescription {
  name: string;
  description: string;
  order: number;
  required: boolean;
}
