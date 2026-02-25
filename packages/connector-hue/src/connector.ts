import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const HUE_DEFAULT_BRIDGE = 'http://192.168.1.1';

async function hueFetch(basePath: string, token: string, options: RequestInit = {}): Promise<Response> {
  // token format: "http://{bridgeIp}/api/{username}" or just "{username}" with default bridge
  const baseUrl = token.startsWith('http') ? token : `${HUE_DEFAULT_BRIDGE}/api/${token}`;
  const res = await fetch(`${baseUrl}${basePath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hue API error ${res.status}: ${body}`);
  }
  return res;
}

async function hueJson<T = unknown>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await hueFetch(path, token, options);
  return res.json() as Promise<T>;
}

export const hueConnector = defineConnector({
  id: 'hue',
  name: 'Philips Hue',
  description: 'Philips Hue smart lighting: control lights, scenes, and rooms',
  version: '1.0.0',
  category: 'smart-home',
  icon: 'lightbulb',

  auth: {
    type: 'api_key',
    instructions: 'Press the link button on your Hue Bridge, then use the API to create a username. Token format: http://{bridgeIp}/api/{username}',
  },

  actions: [
    // --- Lights ---
    {
      id: 'lights-list',
      name: 'List Lights',
      description: 'List all lights connected to the Hue Bridge',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'lights-get',
      name: 'Get Light State',
      description: 'Get the current state of a specific light',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        lightId: { type: 'string', description: 'Light ID', required: true },
      },
    },
    {
      id: 'lights-set',
      name: 'Set Light',
      description: 'Set the state of a light (on/off, brightness, color)',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        lightId: { type: 'string', description: 'Light ID', required: true },
        on: { type: 'boolean', description: 'Turn light on or off' },
        brightness: { type: 'number', description: 'Brightness level (0-254)' },
        hue: { type: 'number', description: 'Hue value' },
        sat: { type: 'number', description: 'Saturation value' },
        colorTemp: { type: 'number', description: 'Color temperature (mireds)' },
      },
    },
    {
      id: 'lights-toggle',
      name: 'Toggle Light',
      description: 'Toggle a light on or off',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        lightId: { type: 'string', description: 'Light ID', required: true },
      },
    },
    // --- Scenes ---
    {
      id: 'scenes-list',
      name: 'List Scenes',
      description: 'List all scenes configured on the Hue Bridge',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'scenes-activate',
      name: 'Activate Scene',
      description: 'Activate a Hue scene',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        sceneId: { type: 'string', description: 'Scene ID', required: true },
      },
    },
    // --- Groups ---
    {
      id: 'groups-list',
      name: 'List Rooms/Zones',
      description: 'List all rooms and zones on the Hue Bridge',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'groups-set',
      name: 'Set Room State',
      description: 'Set the state of a room or zone',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        groupId: { type: 'string', description: 'Group ID', required: true },
        on: { type: 'boolean', description: 'Turn group on or off' },
        brightness: { type: 'number', description: 'Brightness level (0-254)' },
        scene: { type: 'string', description: 'Scene ID to activate for this group' },
      },
    },
  ],

  triggers: [
    {
      id: 'motion-detected',
      name: 'Motion Detected',
      description: 'Triggered when a Hue motion sensor detects presence',
      type: 'poll',
      pollIntervalMs: 5_000,
    },
  ],

  entities: [
    {
      id: 'light',
      name: 'Light',
      description: 'A Hue light',
      fields: { id: 'string', name: 'string', on: 'boolean', brightness: 'number', type: 'string' },
    },
    {
      id: 'scene',
      name: 'Scene',
      description: 'A Hue scene',
      fields: { id: 'string', name: 'string', lights: 'array' },
    },
    {
      id: 'group',
      name: 'Group',
      description: 'A room or zone',
      fields: { id: 'string', name: 'string', type: 'string', lights: 'array' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'lights-list': {
        const lights = await hueJson<Record<string, Record<string, unknown>>>('/lights', token);
        return {
          lights: Object.entries(lights).map(([id, light]) => ({
            id,
            name: light.name,
            on: (light.state as Record<string, unknown>)?.on,
            brightness: (light.state as Record<string, unknown>)?.bri,
            type: light.type,
          })),
        };
      }
      case 'lights-get': {
        const lightId = params.lightId as string;
        const light = await hueJson<Record<string, unknown>>(`/lights/${lightId}`, token);
        return {
          id: lightId,
          name: light.name,
          state: light.state,
          type: light.type,
        };
      }
      case 'lights-set': {
        const lightId = params.lightId as string;
        const body: Record<string, unknown> = {};
        if (params.on !== undefined) body.on = params.on;
        if (params.brightness !== undefined) body.bri = params.brightness;
        if (params.hue !== undefined) body.hue = params.hue;
        if (params.sat !== undefined) body.sat = params.sat;
        if (params.colorTemp !== undefined) body.ct = params.colorTemp;
        const result = await hueJson(`/lights/${lightId}/state`, token, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return { lightId, status: 'updated', result };
      }
      case 'lights-toggle': {
        const lightId = params.lightId as string;
        const light = await hueJson<Record<string, unknown>>(`/lights/${lightId}`, token);
        const currentOn = (light.state as Record<string, unknown>)?.on as boolean;
        const result = await hueJson(`/lights/${lightId}/state`, token, {
          method: 'PUT',
          body: JSON.stringify({ on: !currentOn }),
        });
        return { lightId, on: !currentOn, status: 'toggled', result };
      }
      case 'scenes-list': {
        const scenes = await hueJson<Record<string, Record<string, unknown>>>('/scenes', token);
        return {
          scenes: Object.entries(scenes).map(([id, scene]) => ({
            id,
            name: scene.name,
            lights: scene.lights,
          })),
        };
      }
      case 'scenes-activate': {
        const sceneId = params.sceneId as string;
        const result = await hueJson('/groups/0/action', token, {
          method: 'PUT',
          body: JSON.stringify({ scene: sceneId }),
        });
        return { sceneId, status: 'activated', result };
      }
      case 'groups-list': {
        const groups = await hueJson<Record<string, Record<string, unknown>>>('/groups', token);
        return {
          groups: Object.entries(groups).map(([id, group]) => ({
            id,
            name: group.name,
            type: group.type,
            lights: group.lights,
          })),
        };
      }
      case 'groups-set': {
        const groupId = params.groupId as string;
        const body: Record<string, unknown> = {};
        if (params.on !== undefined) body.on = params.on;
        if (params.brightness !== undefined) body.bri = params.brightness;
        if (params.scene !== undefined) body.scene = params.scene;
        const result = await hueJson(`/groups/${groupId}/action`, token, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return { groupId, status: 'updated', result };
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string): Promise<TriggerEvent[]> {
    if (triggerId !== 'motion-detected') return [];

    const sensors = await hueJson<Record<string, Record<string, unknown>>>('/sensors', token);
    const events: TriggerEvent[] = [];

    for (const [id, sensor] of Object.entries(sensors)) {
      if (sensor.type !== 'ZLLPresence') continue;
      const state = sensor.state as Record<string, unknown> | undefined;
      if (state?.presence === true) {
        events.push({
          triggerId: 'motion-detected',
          connectorId: 'hue',
          timestamp: Date.now(),
          data: {
            sensorId: id,
            name: sensor.name,
            presence: true,
            lastUpdated: state.lastupdated,
          },
        });
      }
    }

    return events;
  },
});
