import { getLogger } from '@auxiora/logger';
import type { Threat, ThreatLevel } from './types.js';

const logger = getLogger('guardrails:injection');

interface InjectionPattern {
  name: string;
  regex: RegExp;
  weight: number;
  description: string;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'ignore_instructions',
    regex: /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions/i,
    weight: 3,
    description: 'Attempt to override prior instructions',
  },
  {
    name: 'you_are_now',
    regex: /you\s+are\s+now\s+(?:a|an|the|acting\s+as)/i,
    weight: 2,
    description: 'Attempt to reassign AI role',
  },
  {
    name: 'system_role',
    regex: /^(?:system|assistant)\s*:/im,
    weight: 3,
    description: 'Injected system/assistant role marker',
  },
  {
    name: 'pretend_to_be',
    regex: /pretend\s+(?:to\s+be|you(?:'re|\s+are))/i,
    weight: 2,
    description: 'Attempt to override AI identity',
  },
  {
    name: 'triple_quotes',
    regex: /"""/g,
    weight: 1,
    description: 'Triple-quote delimiter injection',
  },
  {
    name: 'triple_backticks_inject',
    regex: /```\s*(?:system|instruction|prompt)/i,
    weight: 2,
    description: 'Backtick delimiter with role keyword',
  },
  {
    name: 'angle_brackets',
    regex: /<<<|>>>/g,
    weight: 1,
    description: 'Angle bracket delimiter injection',
  },
  {
    name: 'encoded_instruction',
    regex: /(?:atob|base64)\s*\(\s*['"][A-Za-z0-9+/=]{20,}['"]\s*\)/i,
    weight: 2,
    description: 'Possible encoded instruction payload',
  },
  {
    name: 'forget_everything',
    regex: /forget\s+(?:all|everything|what\s+you\s+know)/i,
    weight: 3,
    description: 'Attempt to reset AI memory/instructions',
  },
  {
    name: 'new_instructions',
    regex: /(?:new|updated|revised|real)\s+instructions?\s*:/i,
    weight: 3,
    description: 'Attempt to inject new instructions',
  },
  {
    name: 'override_keyword',
    regex: /\boverride\b.*\b(?:instructions?|rules?|guidelines?|constraints?)\b/i,
    weight: 2,
    description: 'Attempt to override rules',
  },
  {
    name: 'do_anything_now',
    regex: /\bDAN\b|do\s+anything\s+now/i,
    weight: 3,
    description: 'DAN (Do Anything Now) jailbreak pattern',
  },
  {
    name: 'disregard',
    regex: /disregard\s+(?:all\s+)?(?:previous|prior|above|earlier|your)\s+(?:instructions|programming|rules)/i,
    weight: 3,
    description: 'Attempt to disregard instructions',
  },
];

function weightToLevel(totalWeight: number): ThreatLevel {
  if (totalWeight >= 6) return 'critical';
  if (totalWeight >= 4) return 'high';
  if (totalWeight >= 2) return 'medium';
  if (totalWeight >= 1) return 'low';
  return 'none';
}

function levelValue(level: ThreatLevel): number {
  const values: Record<ThreatLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return values[level];
}

export class InjectionDetector {
  detect(text: string): Threat[] {
    const threats: Threat[] = [];
    let totalWeight = 0;

    for (const pattern of INJECTION_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : pattern.regex.flags + 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        totalWeight += pattern.weight;
        threats.push({
          type: 'prompt_injection',
          level: weightToLevel(pattern.weight),
          description: pattern.description,
          location: { start: match.index, end: match.index + match[0].length },
          match: match[0],
        });
      }
    }

    if (totalWeight >= 4 && threats.length > 0) {
      const aggregateLevel = weightToLevel(totalWeight);
      for (const threat of threats) {
        if (levelValue(aggregateLevel) > levelValue(threat.level)) {
          threat.level = aggregateLevel;
        }
      }
    }

    logger.debug({ threatCount: threats.length, totalWeight }, 'Injection scan complete');
    return threats;
  }
}
