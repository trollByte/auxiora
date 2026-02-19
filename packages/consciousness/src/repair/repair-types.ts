import type { Anomaly } from '../monitor/monitor-types.js';

export type RepairTier = 'auto' | 'notify' | 'approve';

export interface Diagnosis {
  id: string;
  timestamp: number;
  anomaly: Anomaly;
  rootCause: string;
  confidence: number;
  suggestedActions: RepairAction[];
}

export interface RepairAction {
  id: string;
  tier: RepairTier;
  description: string;
  command: string;
  rollback?: string;
  estimatedImpact: string;
}

export interface RepairLog {
  actionId: string;
  diagnosisId: string;
  tier: RepairTier;
  status: 'executed' | 'approved' | 'rejected' | 'failed' | 'rolled_back';
  executedAt: number;
  result?: string;
  error?: string;
}
