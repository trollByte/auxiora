import type { TrustEngine } from './trust-engine.js';
import type { TrustDomain, TrustLevel } from './types.js';
import { TRUST_LEVEL_NAMES } from './types.js';

export interface GateResult {
  allowed: boolean;
  currentLevel: TrustLevel;
  requiredLevel: TrustLevel;
  domain: TrustDomain;
  message: string;
}

export class TrustGate {
  private engine: TrustEngine;

  constructor(engine: TrustEngine) {
    this.engine = engine;
  }

  gate(domain: TrustDomain, action: string, requiredLevel: TrustLevel): GateResult {
    const currentLevel = this.engine.getTrustLevel(domain);
    const allowed = currentLevel >= requiredLevel;

    const message = allowed
      ? `Action "${action}" allowed at trust level ${TRUST_LEVEL_NAMES[currentLevel]}`
      : `Action "${action}" denied: requires ${TRUST_LEVEL_NAMES[requiredLevel]} (current: ${TRUST_LEVEL_NAMES[currentLevel]})`;

    return {
      allowed,
      currentLevel,
      requiredLevel,
      domain,
      message,
    };
  }
}
