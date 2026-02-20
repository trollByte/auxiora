import { describe, it, expect } from 'vitest';
import { evaluateConditions } from '../src/condition-evaluator.js';
import type { EventCondition } from '../src/types.js';

describe('evaluateConditions', () => {
  const data = {
    ref: 'refs/heads/main',
    action: 'opened',
    count: 42,
    nested: { deep: { value: 'hello world' } },
    flag: true,
  };

  describe('equals operator', () => {
    it('matches exact string', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'equals', value: 'refs/heads/main' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('rejects mismatch', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'equals', value: 'refs/heads/develop' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
    it('matches number', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'equals', value: 42 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('matches boolean', () => {
      const conds: EventCondition[] = [{ field: 'flag', op: 'equals', value: true }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('contains operator', () => {
    it('finds substring', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'contains', value: 'heads/main' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('rejects missing substring', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'contains', value: 'develop' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
  });

  describe('startsWith operator', () => {
    it('matches prefix', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'startsWith', value: 'refs/' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('endsWith operator', () => {
    it('matches suffix', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'endsWith', value: '/main' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('gt/lt operators', () => {
    it('gt matches when value is greater', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'gt', value: 40 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('gt rejects when value is equal', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'gt', value: 42 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
    it('lt matches when value is less', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'lt', value: 50 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('exists operator', () => {
    it('matches when field exists', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'exists', value: true }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('matches when field does not exist', () => {
      const conds: EventCondition[] = [{ field: 'missing', op: 'exists', value: false }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('rejects when exists=true but field missing', () => {
      const conds: EventCondition[] = [{ field: 'missing', op: 'exists', value: true }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
  });

  describe('dot-notation field traversal', () => {
    it('resolves nested fields', () => {
      const conds: EventCondition[] = [{ field: 'nested.deep.value', op: 'contains', value: 'hello' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('returns false for non-existent nested path', () => {
      const conds: EventCondition[] = [{ field: 'nested.missing.value', op: 'equals', value: 'x' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
  });

  describe('combinators', () => {
    it('AND requires all conditions to match', () => {
      const conds: EventCondition[] = [
        { field: 'ref', op: 'equals', value: 'refs/heads/main' },
        { field: 'count', op: 'gt', value: 100 },
      ];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
    it('OR requires at least one condition to match', () => {
      const conds: EventCondition[] = [
        { field: 'ref', op: 'equals', value: 'refs/heads/develop' },
        { field: 'count', op: 'gt', value: 40 },
      ];
      expect(evaluateConditions(data, conds, 'or')).toBe(true);
    });
    it('AND with empty conditions returns true', () => {
      expect(evaluateConditions(data, [], 'and')).toBe(true);
    });
    it('OR with empty conditions returns false', () => {
      expect(evaluateConditions(data, [], 'or')).toBe(false);
    });
  });
});
