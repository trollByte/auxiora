import { describe, it, expect } from 'vitest';
import { spotifyConnector } from '../src/connector.js';

describe('spotifyConnector', () => {
  it('should have correct id and name', () => {
    expect(spotifyConnector.id).toBe('spotify');
    expect(spotifyConnector.name).toBe('Spotify');
  });

  it('should use OAuth2 auth', () => {
    expect(spotifyConnector.auth.type).toBe('oauth2');
    expect(spotifyConnector.auth.oauth2?.authUrl).toContain('accounts.spotify.com');
  });

  it('should have playback and search actions', () => {
    const actionIds = spotifyConnector.actions.map(a => a.id);
    expect(actionIds).toContain('playback-play');
    expect(actionIds).toContain('playback-pause');
    expect(actionIds).toContain('playback-current');
    expect(actionIds).toContain('search');
    expect(actionIds).toContain('playlist-create');
  });

  it('should have all 8 actions', () => {
    expect(spotifyConnector.actions.length).toBe(8);
  });

  it('should mark playback actions as having side effects', () => {
    const play = spotifyConnector.actions.find(a => a.id === 'playback-play');
    expect(play?.sideEffects).toBe(true);
    expect(play?.trustMinimum).toBeGreaterThanOrEqual(2);
  });

  it('should mark search as read-only', () => {
    const search = spotifyConnector.actions.find(a => a.id === 'search');
    expect(search?.sideEffects).toBe(false);
    expect(search?.trustMinimum).toBe(1);
  });

  it('should have track-changed trigger', () => {
    expect(spotifyConnector.triggers.map(t => t.id)).toContain('track-changed');
  });

  it('should have correct OAuth2 scopes', () => {
    const scopes = spotifyConnector.auth.oauth2?.scopes ?? [];
    expect(scopes).toContain('user-read-playback-state');
    expect(scopes).toContain('user-modify-playback-state');
    expect(scopes).toContain('playlist-modify-public');
  });
});
