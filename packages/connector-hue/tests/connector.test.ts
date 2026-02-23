import { describe, it, expect } from 'vitest';
import { hueConnector } from '../src/connector.js';

describe('hueConnector', () => {
  it('should have correct id and name', () => {
    expect(hueConnector.id).toBe('hue');
    expect(hueConnector.name).toBe('Philips Hue');
  });

  it('should use api_key auth', () => {
    expect(hueConnector.auth.type).toBe('api_key');
  });

  it('should have all 8 actions', () => {
    expect(hueConnector.actions.length).toBe(8);
  });

  it('should have lights and scenes actions', () => {
    const ids = hueConnector.actions.map(a => a.id);
    expect(ids).toContain('lights-list');
    expect(ids).toContain('lights-get');
    expect(ids).toContain('lights-set');
    expect(ids).toContain('lights-toggle');
    expect(ids).toContain('scenes-list');
    expect(ids).toContain('scenes-activate');
    expect(ids).toContain('groups-list');
    expect(ids).toContain('groups-set');
  });

  it('should mark read-only actions correctly', () => {
    const list = hueConnector.actions.find(a => a.id === 'lights-list');
    expect(list?.sideEffects).toBe(false);
    expect(list?.trustMinimum).toBe(1);
  });

  it('should mark write actions correctly', () => {
    const set = hueConnector.actions.find(a => a.id === 'lights-set');
    expect(set?.sideEffects).toBe(true);
    expect(set?.trustMinimum).toBeGreaterThanOrEqual(2);
  });

  it('should have motion-detected trigger', () => {
    expect(hueConnector.triggers.map(t => t.id)).toContain('motion-detected');
  });

  it('should be in smart-home category', () => {
    expect(hueConnector.category).toBe('smart-home');
  });
});
