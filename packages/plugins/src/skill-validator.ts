import { TOOL_NAME_PATTERN } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Dangerous patterns that generated plugins must not contain. */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brequire\s*\(/, reason: 'require() is not allowed — use ESM imports' },
  { pattern: /\bimport\s.*['"](?:child_process|node:child_process)['"]/, reason: 'child_process import is forbidden' },
  { pattern: /\bimport\s.*['"](?:fs|node:fs)['"]/, reason: 'Direct fs import is forbidden — use plugin context APIs' },
  { pattern: /\bprocess\.env\b/, reason: 'process.env access is forbidden — use plugin config' },
  { pattern: /\bglobalThis\b/, reason: 'globalThis access is forbidden' },
  { pattern: /\bnew\s+(?:Function|AsyncFunction)\b/, reason: 'Dynamic code execution constructors are forbidden' },
];

/** Static analysis of generated plugin source code. */
export function validatePluginSource(source: string): ValidationResult {
  const errors: string[] = [];

  // Must export plugin
  if (!/export\s+const\s+plugin\b/.test(source)) {
    errors.push('Source must contain "export const plugin = ..."');
  }

  // Check blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(source)) {
      errors.push(reason);
    }
  }

  // Validate tool names via regex extraction
  const toolNameMatches = source.matchAll(/name:\s*['"]([^'"]+)['"]/g);
  let isFirstName = true;
  for (const match of toolNameMatches) {
    if (isFirstName) {
      // First name match is the plugin name, skip
      isFirstName = false;
      continue;
    }
    const name = match[1];
    if (!TOOL_NAME_PATTERN.test(name)) {
      errors.push(`Invalid tool name "${name}" — must match ${TOOL_NAME_PATTERN}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
