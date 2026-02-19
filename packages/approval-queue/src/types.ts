export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  description: string;
  riskLevel: RiskLevel;
  preview?: string;
  requestedBy: string;
  requestedAt: number;
  expiresAt?: number;
  status: ApprovalStatus;
  decidedAt?: number;
  decidedBy?: string;
  denyReason?: string;
  metadata?: Record<string, unknown>;
}
