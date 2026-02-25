import type { RiskLevel } from './types.js';

const CRITICAL_PATTERNS = [
  'delete', 'drop', 'destroy', 'remove', 'purge', 'truncate', 'wipe',
];

const HIGH_PATTERNS = [
  'write', 'send', 'post', 'execute', 'run', 'deploy', 'publish', 'push',
  'create', 'install', 'update', 'patch', 'put',
];

const MEDIUM_PATTERNS = [
  'modify', 'edit', 'set', 'configure', 'move', 'rename', 'copy',
];

function matchesAny(name: string, patterns: string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function hasDestructiveParams(params: Record<string, unknown>): boolean {
  const json = JSON.stringify(params).toLowerCase();
  return CRITICAL_PATTERNS.some((p) => json.includes(p));
}

export function assessRisk(
  toolName: string,
  params: Record<string, unknown>,
): RiskLevel {
  if (matchesAny(toolName, CRITICAL_PATTERNS) || hasDestructiveParams(params)) {
    return 'critical';
  }

  if (matchesAny(toolName, HIGH_PATTERNS)) {
    return 'high';
  }

  if (matchesAny(toolName, MEDIUM_PATTERNS)) {
    return 'medium';
  }

  return 'low';
}

export function describeAction(
  toolName: string,
  params: Record<string, unknown>,
): string {
  const paramKeys = Object.keys(params);
  const paramSummary =
    paramKeys.length > 0
      ? ` with ${paramKeys.join(', ')}`
      : '';

  const risk = assessRisk(toolName, params);
  return `[${risk.toUpperCase()}] Execute "${toolName}"${paramSummary}`;
}
