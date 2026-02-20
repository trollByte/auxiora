import { describe, it, expect } from 'vitest';
import type { Behavior, BehaviorEventTrigger, EventCondition } from '../src/types.js';

describe('event trigger types', () => {
  it('BehaviorType includes event', () => {
    const behavior: Behavior = {
      id: 'b1',
      type: 'event',
      status: 'active',
      action: 'notify',
      channel: { type: 'ws', id: 'default', overridden: false },
      createdBy: 'user',
      createdAt: new Date().toISOString(),
      runCount: 0,
      failCount: 0,
      maxFailures: 3,
      eventTrigger: {
        source: 'github',
        event: 'push',
        conditions: [
          { field: 'ref', op: 'equals', value: 'refs/heads/main' },
        ],
        combinator: 'and',
      },
    };
    expect(behavior.type).toBe('event');
    expect(behavior.eventTrigger).toBeDefined();
    expect(behavior.eventTrigger!.conditions).toHaveLength(1);
  });

  it('EventCondition supports all 7 operators', () => {
    const ops: EventCondition['op'][] = ['equals', 'contains', 'startsWith', 'endsWith', 'gt', 'lt', 'exists'];
    for (const op of ops) {
      const cond: EventCondition = { field: 'test', op, value: true };
      expect(cond.op).toBe(op);
    }
  });

  it('BehaviorEventTrigger supports and/or combinator', () => {
    const andTrigger: BehaviorEventTrigger = { source: 'slack', event: 'message', conditions: [], combinator: 'and' };
    const orTrigger: BehaviorEventTrigger = { source: 'slack', event: 'message', conditions: [], combinator: 'or' };
    expect(andTrigger.combinator).toBe('and');
    expect(orTrigger.combinator).toBe('or');
  });
});
