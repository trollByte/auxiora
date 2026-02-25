import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorRegistry } from '../src/registry.js';
import { AuthManager } from '../src/auth-manager.js';
import { TriggerManager } from '../src/trigger-manager.js';
import { defineConnector } from '../src/define-connector.js';
import type { TriggerEvent } from '../src/types.js';

describe('TriggerManager', () => {
  let registry: ConnectorRegistry;
  let authManager: AuthManager;
  let triggerManager: TriggerManager;
  let pollResults: TriggerEvent[];

  beforeEach(async () => {
    registry = new ConnectorRegistry();
    authManager = new AuthManager();
    triggerManager = new TriggerManager(registry, authManager);

    pollResults = [
      {
        triggerId: 'new-item',
        connectorId: 'poll-test',
        data: { itemId: '123' },
        timestamp: Date.now(),
      },
    ];

    registry.register(
      defineConnector({
        id: 'poll-test',
        name: 'Poll Test',
        description: 'Connector with poll triggers',
        version: '1.0.0',
        category: 'testing',
        auth: { type: 'api_key' },
        actions: [
          {
            id: 'dummy',
            name: 'Dummy',
            description: 'Dummy action',
            trustMinimum: 0,
            trustDomain: 'integrations',
            reversible: false,
            sideEffects: false,
            params: {},
          },
        ],
        triggers: [
          { id: 'new-item', name: 'New Item', description: 'New item created', type: 'poll', pollIntervalMs: 5000 },
        ],
        executeAction: async () => ({}),
        pollTrigger: async () => pollResults,
      }),
    );

    await authManager.authenticate('inst-1', { type: 'api_key' }, { apiKey: 'key' });
  });

  it('should subscribe to a trigger', () => {
    const subId = triggerManager.subscribe('poll-test', 'new-item', 'inst-1', () => {});
    expect(subId).toBe('poll-test:new-item:inst-1');
    expect(triggerManager.getSubscriptions()).toContain(subId);
  });

  it('should throw when subscribing to unknown connector', () => {
    expect(() => triggerManager.subscribe('unknown', 'new-item', 'inst-1', () => {}))
      .toThrow('not found');
  });

  it('should throw when subscribing to unknown trigger', () => {
    expect(() => triggerManager.subscribe('poll-test', 'unknown', 'inst-1', () => {}))
      .toThrow('not found');
  });

  it('should unsubscribe', () => {
    const subId = triggerManager.subscribe('poll-test', 'new-item', 'inst-1', () => {});
    expect(triggerManager.unsubscribe(subId)).toBe(true);
    expect(triggerManager.getSubscriptions()).not.toContain(subId);
  });

  it('should poll all subscriptions and invoke handlers', async () => {
    const received: TriggerEvent[] = [];
    triggerManager.subscribe('poll-test', 'new-item', 'inst-1', (events) => {
      received.push(...events);
    });

    const events = await triggerManager.pollAll();
    expect(events).toHaveLength(1);
    expect(events[0].data.itemId).toBe('123');
    expect(received).toHaveLength(1);
  });

  it('should skip polling when no token is available', async () => {
    triggerManager.subscribe('poll-test', 'new-item', 'no-token', () => {});
    const events = await triggerManager.pollAll();
    expect(events).toHaveLength(0);
  });

  it('should handle poll errors gracefully', async () => {
    registry.register(
      defineConnector({
        id: 'error-test',
        name: 'Error Test',
        description: 'Connector that errors on poll',
        version: '1.0.0',
        category: 'testing',
        auth: { type: 'api_key' },
        actions: [
          {
            id: 'dummy',
            name: 'Dummy',
            description: 'Dummy',
            trustMinimum: 0,
            trustDomain: 'integrations',
            reversible: false,
            sideEffects: false,
            params: {},
          },
        ],
        triggers: [
          { id: 'error-trigger', name: 'Error', description: 'Errors', type: 'poll' },
        ],
        executeAction: async () => ({}),
        pollTrigger: async () => { throw new Error('Poll failed'); },
      }),
    );
    await authManager.authenticate('inst-err', { type: 'api_key' }, { apiKey: 'k' });
    triggerManager.subscribe('error-test', 'error-trigger', 'inst-err', () => {});

    // Should not throw
    const events = await triggerManager.pollAll();
    // Only the poll-test subscription should return events (if subscribed), error-test should not
    expect(events).toBeDefined();
  });
});
