/** Trust level from 0 (no autonomy) to 4 (full autonomy). */
export type TrustLevel = 0 | 1 | 2 | 3 | 4;

/** Named trust domains that can have independent trust levels. */
export type TrustDomain =
  | 'messaging'
  | 'files'
  | 'web'
  | 'shell'
  | 'finance'
  | 'calendar'
  | 'email'
  | 'integrations'
  | 'system';

export interface TrustConfig {
  /** Default trust level for new domains. */
  defaultLevel: TrustLevel;
  /** Whether automatic promotion is enabled. */
  autoPromote: boolean;
  /** Minimum successful actions before promotion is considered. */
  promotionThreshold: number;
  /** Number of failures before automatic demotion. */
  demotionThreshold: number;
  /** Maximum trust level that auto-promotion can reach. */
  autoPromoteCeiling: TrustLevel;
}

export interface TrustEvidence {
  /** Number of successful actions in this domain. */
  successes: number;
  /** Number of failed actions in this domain. */
  failures: number;
  /** Timestamp of last action. */
  lastActionAt: number;
  /** Timestamp of last promotion. */
  lastPromotedAt?: number;
  /** Timestamp of last demotion. */
  lastDemotedAt?: number;
}

export interface TrustPromotion {
  domain: TrustDomain;
  fromLevel: TrustLevel;
  toLevel: TrustLevel;
  reason: string;
  timestamp: number;
  automatic: boolean;
}

export interface TrustDemotion {
  domain: TrustDomain;
  fromLevel: TrustLevel;
  toLevel: TrustLevel;
  reason: string;
  timestamp: number;
}

export interface ActionAudit {
  id: string;
  timestamp: number;
  trustLevel: TrustLevel;
  domain: TrustDomain;
  intent: string;
  plan: string;
  executed: boolean;
  outcome: 'success' | 'failure' | 'pending' | 'rolled_back';
  reasoning: string;
  rollbackAvailable: boolean;
}

export interface TrustState {
  levels: Record<TrustDomain, TrustLevel>;
  evidence: Record<TrustDomain, TrustEvidence>;
  promotions: TrustPromotion[];
  demotions: TrustDemotion[];
}

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  defaultLevel: 0,
  autoPromote: true,
  promotionThreshold: 10,
  demotionThreshold: 3,
  autoPromoteCeiling: 3,
};

export const TRUST_LEVEL_NAMES: Record<TrustLevel, string> = {
  0: 'None',
  1: 'Inform',
  2: 'Suggest',
  3: 'Act & Report',
  4: 'Full Autonomy',
};

export const ALL_TRUST_DOMAINS: TrustDomain[] = [
  'messaging',
  'files',
  'web',
  'shell',
  'finance',
  'calendar',
  'email',
  'integrations',
  'system',
];
