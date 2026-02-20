import { getLogger } from '@auxiora/logger';
import type { Finding } from './types.js';

const logger = getLogger('guardrails:pii');

interface PiiPattern {
  name: string;
  regex: RegExp;
  redaction: string;
  description: string;
  severity: 'medium' | 'high';
}

const PII_PATTERNS: PiiPattern[] = [
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, redaction: '[EMAIL]', description: 'Email address detected', severity: 'medium' },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, redaction: '[SSN]', description: 'Social Security Number detected', severity: 'high' },
  { name: 'credit_card', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g, redaction: '[CARD]', description: 'Credit card number detected', severity: 'high' },
  { name: 'phone', regex: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, redaction: '[PHONE]', description: 'Phone number detected', severity: 'medium' },
  { name: 'ip_address', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, redaction: '[IP]', description: 'IP address detected', severity: 'medium' },
  { name: 'dob', regex: /(?:born on|dob[:\s]|date of birth[:\s])\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/gi, redaction: '[DOB]', description: 'Date of birth detected', severity: 'medium' },
];

export class PiiDetector {
  scan(text: string): Finding[] {
    const findings: Finding[] = [];
    for (const pattern of PII_PATTERNS) {
      for (const match of text.matchAll(pattern.regex)) {
        findings.push({ type: 'pii', description: pattern.description, severity: pattern.severity, offset: match.index, length: match[0].length, redacted: pattern.redaction });
        logger.debug('PII detected: %s at offset %d', pattern.name, match.index);
      }
    }
    return findings.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
  }

  redact(text: string): string {
    return this.redactFindings(text, this.scan(text));
  }

  redactFindings(text: string, findings: Finding[]): string {
    const sorted = [...findings].sort((a, b) => (b.offset ?? 0) - (a.offset ?? 0));
    let result = text;
    for (const f of sorted) {
      if (f.offset !== undefined && f.length !== undefined && f.redacted) {
        result = result.slice(0, f.offset) + f.redacted + result.slice(f.offset + f.length);
      }
    }
    return result;
  }
}
