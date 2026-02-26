import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/bus.js';

describe('EventBus', () => {
  it('publishes events and notifies subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe('agent.started', handler);
    bus.publish({ topic: 'agent.started', agentId: 'a1', payload: { name: 'coder' } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'agent.started', agentId: 'a1', payload: { name: 'coder' } }),
    );
  });

  it('supports wildcard subscriptions', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe('agent.*', handler);
    bus.publish({ topic: 'agent.started', agentId: 'a1', payload: {} });
    bus.publish({ topic: 'agent.completed', agentId: 'a1', payload: {} });
    bus.publish({ topic: 'workflow.started', agentId: 'w1', payload: {} });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes handlers', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe('test.event', handler);
    bus.publish({ topic: 'test.event', agentId: 'a1', payload: {} });
    unsub();
    bus.publish({ topic: 'test.event', agentId: 'a1', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('manages agent-keyed storage', () => {
    const bus = new EventBus();

    bus.setAgentData('agent-1', 'role', 'coder');
    bus.setAgentData('agent-1', 'depth', 2);
    bus.setAgentData('agent-2', 'role', 'reviewer');

    expect(bus.getAgentData('agent-1', 'role')).toBe('coder');
    expect(bus.getAgentData('agent-1', 'depth')).toBe(2);
    expect(bus.getAgentData('agent-2', 'role')).toBe('reviewer');
    expect(bus.getAgentData('agent-3', 'role')).toBeUndefined();
  });

  it('retrieves all data for an agent', () => {
    const bus = new EventBus();

    bus.setAgentData('agent-1', 'role', 'coder');
    bus.setAgentData('agent-1', 'status', 'running');

    const data = bus.getAllAgentData('agent-1');
    expect(data).toEqual({ role: 'coder', status: 'running' });
  });

  it('clears agent data', () => {
    const bus = new EventBus();

    bus.setAgentData('agent-1', 'role', 'coder');
    bus.clearAgentData('agent-1');

    expect(bus.getAgentData('agent-1', 'role')).toBeUndefined();
  });

  it('returns event history', () => {
    const bus = new EventBus({ maxHistory: 3 });

    bus.publish({ topic: 'e1', agentId: 'a', payload: {} });
    bus.publish({ topic: 'e2', agentId: 'a', payload: {} });
    bus.publish({ topic: 'e3', agentId: 'a', payload: {} });
    bus.publish({ topic: 'e4', agentId: 'a', payload: {} });

    const history = bus.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].topic).toBe('e2');
  });

  it('filters history by agent', () => {
    const bus = new EventBus();

    bus.publish({ topic: 'e1', agentId: 'a1', payload: {} });
    bus.publish({ topic: 'e2', agentId: 'a2', payload: {} });
    bus.publish({ topic: 'e3', agentId: 'a1', payload: {} });

    const history = bus.getHistory({ agentId: 'a1' });
    expect(history).toHaveLength(2);
  });
});
