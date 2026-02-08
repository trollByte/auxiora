import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

export const homeAssistantConnector = defineConnector({
  id: 'homeassistant',
  name: 'Home Assistant',
  description: 'Integration with Home Assistant for smart home control',
  version: '1.0.0',
  category: 'smart-home',
  icon: 'home',

  auth: {
    type: 'token',
    instructions: 'Use a Home Assistant long-lived access token. Generate one in your HA profile page.',
  },

  actions: [
    // --- Devices ---
    {
      id: 'devices-list',
      name: 'List Devices',
      description: 'List all devices in Home Assistant',
      trustMinimum: 1,
      trustDomain: 'system',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'devices-get-state',
      name: 'Get Device State',
      description: 'Get the current state of a device',
      trustMinimum: 1,
      trustDomain: 'system',
      reversible: false,
      sideEffects: false,
      params: {
        entityId: { type: 'string', description: 'Entity ID (e.g. light.living_room)', required: true },
      },
    },
    {
      id: 'devices-set-state',
      name: 'Set Device State',
      description: 'Set the state of a device (turn on/off, set values)',
      trustMinimum: 2,
      trustDomain: 'system',
      reversible: true,
      sideEffects: true,
      params: {
        entityId: { type: 'string', description: 'Entity ID', required: true },
        state: { type: 'string', description: 'Target state', required: true },
        attributes: { type: 'object', description: 'Additional attributes' },
      },
    },
    {
      id: 'devices-call-service',
      name: 'Call Service',
      description: 'Call a Home Assistant service',
      trustMinimum: 3,
      trustDomain: 'system',
      reversible: false,
      sideEffects: true,
      params: {
        domain: { type: 'string', description: 'Service domain (e.g. light)', required: true },
        service: { type: 'string', description: 'Service name (e.g. turn_on)', required: true },
        entityId: { type: 'string', description: 'Target entity ID' },
        data: { type: 'object', description: 'Service data' },
      },
    },
    // --- Scenes ---
    {
      id: 'scenes-list',
      name: 'List Scenes',
      description: 'List all available scenes',
      trustMinimum: 1,
      trustDomain: 'system',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'scenes-activate',
      name: 'Activate Scene',
      description: 'Activate a scene',
      trustMinimum: 2,
      trustDomain: 'system',
      reversible: false,
      sideEffects: true,
      params: {
        sceneId: { type: 'string', description: 'Scene entity ID', required: true },
      },
    },
    // --- Automations ---
    {
      id: 'automations-list',
      name: 'List Automations',
      description: 'List all automations',
      trustMinimum: 1,
      trustDomain: 'system',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'automations-trigger',
      name: 'Trigger Automation',
      description: 'Manually trigger an automation',
      trustMinimum: 3,
      trustDomain: 'system',
      reversible: false,
      sideEffects: true,
      params: {
        automationId: { type: 'string', description: 'Automation entity ID', required: true },
      },
    },
    {
      id: 'automations-toggle',
      name: 'Toggle Automation',
      description: 'Enable or disable an automation',
      trustMinimum: 2,
      trustDomain: 'system',
      reversible: true,
      sideEffects: true,
      params: {
        automationId: { type: 'string', description: 'Automation entity ID', required: true },
        enabled: { type: 'boolean', description: 'Enable or disable', required: true },
      },
    },
  ],

  triggers: [
    {
      id: 'state-changed',
      name: 'State Changed',
      description: 'Triggered when a device state changes',
      type: 'poll',
      pollIntervalMs: 10_000,
    },
  ],

  entities: [
    {
      id: 'device',
      name: 'Device',
      description: 'A Home Assistant device/entity',
      fields: { entityId: 'string', state: 'string', attributes: 'object', lastChanged: 'string' },
    },
    {
      id: 'scene',
      name: 'Scene',
      description: 'A Home Assistant scene',
      fields: { entityId: 'string', name: 'string' },
    },
    {
      id: 'automation',
      name: 'Automation',
      description: 'A Home Assistant automation',
      fields: { entityId: 'string', alias: 'string', state: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, _token: string): Promise<unknown> {
    switch (actionId) {
      case 'devices-list':
        return { devices: [] };
      case 'devices-get-state':
        return { entityId: params.entityId, state: 'off', attributes: {} };
      case 'devices-set-state':
        return { entityId: params.entityId, state: params.state, status: 'updated' };
      case 'devices-call-service':
        return { domain: params.domain, service: params.service, status: 'called' };
      case 'scenes-list':
        return { scenes: [] };
      case 'scenes-activate':
        return { sceneId: params.sceneId, status: 'activated' };
      case 'automations-list':
        return { automations: [] };
      case 'automations-trigger':
        return { automationId: params.automationId, status: 'triggered' };
      case 'automations-toggle':
        return { automationId: params.automationId, enabled: params.enabled, status: 'toggled' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(_triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
