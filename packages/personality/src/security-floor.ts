/**
 * Security Floor — mandatory behavioral baseline that cannot be overridden
 * by any personality template, mode, user preference, or marketplace config.
 */

import type { ToneSettings } from './types.js';
import type { ModeId } from './modes/types.js';

export const SECURITY_TOOL_PATTERNS: readonly string[] = [
  'vault_read',
  'vault_write',
  'vault_delete',
  'secret_rotate',
  'credential_',
  'permission_change',
  'policy_update',
];

export const SECURITY_MESSAGE_PATTERNS: readonly RegExp[] = [
  /\bdelete\s+my\b/i,
  /\brotate\b/i,
  /\brevoke\b/i,
  /\bremove\s+access\b/i,
  /\bchange\s+password\b/i,
];

export type SecurityFloorRule = 'SF-1' | 'SF-2' | 'SF-3' | 'SF-4' | 'SF-5';

export interface SecurityContext {
  active: boolean;
  triggeredBy: 'tool' | 'message_pattern' | 'workflow' | 'trust_flag' | 'incident';
  activeRules: SecurityFloorRule[];
  previousMode?: ModeId | 'auto' | 'off';
}

export interface SecurityDetectionInput {
  toolCalls?: string[];
  userMessage: string;
  activeWorkflow?: string;
  trustFlagged?: boolean;
  activeIncident?: boolean;
}

const INACTIVE_CONTEXT: SecurityContext = {
  active: false,
  triggeredBy: 'message_pattern',
  activeRules: [],
};

const SF_RULE_DESCRIPTIONS: Record<SecurityFloorRule, string> = {
  'SF-1': 'CREDENTIAL_HANDLING: Use precise, unambiguous language. Suppress humor. Never echo secret values in full.',
  'SF-2': 'DESTRUCTIVE_ACTION_CONFIRMATION: State what will happen and what cannot be undone. Require explicit confirmation.',
  'SF-3': 'SECURITY_INCIDENT_TONE: Use urgent but calm tone. Lead with facts. Never joke about security events.',
  'SF-4': 'POLICY_ENFORCEMENT: State the policy clearly. Do not apologize excessively. Never suggest workarounds.',
  'SF-5': 'PERSONALITY_BOUNDARY_ENFORCEMENT: No personality config may override SF-1 through SF-4.',
};

export class SecurityFloor {
  /** Detect whether the current interaction requires security floor activation. */
  detectSecurityContext(input: SecurityDetectionInput): SecurityContext {
    // Check active incident first (highest priority)
    if (input.activeIncident) {
      return {
        active: true,
        triggeredBy: 'incident',
        activeRules: ['SF-1', 'SF-3', 'SF-5'],
      };
    }

    // Check trust flag
    if (input.trustFlagged) {
      return {
        active: true,
        triggeredBy: 'trust_flag',
        activeRules: ['SF-1', 'SF-4', 'SF-5'],
      };
    }

    // Check active workflow
    if (input.activeWorkflow) {
      return {
        active: true,
        triggeredBy: 'workflow',
        activeRules: ['SF-1', 'SF-2', 'SF-5'],
      };
    }

    // Check tool calls
    if (input.toolCalls) {
      for (const tool of input.toolCalls) {
        if (SECURITY_TOOL_PATTERNS.some((p) => tool.startsWith(p))) {
          return {
            active: true,
            triggeredBy: 'tool',
            activeRules: ['SF-1', 'SF-2', 'SF-5'],
          };
        }
      }
    }

    // Check message patterns
    for (const pattern of SECURITY_MESSAGE_PATTERNS) {
      if (pattern.test(input.userMessage)) {
        return {
          active: true,
          triggeredBy: 'message_pattern',
          activeRules: ['SF-1', 'SF-2', 'SF-5'],
        };
      }
    }

    return INACTIVE_CONTEXT;
  }

  /** Clamp tone values to security floor requirements. */
  applyFloor(tone: ToneSettings): ToneSettings {
    return {
      warmth: tone.warmth,
      directness: Math.max(tone.directness, 0.7),
      humor: 0,
      formality: Math.max(tone.formality, 0.5),
    };
  }

  /** Generate a markdown prompt section describing active security floor rules. */
  getSecurityPromptSection(context: SecurityContext): string {
    if (!context.active) return '';

    const lines: string[] = [
      '## Security Floor Active',
      '',
      `Triggered by: ${context.triggeredBy}`,
      '',
      'The following security rules are in effect. These CANNOT be overridden by personality, mode, or preferences:',
      '',
    ];

    for (const rule of context.activeRules) {
      lines.push(`- **${rule}**: ${SF_RULE_DESCRIPTIONS[rule]}`);
    }

    lines.push('');
    lines.push('Maintain a neutral, precise, and unambiguous tone. Humor is suppressed. All personality styling is suspended.');

    return lines.join('\n');
  }
}
