import { getLogger } from '@auxiora/logger';
import type { Threat } from './types.js';

const logger = getLogger('guardrails:pii');

interface PiiPattern {
  name: string;
  regex: RegExp;
  type: string;
  placeholder: string;
  level: 'low' | 'medium' | 'high';
  validate?: (match: string) => boolean;
}

function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/\D/g, '');
  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    type: 'email',
    placeholder: '[EMAIL]',
    level: 'medium',
  },
  {
    name: 'ssn',
    regex: /\b(\d{3}-\d{2}-\d{4})\b/g,
    type: 'ssn',
    placeholder: '[SSN]',
    level: 'high',
  },
  {
    name: 'credit_card',
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7})\b/g,
    type: 'credit_card',
    placeholder: '[CREDIT_CARD]',
    level: 'high',
    validate: (match: string) => {
      const digits = match.replace(/[\s-]/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
    },
  },
  {
    name: 'phone',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    type: 'phone',
    placeholder: '[PHONE]',
    level: 'medium',
  },
  {
    name: 'ip_address',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    type: 'ip_address',
    placeholder: '[IP_ADDRESS]',
    level: 'low',
  },
  {
    name: 'dob',
    regex: /(?:born on|DOB[:\s]|birthday[:\s]?)\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\w+ \d{1,2},?\s*\d{4})/gi,
    type: 'dob',
    placeholder: '[DOB]',
    level: 'high',
  },
];

export class PiiDetector {
  detect(text: string): Threat[] {
    const threats: Threat[] = [];

    for (const pattern of PII_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];

        if (pattern.validate && !pattern.validate(matchedText)) {
          continue;
        }

        threats.push({
          type: 'pii',
          level: pattern.level,
          description: 'Detected ' + pattern.name + ': ' + matchedText,
          location: { start: match.index, end: match.index + matchedText.length },
          match: matchedText,
        });
      }
    }

    logger.debug({ threatCount: threats.length }, 'PII scan complete');
    return threats;
  }

  redact(text: string): string {
    let result = text;

    for (const pattern of PII_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      result = result.replace(regex, (matched) => {
        if (pattern.validate && !pattern.validate(matched)) {
          return matched;
        }
        return pattern.placeholder;
      });
    }

    return result;
  }
}
