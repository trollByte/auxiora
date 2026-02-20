import { getLogger } from '@auxiora/logger';
import type { Finding } from './types.js';

const logger = getLogger('guardrails:output');

interface OutputPattern {
  name: string;
  regex: RegExp;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  redaction: string;
}

const OUTPUT_PATTERNS: OutputPattern[] = [
  { name: 'openai_key', regex: /sk-[a-zA-Z0-9]{20,}/g, description: 'Potential OpenAI API key detected', severity: 'critical', redaction: '[REDACTED_KEY]' },
  { name: 'github_token', regex: /ghp_[a-zA-Z0-9]{20,}/g, description: 'GitHub personal access token detected', severity: 'critical', redaction: '[REDACTED_TOKEN]' },
  { name: 'aws_key', regex: /AKIA[A-Z0-9]{16}/g, description: 'AWS access key detected', severity: 'critical', redaction: '[REDACTED_AWS_KEY]' },
  { name: 'bearer_token', regex: /Bearer\s+[a-zA-Z0-9._\-]{20,}/g, description: 'Bearer token detected', severity: 'high', redaction: '[REDACTED_BEARER]' },
  { name: 'file_path', regex: /(?:\/(?:home|etc|var|usr|tmp|root)\/[^\s"'` + "`" + `,;)}\]]{3,})/g, description: 'Internal file path detected', severity: 'medium', redaction: '[REDACTED_PATH]' },
  { name: 'stack_trace', regex: /(?:at\s+\S+\s+\(.*:\d+:\d+\))/g, description: 'Stack trace detected', severity: 'medium', redaction: '[REDACTED_STACK]' },
  { name: 'env_variable', regex: /(?:process\.env\.[A-Z_]{3,}|(?:export\s+)?[A-Z_]{3,}=["']?[^\s"']{8,})/g, description: 'Environment variable detected', severity: 'high', redaction: '[REDACTED_ENV]' },
  { name: 'dangerous_command', regex: /(?:rm\s+-rf\s+\/|DROP\s+TABLE|;\s*sudo\s)/gi, description: 'Dangerous command detected in output', severity: 'high', redaction: '[REDACTED_CMD]' },
];

export class OutputFilter {
  scan(text: string): Finding[] {
    const findings: Finding[] = [];
    for (const pattern of OUTPUT_PATTERNS) {
      for (const match of text.matchAll(pattern.regex)) {
        findings.push({ type: 'data_leak', description: pattern.description, severity: pattern.severity, offset: match.index, length: match[0].length, redacted: pattern.redaction });
        logger.debug('Output risk detected: %s at offset %d', pattern.name, match.index);
      }
    }
    return findings.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
  }

  filter(text: string): string {
    const findings = this.scan(text);
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
