/**
 * Content scanner for personality configs.
 * Detects prompt injection and exfiltration patterns in untrusted string fields.
 */

// Note: The patterns below intentionally match dangerous keywords like "eval"
// and "exec" — this is a security scanner that BLOCKS these patterns in
// untrusted personality configs. This is not using eval/exec.

export const BLOCKED_PATTERNS: readonly RegExp[] = [
  /ignore\s+(previous|above|prior|all)\s+(instructions?|rules?|constraints?)/i,
  /you\s+are\s+(now|actually|really)/i,
  /forget\s+(everything|all|your)/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /\beval\b|\bexec\b/i,
  /override\s+(security|safety|policy|rules?)/i,
  /echo\s+(secret|password|key|token|credential)/i,
  /display\s+(secret|password|key|token|credential)/i,
  /reveal\s+(secret|password|key|token|credential)/i,
];

export interface ScanViolation {
  field: string;
  pattern: string;
  match: string;
}

export interface ScanResult {
  clean: boolean;
  violations: ScanViolation[];
}

/** Scan a single string value against all blocked patterns. */
export function scanString(value: string, fieldName: string): ScanViolation[] {
  const violations: ScanViolation[] = [];
  for (const pattern of BLOCKED_PATTERNS) {
    const match = pattern.exec(value);
    if (match) {
      violations.push({
        field: fieldName,
        pattern: pattern.source,
        match: match[0],
      });
    }
  }
  return violations;
}

/** Recursively walk an object and scan all string fields. */
export function scanAllStringFields(
  obj: Record<string, unknown>,
  prefix?: string,
): ScanResult {
  const violations: ScanViolation[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fieldName = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      violations.push(...scanString(value, fieldName));
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          violations.push(...scanString(item, `${fieldName}[${i}]`));
        } else if (item !== null && typeof item === 'object') {
          const nested = scanAllStringFields(
            item as Record<string, unknown>,
            `${fieldName}[${i}]`,
          );
          violations.push(...nested.violations);
        }
      }
    } else if (value !== null && typeof value === 'object') {
      const nested = scanAllStringFields(
        value as Record<string, unknown>,
        fieldName,
      );
      violations.push(...nested.violations);
    }
  }

  return { clean: violations.length === 0, violations };
}
