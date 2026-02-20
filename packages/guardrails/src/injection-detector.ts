import { getLogger } from '@auxiora/logger';
import type { Finding } from './types.js';

const logger = getLogger('guardrails:injection');

interface InjectionPattern {
  name: string;
  regex: RegExp;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  findingType: 'injection' | 'jailbreak';
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  { name: 'ignore_instructions', regex: /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions/gi, description: 'Attempt to override previous instructions', severity: 'high', findingType: 'injection' },
  { name: 'new_system_prompt', regex: /(?:new|override|replace)\s+system\s+prompt/gi, description: 'Attempt to replace system prompt', severity: 'critical', findingType: 'injection' },
  { name: 'forget_instructions', regex: /forget\s+(?:your|all|the)\s+instructions/gi, description: 'Attempt to clear instructions', severity: 'high', findingType: 'injection' },
  { name: 'you_are_now', regex: /you\s+are\s+now\s+(?:a\s+)?(?!going|able|ready)/gi, description: 'Role reassignment attempt', severity: 'medium', findingType: 'jailbreak' },
  { name: 'pretend_you_are', regex: /pretend\s+(?:you\s+are|to\s+be)/gi, description: 'Role manipulation via pretend', severity: 'medium', findingType: 'jailbreak' },
  { name: 'act_as_if', regex: /act\s+as\s+if\s+you/gi, description: 'Role manipulation via act-as', severity: 'medium', findingType: 'jailbreak' },
  { name: 'roleplay_as', regex: /roleplay\s+as/gi, description: 'Role manipulation via roleplay', severity: 'medium', findingType: 'jailbreak' },
  { name: 'repeat_system_prompt', regex: /(?:repeat|show|display|print|output|reveal)\s+(?:your\s+)?(?:system\s+prompt|instructions|rules|guidelines)/gi, description: 'Attempt to leak system prompt', severity: 'high', findingType: 'injection' },
  { name: 'what_are_your_rules', regex: /what\s+are\s+your\s+(?:rules|instructions|guidelines|system\s+prompt)/gi, description: 'Attempt to extract system instructions', severity: 'medium', findingType: 'injection' },
];

export class InjectionDetector {
  scan(text: string): Finding[] {
    const findings: Finding[] = [];
    for (const pattern of INJECTION_PATTERNS) {
      for (const match of text.matchAll(pattern.regex)) {
        findings.push({ type: pattern.findingType, description: pattern.description, severity: pattern.severity, offset: match.index, length: match[0].length });
        logger.debug('Injection pattern detected: %s at offset %d', pattern.name, match.index);
      }
    }
    if (findings.length >= 3) {
      for (const f of findings) { if (f.severity === 'medium') f.severity = 'high'; }
    }
    return findings.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
  }
}
