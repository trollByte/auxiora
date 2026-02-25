import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homeAssistantConnector } from '../src/connector.js';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('Home Assistant Connector', () => {
  it('should have correct metadata', () => {
    expect(homeAssistantConnector.id).toBe('homeassistant');
    expect(homeAssistantConnector.name).toBe('Home Assistant');
    expect(homeAssistantConnector.category).toBe('smart-home');
  });

  it('should use token authentication', () => {
    expect(homeAssistantConnector.auth.type).toBe('token');
    expect(homeAssistantConnector.auth.instructions).toContain('long-lived access token');
  });

  it('should define device actions', () => {
    const deviceActions = homeAssistantConnector.actions.filter((a) => a.id.startsWith('devices-'));
    expect(deviceActions.length).toBe(4);
    expect(deviceActions.map((a) => a.id)).toContain('devices-list');
    expect(deviceActions.map((a) => a.id)).toContain('devices-get-state');
    expect(deviceActions.map((a) => a.id)).toContain('devices-set-state');
    expect(deviceActions.map((a) => a.id)).toContain('devices-call-service');
  });

  it('should define scene actions', () => {
    const sceneActions = homeAssistantConnector.actions.filter((a) => a.id.startsWith('scenes-'));
    expect(sceneActions.length).toBe(2);
  });

  it('should define automation actions', () => {
    const automationActions = homeAssistantConnector.actions.filter((a) => a.id.startsWith('automations-'));
    expect(automationActions.length).toBe(3);
  });

  it('should define state-changed trigger', () => {
    expect(homeAssistantConnector.triggers).toHaveLength(1);
    expect(homeAssistantConnector.triggers[0].id).toBe('state-changed');
    expect(homeAssistantConnector.triggers[0].pollIntervalMs).toBe(10_000);
  });

  it('should define entities', () => {
    expect(homeAssistantConnector.entities).toHaveLength(3);
    const entityIds = homeAssistantConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('device');
    expect(entityIds).toContain('scene');
    expect(entityIds).toContain('automation');
  });

  it('should require higher trust for call-service than get-state', () => {
    const callService = homeAssistantConnector.actions.find((a) => a.id === 'devices-call-service');
    const getState = homeAssistantConnector.actions.find((a) => a.id === 'devices-get-state');
    expect(callService!.trustMinimum).toBeGreaterThan(getState!.trustMinimum);
  });

  it('should execute devices-set-state action', async () => {
    // POST /api/states/light.living_room returns the updated state object
    fetchMock.mockResolvedValueOnce(mockResponse({
      entity_id: 'light.living_room',
      state: 'on',
      attributes: {},
    }));
    const result = await homeAssistantConnector.executeAction(
      'devices-set-state',
      { entityId: 'light.living_room', state: 'on' },
      'token',
    ) as any;
    expect(result.status).toBe('updated');
    expect(result.state).toBe('on');
  });

  it('should execute scenes-activate action', async () => {
    // POST /api/services/scene/turn_on
    fetchMock.mockResolvedValueOnce(mockResponse([]));
    const result = await homeAssistantConnector.executeAction(
      'scenes-activate',
      { sceneId: 'scene.movie_time' },
      'token',
    ) as any;
    expect(result.status).toBe('activated');
  });

  it('should execute automations-toggle action', async () => {
    // POST /api/services/automation/turn_on
    fetchMock.mockResolvedValueOnce(mockResponse([]));
    const result = await homeAssistantConnector.executeAction(
      'automations-toggle',
      { automationId: 'automation.morning', enabled: true },
      'token',
    ) as any;
    expect(result.status).toBe('toggled');
    expect(result.enabled).toBe(true);
  });

  it('should throw for unknown action', async () => {
    await expect(homeAssistantConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    // GET /api/states returns empty array (no states changed recently)
    fetchMock.mockResolvedValueOnce(mockResponse([]));
    const events = await homeAssistantConnector.pollTrigger!('state-changed', 'token');
    expect(events).toEqual([]);
  });
});
