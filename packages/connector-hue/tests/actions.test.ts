import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hueConnector } from '../src/connector.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const TOKEN_URL = 'http://192.168.1.100/api/testuser';
const TOKEN_USERNAME = 'testuser';

describe('executeAction', () => {
  describe('lights-list', () => {
    it('should GET /lights and return mapped array', async () => {
      const apiData = {
        '1': { name: 'Desk Lamp', type: 'Extended color light', state: { on: true, bri: 200 } },
        '2': { name: 'Ceiling', type: 'Dimmable light', state: { on: false, bri: 0 } },
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiData));

      const result = await hueConnector.executeAction('lights-list', {}, TOKEN_URL);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/lights`);
      expect(opts.method).toBeUndefined();

      expect(result).toEqual({
        lights: [
          { id: '1', name: 'Desk Lamp', on: true, brightness: 200, type: 'Extended color light' },
          { id: '2', name: 'Ceiling', on: false, brightness: 0, type: 'Dimmable light' },
        ],
      });
    });

    it('should use default bridge when token is just a username', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));

      await hueConnector.executeAction('lights-list', {}, TOKEN_USERNAME);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`http://192.168.1.1/api/${TOKEN_USERNAME}/lights`);
    });
  });

  describe('lights-get', () => {
    it('should GET /lights/{lightId} and return light state', async () => {
      const apiData = {
        name: 'Desk Lamp',
        type: 'Extended color light',
        state: { on: true, bri: 200, hue: 10000, sat: 100 },
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiData));

      const result = await hueConnector.executeAction('lights-get', { lightId: '3' }, TOKEN_URL);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/lights/3`);

      expect(result).toEqual({
        id: '3',
        name: 'Desk Lamp',
        state: { on: true, bri: 200, hue: 10000, sat: 100 },
        type: 'Extended color light',
      });
    });
  });

  describe('lights-set', () => {
    it('should PUT /lights/{lightId}/state with mapped body fields', async () => {
      const apiResult = [{ success: { '/lights/1/state/on': true } }];
      mockFetch.mockResolvedValueOnce(mockResponse(apiResult));

      const result = await hueConnector.executeAction(
        'lights-set',
        { lightId: '1', on: true, brightness: 128, hue: 5000, sat: 200, colorTemp: 300 },
        TOKEN_URL,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/lights/1/state`);
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body as string)).toEqual({
        on: true,
        bri: 128,
        hue: 5000,
        sat: 200,
        ct: 300,
      });

      expect(result).toEqual({ lightId: '1', status: 'updated', result: apiResult });
    });

    it('should only include defined params in body', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await hueConnector.executeAction('lights-set', { lightId: '1', on: false }, TOKEN_URL);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({ on: false });
      expect(body).not.toHaveProperty('bri');
      expect(body).not.toHaveProperty('hue');
      expect(body).not.toHaveProperty('sat');
      expect(body).not.toHaveProperty('ct');
    });
  });

  describe('lights-toggle', () => {
    it('should GET current state then PUT toggled state (on -> off)', async () => {
      const lightData = { name: 'Lamp', state: { on: true, bri: 254 } };
      const putResult = [{ success: { '/lights/5/state/on': false } }];
      mockFetch
        .mockResolvedValueOnce(mockResponse(lightData))
        .mockResolvedValueOnce(mockResponse(putResult));

      const result = await hueConnector.executeAction('lights-toggle', { lightId: '5' }, TOKEN_URL);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: GET current state
      const [getUrl, getOpts] = mockFetch.mock.calls[0];
      expect(getUrl).toBe(`${TOKEN_URL}/lights/5`);
      expect(getOpts.method).toBeUndefined();

      // Second call: PUT toggled state
      const [putUrl, putOpts] = mockFetch.mock.calls[1];
      expect(putUrl).toBe(`${TOKEN_URL}/lights/5/state`);
      expect(putOpts.method).toBe('PUT');
      expect(JSON.parse(putOpts.body as string)).toEqual({ on: false });

      expect(result).toEqual({ lightId: '5', on: false, status: 'toggled', result: putResult });
    });

    it('should toggle off -> on', async () => {
      const lightData = { name: 'Lamp', state: { on: false, bri: 0 } };
      mockFetch
        .mockResolvedValueOnce(mockResponse(lightData))
        .mockResolvedValueOnce(mockResponse([]));

      const result = await hueConnector.executeAction('lights-toggle', { lightId: '2' }, TOKEN_URL);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      expect(body).toEqual({ on: true });
      expect(result).toMatchObject({ lightId: '2', on: true, status: 'toggled' });
    });
  });

  describe('scenes-list', () => {
    it('should GET /scenes and return mapped array', async () => {
      const apiData = {
        'abc': { name: 'Relax', lights: ['1', '2'] },
        'def': { name: 'Energize', lights: ['3'] },
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiData));

      const result = await hueConnector.executeAction('scenes-list', {}, TOKEN_URL);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/scenes`);

      expect(result).toEqual({
        scenes: [
          { id: 'abc', name: 'Relax', lights: ['1', '2'] },
          { id: 'def', name: 'Energize', lights: ['3'] },
        ],
      });
    });
  });

  describe('scenes-activate', () => {
    it('should PUT /groups/0/action with scene id', async () => {
      const apiResult = [{ success: { '/groups/0/action/scene': 'abc' } }];
      mockFetch.mockResolvedValueOnce(mockResponse(apiResult));

      const result = await hueConnector.executeAction('scenes-activate', { sceneId: 'abc' }, TOKEN_URL);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/groups/0/action`);
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body as string)).toEqual({ scene: 'abc' });

      expect(result).toEqual({ sceneId: 'abc', status: 'activated', result: apiResult });
    });
  });

  describe('groups-list', () => {
    it('should GET /groups and return mapped array', async () => {
      const apiData = {
        '1': { name: 'Living Room', type: 'Room', lights: ['1', '2', '3'] },
        '2': { name: 'Bedroom', type: 'Room', lights: ['4'] },
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiData));

      const result = await hueConnector.executeAction('groups-list', {}, TOKEN_URL);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/groups`);

      expect(result).toEqual({
        groups: [
          { id: '1', name: 'Living Room', type: 'Room', lights: ['1', '2', '3'] },
          { id: '2', name: 'Bedroom', type: 'Room', lights: ['4'] },
        ],
      });
    });
  });

  describe('groups-set', () => {
    it('should PUT /groups/{groupId}/action with mapped body', async () => {
      const apiResult = [{ success: { '/groups/1/action/on': true } }];
      mockFetch.mockResolvedValueOnce(mockResponse(apiResult));

      const result = await hueConnector.executeAction(
        'groups-set',
        { groupId: '1', on: true, brightness: 200, scene: 'abc' },
        TOKEN_URL,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TOKEN_URL}/groups/1/action`);
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body as string)).toEqual({ on: true, bri: 200, scene: 'abc' });

      expect(result).toEqual({ groupId: '1', status: 'updated', result: apiResult });
    });

    it('should only include defined params in body', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await hueConnector.executeAction('groups-set', { groupId: '2', on: false }, TOKEN_URL);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({ on: false });
      expect(body).not.toHaveProperty('bri');
      expect(body).not.toHaveProperty('scene');
    });
  });

  describe('unknown action', () => {
    it('should throw for unknown action id', async () => {
      await expect(hueConnector.executeAction('not-real', {}, TOKEN_URL)).rejects.toThrow(
        'Unknown action: not-real',
      );
    });
  });

  describe('error handling', () => {
    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'unauthorized' }, 401));

      await expect(hueConnector.executeAction('lights-list', {}, TOKEN_URL)).rejects.toThrow(
        'Hue API error 401',
      );
    });
  });
});

describe('pollTrigger', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('should return events for ZLLPresence sensors with presence=true', async () => {
    const sensors = {
      '10': {
        name: 'Hallway Sensor',
        type: 'ZLLPresence',
        state: { presence: true, lastupdated: '2026-02-22T10:00:00' },
      },
      '11': {
        name: 'Kitchen Sensor',
        type: 'ZLLPresence',
        state: { presence: false, lastupdated: '2026-02-22T09:00:00' },
      },
      '12': {
        name: 'Temperature',
        type: 'ZLLTemperature',
        state: { temperature: 2100 },
      },
    };
    mockFetch.mockResolvedValueOnce(mockResponse(sensors));

    const events = await hueConnector.pollTrigger('motion-detected', TOKEN_URL);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${TOKEN_URL}/sensors`);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      triggerId: 'motion-detected',
      connectorId: 'hue',
      data: {
        sensorId: '10',
        name: 'Hallway Sensor',
        presence: true,
        lastUpdated: '2026-02-22T10:00:00',
      },
    });
    expect(events[0].timestamp).toBeTypeOf('number');
  });

  it('should return empty array for unknown trigger id', async () => {
    const events = await hueConnector.pollTrigger('unknown-trigger', TOKEN_URL);
    expect(events).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return empty array when no sensors have presence', async () => {
    const sensors = {
      '10': {
        name: 'Hallway Sensor',
        type: 'ZLLPresence',
        state: { presence: false, lastupdated: '2026-02-22T09:00:00' },
      },
    };
    mockFetch.mockResolvedValueOnce(mockResponse(sensors));

    const events = await hueConnector.pollTrigger('motion-detected', TOKEN_URL);
    expect(events).toHaveLength(0);
  });
});
