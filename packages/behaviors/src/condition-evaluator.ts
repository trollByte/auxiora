import type { EventCondition } from './types.js';

function resolveField(data: Record<string, unknown>, field: string): unknown {
  const segments = field.split('.');
  let current: unknown = data;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

function evaluateSingle(data: Record<string, unknown>, condition: EventCondition): boolean {
  const actual = resolveField(data, condition.field);

  switch (condition.op) {
    case 'exists':
      return condition.value ? actual !== undefined : actual === undefined;
    case 'equals':
      return actual === condition.value;
    case 'contains':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.includes(condition.value) : false;
    case 'startsWith':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.startsWith(condition.value) : false;
    case 'endsWith':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.endsWith(condition.value) : false;
    case 'gt':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual > condition.value : false;
    case 'lt':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual < condition.value : false;
    default:
      return false;
  }
}

export function evaluateConditions(
  data: Record<string, unknown>,
  conditions: EventCondition[],
  combinator: 'and' | 'or',
): boolean {
  if (conditions.length === 0) {
    return combinator === 'and';
  }
  if (combinator === 'and') {
    return conditions.every(c => evaluateSingle(data, c));
  }
  return conditions.some(c => evaluateSingle(data, c));
}
