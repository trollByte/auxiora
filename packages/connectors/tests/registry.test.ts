import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorRegistry } from '../src/registry.js';
import { defineConnector } from '../src/define-connector.js';
import type { Connector } from '../src/types.js';

function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return defineConnector({
    id: overrides.id ?? 'test-connector',
    name: overrides.name ?? 'Test Connector',
    description: 'A test connector',
    version: '1.0.0',
    category: overrides.category ?? 'testing',
    auth: { type: 'api_key' },
    actions: [
      {
        id: 'test-action',
        name: 'Test Action',
        description: 'Does a test thing',
        trustMinimum: 1,
        trustDomain: 'integrations',
        reversible: false,
        sideEffects: false,
        params: {},
      },
    ],
    triggers: [
      {
        id: 'test-trigger',
        name: 'Test Trigger',
        description: 'A test trigger',
        type: 'poll',
        pollIntervalMs: 60000,
      },
    ],
    executeAction: async () => ({ ok: true }),
  });
}

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('should register and retrieve a connector', () => {
    const connector = makeConnector();
    registry.register(connector);
    expect(registry.get('test-connector')).toBe(connector);
  });

  it('should throw when registering a duplicate', () => {
    const connector = makeConnector();
    registry.register(connector);
    expect(() => registry.register(connector)).toThrow('already registered');
  });

  it('should list all connectors', () => {
    registry.register(makeConnector({ id: 'a', name: 'A' }));
    registry.register(makeConnector({ id: 'b', name: 'B' }));
    expect(registry.list()).toHaveLength(2);
  });

  it('should list connectors by category', () => {
    registry.register(makeConnector({ id: 'a', category: 'productivity' }));
    registry.register(makeConnector({ id: 'b', category: 'devtools' }));
    registry.register(makeConnector({ id: 'c', category: 'productivity' }));
    expect(registry.listByCategory('productivity')).toHaveLength(2);
    expect(registry.listByCategory('devtools')).toHaveLength(1);
    expect(registry.listByCategory('unknown')).toHaveLength(0);
  });

  it('should get actions for a connector', () => {
    registry.register(makeConnector());
    const actions = registry.getActions('test-connector');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('test-action');
  });

  it('should return empty array for unknown connector actions', () => {
    expect(registry.getActions('unknown')).toEqual([]);
  });

  it('should get triggers for a connector', () => {
    registry.register(makeConnector());
    const triggers = registry.getTriggers('test-connector');
    expect(triggers).toHaveLength(1);
    expect(triggers[0].id).toBe('test-trigger');
  });

  it('should unregister a connector', () => {
    registry.register(makeConnector());
    expect(registry.has('test-connector')).toBe(true);
    registry.unregister('test-connector');
    expect(registry.has('test-connector')).toBe(false);
  });

  it('should return undefined for unknown connector', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });
});
