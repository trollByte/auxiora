import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spotifyConnector } from '../src/connector.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN = 'test-bearer-token';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response;
}

function expectBearerAuth(call: unknown[]): void {
  const init = call[1] as RequestInit;
  const headers = init.headers as Record<string, string>;
  expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  expect(headers['Content-Type']).toBe('application/json');
}

describe('spotifyConnector.executeAction', () => {
  // --- playback-play ---
  describe('playback-play', () => {
    it('should PUT to /me/player/play with no body when no uri given', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

      const result = await spotifyConnector.executeAction('playback-play', {}, TOKEN);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/play`);
      expect(init.method).toBe('PUT');
      expect(init.body).toBeUndefined();
      expectBearerAuth(mockFetch.mock.calls[0]);
      expect(result).toEqual({ status: 'playing', uri: null });
    });

    it('should send uris array for a track URI', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));
      const trackUri = 'spotify:track:6rqhFgbbKwnb9MLmUQDhG6';

      const result = await spotifyConnector.executeAction('playback-play', { uri: trackUri }, TOKEN);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ uris: [trackUri] });
      expect(result).toEqual({ status: 'playing', uri: trackUri });
    });

    it('should send context_uri for a playlist URI', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));
      const playlistUri = 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';

      await spotifyConnector.executeAction('playback-play', { uri: playlistUri }, TOKEN);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ context_uri: playlistUri });
    });

    it('should send context_uri for an album URI', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));
      const albumUri = 'spotify:album:1DFixLWuPkv3KT3TnV35m3';

      await spotifyConnector.executeAction('playback-play', { uri: albumUri }, TOKEN);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ context_uri: albumUri });
    });
  });

  // --- playback-pause ---
  describe('playback-pause', () => {
    it('should PUT to /me/player/pause', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

      const result = await spotifyConnector.executeAction('playback-pause', {}, TOKEN);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/pause`);
      expect(init.method).toBe('PUT');
      expectBearerAuth(mockFetch.mock.calls[0]);
      expect(result).toEqual({ status: 'paused' });
    });
  });

  // --- playback-skip ---
  describe('playback-skip', () => {
    it('should POST to /me/player/next for direction "next"', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

      const result = await spotifyConnector.executeAction('playback-skip', { direction: 'next' }, TOKEN);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/next`);
      expect(init.method).toBe('POST');
      expectBearerAuth(mockFetch.mock.calls[0]);
      expect(result).toEqual({ status: 'skipped', direction: 'next' });
    });

    it('should POST to /me/player/previous for direction "previous"', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

      const result = await spotifyConnector.executeAction('playback-skip', { direction: 'previous' }, TOKEN);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/previous`);
      expect(init.method).toBe('POST');
      expect(result).toEqual({ status: 'skipped', direction: 'previous' });
    });

    it('should throw for an invalid direction', async () => {
      await expect(
        spotifyConnector.executeAction('playback-skip', { direction: 'sideways' }, TOKEN),
      ).rejects.toThrow('direction must be "next" or "previous"');
    });
  });

  // --- playback-current ---
  describe('playback-current', () => {
    it('should GET /me/player/currently-playing and parse the track', async () => {
      const apiResponse = {
        item: {
          id: 'track-1',
          name: 'Bohemian Rhapsody',
          artists: [{ name: 'Queen' }],
          album: { name: 'A Night at the Opera' },
          uri: 'spotify:track:track-1',
          duration_ms: 354000,
        },
        is_playing: true,
        progress_ms: 120000,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const result = await spotifyConnector.executeAction('playback-current', {}, TOKEN);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/currently-playing`);
      expect(init.method).toBeUndefined(); // GET is the default
      expectBearerAuth(mockFetch.mock.calls[0]);
      expect(result).toEqual({
        playing: true,
        track: {
          id: 'track-1',
          name: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          uri: 'spotify:track:track-1',
          durationMs: 354000,
        },
        progressMs: 120000,
      });
    });

    it('should return playing: false when no item is present', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ is_playing: false }));

      const result = await spotifyConnector.executeAction('playback-current', {}, TOKEN);

      expect(result).toEqual({ playing: false });
    });

    it('should join multiple artists with commas', async () => {
      const apiResponse = {
        item: {
          id: 'track-2',
          name: 'Under Pressure',
          artists: [{ name: 'Queen' }, { name: 'David Bowie' }],
          album: { name: 'Hot Space' },
          uri: 'spotify:track:track-2',
          duration_ms: 248000,
        },
        is_playing: true,
        progress_ms: 50000,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const result = await spotifyConnector.executeAction('playback-current', {}, TOKEN) as Record<string, unknown>;
      const track = result.track as Record<string, unknown>;
      expect(track.artist).toBe('Queen, David Bowie');
    });
  });

  // --- search ---
  describe('search', () => {
    it('should GET /search with encoded query and type', async () => {
      const searchResult = { tracks: { items: [{ id: 't1', name: 'Test' }] } };
      mockFetch.mockResolvedValueOnce(mockResponse(searchResult));

      const result = await spotifyConnector.executeAction('search', { query: 'bohemian rhapsody', type: 'track' }, TOKEN);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/search?q=bohemian%20rhapsody&type=track&limit=10`);
      expect(init.method).toBeUndefined(); // GET default
      expectBearerAuth(mockFetch.mock.calls[0]);
      expect(result).toEqual(searchResult);
    });

    it('should URL-encode special characters in query', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ tracks: { items: [] } }));

      await spotifyConnector.executeAction('search', { query: 'rock & roll', type: 'track' }, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('q=rock%20%26%20roll');
    });
  });

  // --- playlist-create ---
  describe('playlist-create', () => {
    it('should GET /me then POST to /users/{id}/playlists', async () => {
      // First call: GET /me
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user-123' }));
      // Second call: POST /users/user-123/playlists
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'playlist-abc',
        name: 'My Playlist',
        external_urls: { spotify: 'https://open.spotify.com/playlist/abc' },
      }));

      const result = await spotifyConnector.executeAction('playlist-create', {
        name: 'My Playlist',
        description: 'A test playlist',
        public: false,
      }, TOKEN);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify first call: GET /me
      const [url1, init1] = mockFetch.mock.calls[0];
      expect(url1).toBe(`${SPOTIFY_API}/me`);
      expect(init1.method).toBeUndefined(); // GET default
      expectBearerAuth(mockFetch.mock.calls[0]);

      // Verify second call: POST /users/{id}/playlists
      const [url2, init2] = mockFetch.mock.calls[1];
      expect(url2).toBe(`${SPOTIFY_API}/users/user-123/playlists`);
      expect(init2.method).toBe('POST');
      expectBearerAuth(mockFetch.mock.calls[1]);
      const body = JSON.parse(init2.body as string);
      expect(body).toEqual({
        name: 'My Playlist',
        description: 'A test playlist',
        public: false,
      });

      expect(result).toEqual({
        playlistId: 'playlist-abc',
        name: 'My Playlist',
        url: 'https://open.spotify.com/playlist/abc',
      });
    });

    it('should URL-encode the user ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user with spaces' }));
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 'pl-1',
        name: 'Test',
        external_urls: { spotify: 'https://open.spotify.com/playlist/pl-1' },
      }));

      await spotifyConnector.executeAction('playlist-create', { name: 'Test' }, TOKEN);

      const [url2] = mockFetch.mock.calls[1];
      expect(url2).toBe(`${SPOTIFY_API}/users/user%20with%20spaces/playlists`);
    });
  });

  // --- playlist-add ---
  describe('playlist-add', () => {
    it('should POST track URIs to /playlists/{id}/tracks', async () => {
      const uris = ['spotify:track:aaa', 'spotify:track:bbb'];
      mockFetch.mockResolvedValueOnce(mockResponse({ snapshot_id: 'snap-1' }));

      const result = await spotifyConnector.executeAction('playlist-add', {
        playlistId: 'playlist-xyz',
        uris,
      }, TOKEN);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/playlists/playlist-xyz/tracks`);
      expect(init.method).toBe('POST');
      expectBearerAuth(mockFetch.mock.calls[0]);
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ uris });
      expect(result).toEqual({ status: 'added', snapshotId: 'snap-1', trackCount: 2 });
    });
  });

  // --- playback-volume ---
  describe('playback-volume', () => {
    it('should PUT to /me/player/volume with volume_percent query param', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

      const result = await spotifyConnector.executeAction('playback-volume', { volumePercent: 75 }, TOKEN);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/volume?volume_percent=75`);
      expect(init.method).toBe('PUT');
      expectBearerAuth(mockFetch.mock.calls[0]);
      expect(result).toEqual({ status: 'volume_set', volumePercent: 75 });
    });

    it('should handle volume at 0', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

      const result = await spotifyConnector.executeAction('playback-volume', { volumePercent: 0 }, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SPOTIFY_API}/me/player/volume?volume_percent=0`);
      expect(result).toEqual({ status: 'volume_set', volumePercent: 0 });
    });
  });

  // --- unknown action ---
  describe('unknown action', () => {
    it('should throw for an unknown action ID', async () => {
      await expect(
        spotifyConnector.executeAction('nonexistent', {}, TOKEN),
      ).rejects.toThrow('Unknown action: nonexistent');
    });
  });

  // --- error handling ---
  describe('error handling', () => {
    it('should throw on non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: { message: 'No active device found' } }, 404));

      await expect(
        spotifyConnector.executeAction('playback-pause', {}, TOKEN),
      ).rejects.toThrow('Spotify API error 404');
    });
  });
});

describe('spotifyConnector.pollTrigger', () => {
  describe('track-changed', () => {
    it('should return a trigger event when a track is playing', async () => {
      const apiResponse = {
        item: {
          id: 'track-99',
          name: 'Starman',
          artists: [{ name: 'David Bowie' }],
          album: { name: 'Ziggy Stardust' },
          uri: 'spotify:track:track-99',
          duration_ms: 258000,
        },
        is_playing: true,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const events = await spotifyConnector.pollTrigger('track-changed', TOKEN);

      expect(events).toHaveLength(1);
      expect(events[0].triggerId).toBe('track-changed');
      expect(events[0].connectorId).toBe('spotify');
      expect(events[0].data).toEqual({
        trackId: 'track-99',
        name: 'Starman',
        artist: 'David Bowie',
        album: 'Ziggy Stardust',
        uri: 'spotify:track:track-99',
        durationMs: 258000,
        isPlaying: true,
      });
      expect(events[0].timestamp).toBeTypeOf('number');
    });

    it('should return empty array when no track is playing', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ is_playing: false }));

      const events = await spotifyConnector.pollTrigger('track-changed', TOKEN);

      expect(events).toEqual([]);
    });

    it('should return empty array on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'unauthorized' }, 401));

      const events = await spotifyConnector.pollTrigger('track-changed', TOKEN);

      expect(events).toEqual([]);
    });

    it('should return empty array for unknown trigger IDs', async () => {
      const events = await spotifyConnector.pollTrigger('nonexistent', TOKEN);

      expect(events).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
