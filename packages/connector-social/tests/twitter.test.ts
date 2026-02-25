import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { twitterConnector } from '../src/twitter.js';

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

/** Mock GET /users/me then the actual endpoint */
function mockWithUserId(responseBody: unknown) {
  fetchMock.mockResolvedValueOnce(mockResponse({ data: { id: '123' } }));
  fetchMock.mockResolvedValueOnce(mockResponse(responseBody));
}

describe('Twitter / X Connector', () => {
  it('should have correct metadata', () => {
    expect(twitterConnector.id).toBe('twitter');
    expect(twitterConnector.name).toBe('Twitter / X');
    expect(twitterConnector.version).toBe('1.0.0');
    expect(twitterConnector.category).toBe('social');
  });

  it('should use OAuth2 authentication', () => {
    expect(twitterConnector.auth.type).toBe('oauth2');
    expect(twitterConnector.auth.oauth2).toBeDefined();
    expect(twitterConnector.auth.oauth2!.authUrl).toBe('https://twitter.com/i/oauth2/authorize');
    expect(twitterConnector.auth.oauth2!.tokenUrl).toBe('https://api.twitter.com/2/oauth2/token');
    expect(twitterConnector.auth.oauth2!.scopes).toContain('tweet.read');
    expect(twitterConnector.auth.oauth2!.scopes).toContain('tweet.write');
    expect(twitterConnector.auth.oauth2!.scopes.length).toBe(6);
  });

  it('should define all 8 actions', () => {
    expect(twitterConnector.actions).toHaveLength(8);
    const actionIds = twitterConnector.actions.map((a) => a.id);
    expect(actionIds).toContain('timeline-read');
    expect(actionIds).toContain('mentions-list');
    expect(actionIds).toContain('post-tweet');
    expect(actionIds).toContain('reply-tweet');
    expect(actionIds).toContain('delete-tweet');
    expect(actionIds).toContain('search-tweets');
    expect(actionIds).toContain('dm-list');
    expect(actionIds).toContain('dm-send');
  });

  it('should have correct trust and side effect settings', () => {
    const readAction = twitterConnector.actions.find((a) => a.id === 'timeline-read');
    expect(readAction!.trustMinimum).toBe(1);
    expect(readAction!.sideEffects).toBe(false);

    const postAction = twitterConnector.actions.find((a) => a.id === 'post-tweet');
    expect(postAction!.trustMinimum).toBe(3);
    expect(postAction!.sideEffects).toBe(true);
    expect(postAction!.reversible).toBe(false);
  });

  it('should use messaging trust domain for all actions', () => {
    for (const action of twitterConnector.actions) {
      expect(action.trustDomain).toBe('messaging');
    }
  });

  it('should execute timeline-read action', async () => {
    // GET /users/me -> { data: { id: '123' } }
    // GET /users/123/timelines/reverse_chronological -> { data: [] }
    mockWithUserId({ data: [] });
    const result = await twitterConnector.executeAction('timeline-read', {}, 'token');
    expect(result).toEqual({ tweets: [] });
  });

  it('should execute post-tweet action', async () => {
    // POST /tweets -> { data: { id: 't1' } }
    fetchMock.mockResolvedValueOnce(mockResponse({ data: { id: 't1' } }));
    const result = await twitterConnector.executeAction('post-tweet', { text: 'Hello' }, 'token') as any;
    expect(result.status).toBe('posted');
    expect(result.tweetId).toBe('t1');
  });

  it('should execute dm-send action', async () => {
    // POST /dm_conversations/with/u1/messages -> { data: { dm_event_id: 'dm1' } }
    fetchMock.mockResolvedValueOnce(mockResponse({ data: { dm_event_id: 'dm1' } }));
    const result = await twitterConnector.executeAction('dm-send', { recipientId: 'u1', text: 'Hi' }, 'token') as any;
    expect(result.status).toBe('sent');
    expect(result.messageId).toBe('dm1');
  });

  it('should throw for unknown action', async () => {
    await expect(twitterConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    // GET /users/me -> { data: { id: '123' } }
    // GET /users/123/mentions -> { data: [] }
    mockWithUserId({ data: [] });
    const events = await twitterConnector.pollTrigger!('new-mention', 'token');
    expect(events).toEqual([]);
  });

  it('should define triggers', () => {
    expect(twitterConnector.triggers).toHaveLength(2);
    const triggerIds = twitterConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('new-mention');
    expect(triggerIds).toContain('new-dm');
  });

  it('should define entities', () => {
    expect(twitterConnector.entities).toHaveLength(2);
    const entityIds = twitterConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('tweet');
    expect(entityIds).toContain('direct-message');
  });
});
