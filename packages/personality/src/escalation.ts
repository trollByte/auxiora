/**
 * Escalation state machine for response severity management.
 * Tracks escalation level across a session and dampens personality tone accordingly.
 */

import type { ToneSettings } from './types.js';
import { SecurityFloor } from './security-floor.js';

export const ESCALATION_LEVELS = ['normal', 'caution', 'serious', 'lockdown'] as const;
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const RESPONSE_CATEGORIES = [
  'uncertainty',
  'access_failure',
  'policy_block',
  'destructive_confirmation',
  'security_incident',
  'rate_limit',
  'provider_unavailable',
  'partial_success',
] as const;
export type ResponseCategory = (typeof RESPONSE_CATEGORIES)[number];

export interface EscalationTableEntry {
  severity: SeverityLevel;
  securityFloorRequired: boolean;
  canonicalPhrase: string;
}

export const ESCALATION_TABLE: Record<ResponseCategory, EscalationTableEntry> = {
  uncertainty: {
    severity: 'low',
    securityFloorRequired: false,
    canonicalPhrase: "I don't have enough information to answer that confidently.",
  },
  access_failure: {
    severity: 'medium',
    securityFloorRequired: false,
    canonicalPhrase: "I can't reach that resource right now.",
  },
  policy_block: {
    severity: 'medium',
    securityFloorRequired: true,
    canonicalPhrase: 'That action is restricted by your configured policies.',
  },
  destructive_confirmation: {
    severity: 'high',
    securityFloorRequired: true,
    canonicalPhrase: "This will [impact]. This cannot be undone. Type '[verb]' to confirm.",
  },
  security_incident: {
    severity: 'critical',
    securityFloorRequired: true,
    canonicalPhrase: "I've detected something unusual. Here's what I see.",
  },
  rate_limit: {
    severity: 'low',
    securityFloorRequired: false,
    canonicalPhrase: "I've hit a rate limit. I'll retry in [N] seconds.",
  },
  provider_unavailable: {
    severity: 'medium',
    securityFloorRequired: false,
    canonicalPhrase: "My AI provider isn't responding. Trying fallback.",
  },
  partial_success: {
    severity: 'low',
    securityFloorRequired: false,
    canonicalPhrase: "I completed part of that. Here's what worked and what didn't.",
  },
};

export interface EscalationState {
  level: EscalationLevel;
  lastEvent?: ResponseCategory;
  enteredAt?: number;
}

const SEVERITY_TO_LEVEL: Record<SeverityLevel, EscalationLevel> = {
  low: 'caution',
  medium: 'serious',
  high: 'lockdown',
  critical: 'lockdown',
};

const LEVEL_ORDER: Record<EscalationLevel, number> = {
  normal: 0,
  caution: 1,
  serious: 2,
  lockdown: 3,
};

export class EscalationStateMachine {
  private state: EscalationState = { level: 'normal' };
  private securityFloor = new SecurityFloor();

  /** Process a response category event and transition escalation state. */
  processEvent(event: ResponseCategory): EscalationState {
    const entry = ESCALATION_TABLE[event];
    const targetLevel = SEVERITY_TO_LEVEL[entry.severity];

    // Only escalate upward, never downward from an event
    if (LEVEL_ORDER[targetLevel] > LEVEL_ORDER[this.state.level]) {
      this.state = {
        level: targetLevel,
        lastEvent: event,
        enteredAt: Date.now(),
      };
    } else {
      this.state = { ...this.state, lastEvent: event };
    }

    return { ...this.state };
  }

  /** Resolve toward normal. Transitions one step down. */
  resolve(): EscalationState {
    switch (this.state.level) {
      case 'lockdown':
        this.state = { level: 'normal', enteredAt: Date.now() };
        break;
      case 'serious':
        this.state = { level: 'normal', enteredAt: Date.now() };
        break;
      case 'caution':
        this.state = { level: 'normal', enteredAt: Date.now() };
        break;
      case 'normal':
        break;
    }
    return { ...this.state };
  }

  /** Get current escalation state. */
  getState(): EscalationState {
    return { ...this.state };
  }

  /** Dampen tone values based on current escalation level. */
  dampenTone(tone: ToneSettings): ToneSettings {
    switch (this.state.level) {
      case 'normal':
        return { ...tone };
      case 'caution':
        return {
          ...tone,
          humor: tone.humor * 0.5,
        };
      case 'serious':
        return {
          ...tone,
          humor: 0,
          directness: Math.max(tone.directness, 0.6),
        };
      case 'lockdown':
        return this.securityFloor.applyFloor(tone);
    }
  }
}
