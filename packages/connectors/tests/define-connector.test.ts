import { describe, it, expect } from 'vitest';
import { defineConnector } from '../src/define-connector.js';

describe('defineConnector', () => {
  const baseOpts = {
    id: 'my-connector',
    name: 'My Connector',
    description: 'A connector',
    version: '1.0.0',
    category: 'testing',
    auth: { type: 'api_key' as const },
    actions: [
      {
        id: 'action-1',
        name: 'Action 1',
        description: 'Does something',
        trustMinimum: 1 as const,
        trustDomain: 'integrations' as const,
        reversible: false,
        sideEffects: false,
        params: {},
      },
    ],
    executeAction: async () => ({}),
  };

  it('should create a valid connector', () => {
    const connector = defineConnector(baseOpts);
    expect(connector.id).toBe('my-connector');
    expect(connector.name).toBe('My Connector');
    expect(connector.actions).toHaveLength(1);
    expect(connector.triggers).toEqual([]);
    expect(connector.entities).toEqual([]);
  });

  it('should include triggers and entities when provided', () => {
    const connector = defineConnector({
      ...baseOpts,
      triggers: [{ id: 't1', name: 'Trigger', description: 'A trigger', type: 'poll' }],
      entities: [{ id: 'e1', name: 'Entity', description: 'An entity', fields: { name: 'string' } }],
    });
    expect(connector.triggers).toHaveLength(1);
    expect(connector.entities).toHaveLength(1);
  });

  it('should throw if id is missing', () => {
    expect(() => defineConnector({ ...baseOpts, id: '' })).toThrow('id and name are required');
  });

  it('should throw if name is missing', () => {
    expect(() => defineConnector({ ...baseOpts, name: '' })).toThrow('id and name are required');
  });

  it('should throw if no actions are defined', () => {
    expect(() => defineConnector({ ...baseOpts, actions: [] })).toThrow('at least one action');
  });

  it('should throw if auth is missing', () => {
    expect(() => defineConnector({ ...baseOpts, auth: undefined as any })).toThrow('auth config is required');
  });
});
