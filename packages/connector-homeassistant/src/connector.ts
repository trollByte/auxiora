import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

function parseHAToken(token: string): { baseUrl: string; accessToken: string } {
  const pipeIdx = token.indexOf('|');
  if (pipeIdx !== -1) {
    return { baseUrl: token.slice(0, pipeIdx), accessToken: token.slice(pipeIdx + 1) };
  }
  return { baseUrl: 'http://localhost:8123', accessToken: token };
}

async function haFetch(token: string, path: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
  const { baseUrl, accessToken } = parseHAToken(token);
  const res = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Home Assistant API error: ${res.status} ${text || res.statusText}`);
  }
  return res.json();
}

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

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'devices-list': {
        const states = await haFetch(token, '/api/states') as Array<Record<string, unknown>>;
        return {
          devices: states.map((s) => ({
            entityId: s.entity_id,
            state: s.state,
            attributes: s.attributes,
            lastChanged: s.last_changed,
          })),
        };
      }
      case 'devices-get-state': {
        const entityId = params.entityId as string;
        const state = await haFetch(token, `/api/states/${entityId}`) as Record<string, unknown>;
        return {
          entityId: state.entity_id,
          state: state.state,
          attributes: state.attributes,
          lastChanged: state.last_changed,
        };
      }
      case 'devices-set-state': {
        const entityId = params.entityId as string;
        const result = await haFetch(token, `/api/states/${entityId}`, {
          method: 'POST',
          body: { state: params.state, attributes: params.attributes ?? {} },
        }) as Record<string, unknown>;
        return {
          entityId: result.entity_id,
          state: result.state,
          attributes: result.attributes,
          status: 'updated',
        };
      }
      case 'devices-call-service': {
        const domain = params.domain as string;
        const service = params.service as string;
        const body: Record<string, unknown> = { ...(params.data as Record<string, unknown> ?? {}) };
        if (params.entityId) {
          body.entity_id = params.entityId;
        }
        const result = await haFetch(token, `/api/services/${domain}/${service}`, {
          method: 'POST',
          body,
        });
        return { domain, service, status: 'called', result };
      }
      case 'scenes-list': {
        const states = await haFetch(token, '/api/states') as Array<Record<string, unknown>>;
        return {
          scenes: states
            .filter((s) => (s.entity_id as string).startsWith('scene.'))
            .map((s) => ({
              entityId: s.entity_id,
              name: (s.attributes as Record<string, unknown>)?.friendly_name ?? s.entity_id,
            })),
        };
      }
      case 'scenes-activate': {
        const sceneId = params.sceneId as string;
        await haFetch(token, '/api/services/scene/turn_on', {
          method: 'POST',
          body: { entity_id: sceneId },
        });
        return { sceneId, status: 'activated' };
      }
      case 'automations-list': {
        const states = await haFetch(token, '/api/states') as Array<Record<string, unknown>>;
        return {
          automations: states
            .filter((s) => (s.entity_id as string).startsWith('automation.'))
            .map((s) => ({
              entityId: s.entity_id,
              alias: (s.attributes as Record<string, unknown>)?.friendly_name ?? s.entity_id,
              state: s.state,
            })),
        };
      }
      case 'automations-trigger': {
        const automationId = params.automationId as string;
        await haFetch(token, '/api/services/automation/trigger', {
          method: 'POST',
          body: { entity_id: automationId },
        });
        return { automationId, status: 'triggered' };
      }
      case 'automations-toggle': {
        const automationId = params.automationId as string;
        const enabled = params.enabled as boolean;
        const service = enabled ? 'turn_on' : 'turn_off';
        await haFetch(token, `/api/services/automation/${service}`, {
          method: 'POST',
          body: { entity_id: automationId },
        });
        return { automationId, enabled, status: 'toggled' };
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    if (triggerId !== 'state-changed') return [];

    const states = await haFetch(token, '/api/states') as Array<Record<string, unknown>>;
    const since = lastPollAt ?? Date.now() - 10_000;
    const changed: TriggerEvent[] = [];

    for (const s of states) {
      const lastChanged = s.last_changed as string | undefined;
      if (lastChanged && new Date(lastChanged).getTime() > since) {
        changed.push({
          triggerId: 'state-changed',
          connectorId: 'homeassistant',
          timestamp: new Date(lastChanged).getTime(),
          data: {
            entityId: s.entity_id,
            state: s.state,
            attributes: s.attributes,
            lastChanged,
          },
        });
      }
    }

    return changed;
  },
});
