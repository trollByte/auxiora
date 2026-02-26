import type { VerificationContext, VerificationResult } from './types.js';

const SECURITY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bnew\s+Function\s*\(/i, label: 'Dynamic Function constructor (code injection risk)' },
  { pattern: /(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*=\s*["'][^"']{8,}/i, label: 'Hardcoded credential or secret detected' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/i, label: 'Possible API key literal in output' },
  { pattern: /child_process/i, label: 'Direct child_process usage (prefer safe wrappers)' },
  { pattern: /pickle\.loads?\b/i, label: 'Pickle deserialization risk' },
  { pattern: /innerHTML\s*=/i, label: 'innerHTML assignment (XSS risk)' },
  { pattern: /dangerouslySetInnerHTML/i, label: 'React dangerouslySetInnerHTML usage (XSS risk)' },
  { pattern: /rm\s+-rf\s*["'`]?\s*\+/i, label: 'Shell command injection via string concatenation' },
];

const MAX_OUTPUT_LENGTH = 500_000;

export class JobVerifier {
  verify(ctx: VerificationContext): VerificationResult {
    const securityConcerns: string[] = [];
    const logicErrors: string[] = [];
    const warnings: string[] = [];

    for (const { pattern, label } of SECURITY_PATTERNS) {
      if (pattern.test(ctx.output)) {
        securityConcerns.push(label);
      }
    }

    if (ctx.output.length > MAX_OUTPUT_LENGTH) {
      warnings.push(`Output exceeds ${MAX_OUTPUT_LENGTH} chars (${ctx.output.length}) — may contain exfiltrated data`);
    }

    if (ctx.output.trim().length === 0 && ctx.durationMs > 5000) {
      logicErrors.push('Job ran for >5s but produced no output');
    }

    const passed = securityConcerns.length === 0 && logicErrors.length === 0;

    return {
      jobId: ctx.jobId,
      passed,
      securityConcerns,
      logicErrors,
      warnings,
      verifiedAt: Date.now(),
    };
  }
}
