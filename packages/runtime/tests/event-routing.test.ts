import { describe, it, expect, vi } from 'vitest';
import { evaluateConditions } from '@auxiora/behaviors';
import type { EventCondition, BehaviorEventTrigger } from '@auxiora/behaviors';

describe('event routing', () => {
  it('evaluateConditions matches event data against behavior conditions', () => {
    const eventData = { ref: 'refs/heads/main', action: 'push' };
    const conditions: EventCondition[] = [
      { field: 'ref', op: 'endsWith', value: '/main' },
      { field: 'action', op: 'equals', value: 'push' },
    ];
    expect(evaluateConditions(eventData, conditions, 'and')).toBe(true);
  });

  it('routes matching event to behavior execution', async () => {
    const executeNow = vi.fn().mockResolvedValue({ success: true });
    const behaviors = [
      {
        id: 'b1', type: 'event' as const, status: 'active' as const,
        eventTrigger: { source: 'github', event: 'push', conditions: [{ field: 'ref', op: 'endsWith' as const, value: '/main' }], combinator: 'and' as const },
      },
      {
        id: 'b2', type: 'event' as const, status: 'active' as const,
        eventTrigger: { source: 'github', event: 'push', conditions: [{ field: 'ref', op: 'equals' as const, value: 'refs/heads/develop' }], combinator: 'and' as const },
      },
    ];

    const event = { triggerId: 'push', connectorId: 'github', data: { ref: 'refs/heads/main' }, timestamp: Date.now() };

    for (const behavior of behaviors) {
      if (behavior.type === 'event' && behavior.status === 'active' && behavior.eventTrigger) {
        if (behavior.eventTrigger.source === event.connectorId && behavior.eventTrigger.event === event.triggerId) {
          if (evaluateConditions(event.data, behavior.eventTrigger.conditions, behavior.eventTrigger.combinator)) {
            await executeNow(behavior.id);
          }
        }
      }
    }

    expect(executeNow).toHaveBeenCalledTimes(1);
    expect(executeNow).toHaveBeenCalledWith('b1');
  });

  it('does not route when conditions do not match', () => {
    const eventData = { ref: 'refs/heads/feature' };
    const conditions: EventCondition[] = [{ field: 'ref', op: 'endsWith', value: '/main' }];
    expect(evaluateConditions(eventData, conditions, 'and')).toBe(false);
  });
});
