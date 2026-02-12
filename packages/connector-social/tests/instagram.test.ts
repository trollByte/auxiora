import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { instagramConnector } from '../src/instagram.js';

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

describe('Instagram Connector', () => {
  it('should have correct metadata', () => {
    expect(instagramConnector.id).toBe('instagram');
    expect(instagramConnector.name).toBe('Instagram');
    expect(instagramConnector.version).toBe('1.0.0');
    expect(instagramConnector.category).toBe('social');
  });

  it('should use OAuth2 authentication', () => {
    expect(instagramConnector.auth.type).toBe('oauth2');
    expect(instagramConnector.auth.oauth2).toBeDefined();
    expect(instagramConnector.auth.oauth2!.authUrl).toBe('https://api.instagram.com/oauth/authorize');
    expect(instagramConnector.auth.oauth2!.tokenUrl).toBe('https://api.instagram.com/oauth/access_token');
    expect(instagramConnector.auth.oauth2!.scopes).toContain('instagram_basic');
    expect(instagramConnector.auth.oauth2!.scopes.length).toBe(4);
  });

  it('should define all 6 actions', () => {
    expect(instagramConnector.actions).toHaveLength(6);
    const actionIds = instagramConnector.actions.map((a) => a.id);
    expect(actionIds).toContain('feed-read');
    expect(actionIds).toContain('stories-read');
    expect(actionIds).toContain('dm-list');
    expect(actionIds).toContain('dm-send');
    expect(actionIds).toContain('post-schedule');
    expect(actionIds).toContain('profile-get');
  });

  it('should have correct trust and side effect settings', () => {
    const readAction = instagramConnector.actions.find((a) => a.id === 'feed-read');
    expect(readAction!.trustMinimum).toBe(1);
    expect(readAction!.sideEffects).toBe(false);

    const dmAction = instagramConnector.actions.find((a) => a.id === 'dm-send');
    expect(dmAction!.trustMinimum).toBe(3);
    expect(dmAction!.sideEffects).toBe(true);
  });

  it('should execute feed-read action', async () => {
    // GET /me/media?fields=... -> { data: [] }
    fetchMock.mockResolvedValueOnce(mockResponse({ data: [] }));
    const result = await instagramConnector.executeAction('feed-read', {}, 'token');
    expect(result).toEqual({ posts: [] });
  });

  it('should execute dm-send action', async () => {
    // dm-send returns unavailable status (Instagram Messaging API requires approved access)
    const result = await instagramConnector.executeAction('dm-send', { recipientId: 'u1', text: 'Hi' }, 'token') as any;
    expect(result.status).toBe('unavailable');
  });

  it('should execute post-schedule action', async () => {
    // POST /me/media -> { id: 'container1' } (create media container)
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'container1' }));
    // POST /me/media_publish -> { id: 'post1' } (publish)
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'post1' }));
    const result = await instagramConnector.executeAction('post-schedule', { caption: 'Hello', mediaUrl: 'https://example.com/img.jpg' }, 'token') as any;
    expect(result.status).toBe('published');
    expect(result.postId).toBe('post1');
  });

  it('should execute profile-get action', async () => {
    // GET /me?fields=... -> profile object
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'me123', username: 'testuser', name: 'Test' }));
    const result = await instagramConnector.executeAction('profile-get', {}, 'token') as any;
    expect(result.id).toBe('me123');
  });

  it('should throw for unknown action', async () => {
    await expect(instagramConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    // new-dm trigger returns [] directly without fetching
    const events = await instagramConnector.pollTrigger!('new-dm', 'token');
    expect(events).toEqual([]);
  });

  it('should define triggers', () => {
    expect(instagramConnector.triggers).toHaveLength(2);
    const triggerIds = instagramConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('new-dm');
    expect(triggerIds).toContain('new-comment');
  });

  it('should define entities', () => {
    expect(instagramConnector.entities).toHaveLength(2);
    const entityIds = instagramConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('post');
    expect(entityIds).toContain('story');
  });
});
