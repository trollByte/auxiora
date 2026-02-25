import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const SPOTIFY_API = 'https://api.spotify.com/v1';

async function spotifyFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${body}`);
  }
  return res;
}

async function spotifyJson<T = unknown>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await spotifyFetch(path, token, options);
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export const spotifyConnector = defineConnector({
  id: 'spotify',
  name: 'Spotify',
  description: 'Spotify playback control, search, and playlist management',
  version: '1.0.0',
  category: 'media',
  icon: 'spotify',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://accounts.spotify.com/authorize',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      scopes: [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'playlist-modify-public',
        'playlist-modify-private',
      ],
    },
    instructions: 'Create a Spotify Developer application at https://developer.spotify.com/dashboard to obtain client credentials.',
  },

  actions: [
    // --- Playback ---
    {
      id: 'playback-play',
      name: 'Play',
      description: 'Start or resume playback, optionally with a specific track or playlist URI',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        uri: { type: 'string', description: 'Spotify track or playlist URI to play' },
      },
    },
    {
      id: 'playback-pause',
      name: 'Pause',
      description: 'Pause the current playback',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {},
    },
    {
      id: 'playback-skip',
      name: 'Skip Track',
      description: 'Skip to the next or previous track',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        direction: { type: 'string', description: 'Skip direction: "next" or "previous"', required: true },
      },
    },
    {
      id: 'playback-current',
      name: 'Get Current Track',
      description: 'Get the currently playing track',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    // --- Search ---
    {
      id: 'search',
      name: 'Search',
      description: 'Search for tracks, albums, artists, or playlists',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
        type: { type: 'string', description: 'Type to search: "track", "album", "artist", or "playlist"', required: true },
      },
    },
    // --- Playlists ---
    {
      id: 'playlist-create',
      name: 'Create Playlist',
      description: 'Create a new playlist for the current user',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        name: { type: 'string', description: 'Playlist name', required: true },
        description: { type: 'string', description: 'Playlist description' },
        public: { type: 'boolean', description: 'Whether the playlist is public', default: true },
      },
    },
    {
      id: 'playlist-add',
      name: 'Add to Playlist',
      description: 'Add tracks to an existing playlist',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        playlistId: { type: 'string', description: 'Playlist ID', required: true },
        uris: { type: 'array', description: 'Array of Spotify track URIs to add', required: true },
      },
    },
    // --- Volume ---
    {
      id: 'playback-volume',
      name: 'Set Volume',
      description: 'Set the playback volume (0-100)',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        volumePercent: { type: 'number', description: 'Volume percentage (0-100)', required: true },
      },
    },
  ],

  triggers: [
    {
      id: 'track-changed',
      name: 'Track Changed',
      description: 'Triggered when the currently playing track changes',
      type: 'poll',
      pollIntervalMs: 10_000,
    },
  ],

  entities: [
    {
      id: 'track',
      name: 'Track',
      description: 'A Spotify track',
      fields: { id: 'string', name: 'string', artist: 'string', album: 'string', uri: 'string', durationMs: 'number' },
    },
    {
      id: 'playlist',
      name: 'Playlist',
      description: 'A Spotify playlist',
      fields: { id: 'string', name: 'string', description: 'string', trackCount: 'number', uri: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      // --- Playback ---
      case 'playback-play': {
        const uri = params.uri as string | undefined;
        const body: Record<string, unknown> = {};
        if (uri) {
          // If it looks like a context URI (album, playlist, artist), use context_uri; otherwise uris array
          if (uri.includes(':album:') || uri.includes(':playlist:') || uri.includes(':artist:')) {
            body.context_uri = uri;
          } else {
            body.uris = [uri];
          }
        }
        await spotifyFetch('/me/player/play', token, {
          method: 'PUT',
          body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
        });
        return { status: 'playing', uri: uri ?? null };
      }

      case 'playback-pause': {
        await spotifyFetch('/me/player/pause', token, { method: 'PUT' });
        return { status: 'paused' };
      }

      case 'playback-skip': {
        const direction = params.direction as string;
        if (direction !== 'next' && direction !== 'previous') {
          throw new Error('direction must be "next" or "previous"');
        }
        await spotifyFetch(`/me/player/${direction}`, token, { method: 'POST' });
        return { status: 'skipped', direction };
      }

      case 'playback-current': {
        const data = await spotifyJson<{
          item?: { id: string; name: string; artists: Array<{ name: string }>; album: { name: string }; uri: string; duration_ms: number };
          is_playing: boolean;
          progress_ms: number;
        }>('/me/player/currently-playing', token);
        if (!data.item) return { playing: false };
        return {
          playing: data.is_playing,
          track: {
            id: data.item.id,
            name: data.item.name,
            artist: data.item.artists.map(a => a.name).join(', '),
            album: data.item.album.name,
            uri: data.item.uri,
            durationMs: data.item.duration_ms,
          },
          progressMs: data.progress_ms,
        };
      }

      // --- Search ---
      case 'search': {
        const query = params.query as string;
        const type = params.type as string;
        const data = await spotifyJson<Record<string, { items: Array<Record<string, unknown>> }>>(
          `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}&limit=10`,
          token,
        );
        return data;
      }

      // --- Playlists ---
      case 'playlist-create': {
        // Get current user ID first
        const user = await spotifyJson<{ id: string }>('/me', token);
        const playlist = await spotifyJson<{ id: string; name: string; external_urls: { spotify: string } }>(
          `/users/${encodeURIComponent(user.id)}/playlists`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: params.name as string,
              description: (params.description as string) ?? '',
              public: (params.public as boolean) ?? true,
            }),
          },
        );
        return { playlistId: playlist.id, name: playlist.name, url: playlist.external_urls.spotify };
      }

      case 'playlist-add': {
        const playlistId = params.playlistId as string;
        const uris = params.uris as string[];
        const result = await spotifyJson<{ snapshot_id: string }>(
          `/playlists/${encodeURIComponent(playlistId)}/tracks`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ uris }),
          },
        );
        return { status: 'added', snapshotId: result.snapshot_id, trackCount: uris.length };
      }

      // --- Volume ---
      case 'playback-volume': {
        const volumePercent = params.volumePercent as number;
        await spotifyFetch(`/me/player/volume?volume_percent=${volumePercent}`, token, { method: 'PUT' });
        return { status: 'volume_set', volumePercent };
      }

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    if (triggerId !== 'track-changed') return [];

    try {
      const data = await spotifyJson<{
        item?: { id: string; name: string; artists: Array<{ name: string }>; album: { name: string }; uri: string; duration_ms: number };
        is_playing: boolean;
      }>('/me/player/currently-playing', token);

      if (!data.item) return [];

      return [{
        triggerId: 'track-changed',
        connectorId: 'spotify',
        data: {
          trackId: data.item.id,
          name: data.item.name,
          artist: data.item.artists.map(a => a.name).join(', '),
          album: data.item.album.name,
          uri: data.item.uri,
          durationMs: data.item.duration_ms,
          isPlaying: data.is_playing,
        },
        timestamp: Date.now(),
      }];
    } catch {
      return [];
    }
  },
});
