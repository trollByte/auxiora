import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { linkedinConnector } from '../src/linkedin.js';

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

describe('LinkedIn Connector', () => {
  it('should have correct metadata', () => {
    expect(linkedinConnector.id).toBe('linkedin');
    expect(linkedinConnector.name).toBe('LinkedIn');
    expect(linkedinConnector.version).toBe('1.0.0');
    expect(linkedinConnector.category).toBe('social');
  });

  it('should use OAuth2 authentication', () => {
    expect(linkedinConnector.auth.type).toBe('oauth2');
    expect(linkedinConnector.auth.oauth2).toBeDefined();
    expect(linkedinConnector.auth.oauth2!.authUrl).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(linkedinConnector.auth.oauth2!.tokenUrl).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    expect(linkedinConnector.auth.oauth2!.scopes).toContain('w_member_social');
    expect(linkedinConnector.auth.oauth2!.scopes.length).toBe(4);
  });

  it('should define all 7 actions', () => {
    expect(linkedinConnector.actions).toHaveLength(7);
    const actionIds = linkedinConnector.actions.map((a) => a.id);
    expect(actionIds).toContain('feed-read');
    expect(actionIds).toContain('post-update');
    expect(actionIds).toContain('post-article');
    expect(actionIds).toContain('connections-list');
    expect(actionIds).toContain('messages-list');
    expect(actionIds).toContain('message-send');
    expect(actionIds).toContain('profile-get');
  });

  it('should use correct trust domains', () => {
    const messageAction = linkedinConnector.actions.find((a) => a.id === 'message-send');
    expect(messageAction!.trustDomain).toBe('messaging');

    const feedAction = linkedinConnector.actions.find((a) => a.id === 'feed-read');
    expect(feedAction!.trustDomain).toBe('integrations');

    const postAction = linkedinConnector.actions.find((a) => a.id === 'post-update');
    expect(postAction!.trustDomain).toBe('integrations');
  });

  it('should execute post-update action', async () => {
    // GET /me -> { id: 'abc' }
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'abc' }));
    // POST /ugcPosts -> { id: 'post1' }
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'post1' }));
    const result = await linkedinConnector.executeAction('post-update', { text: 'Update' }, 'token') as any;
    expect(result.status).toBe('posted');
    expect(result.postId).toBe('post1');
  });

  it('should execute message-send action', async () => {
    // POST /messages -> { id: 'msg1' }
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'msg1' }));
    const result = await linkedinConnector.executeAction('message-send', { recipientId: 'p1', text: 'Hi' }, 'token') as any;
    expect(result.status).toBe('sent');
    expect(result.messageId).toBe('msg1');
  });

  it('should execute profile-get action', async () => {
    // GET /me -> profile object
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'me', firstName: 'Test', lastName: 'User' }));
    const result = await linkedinConnector.executeAction('profile-get', {}, 'token') as any;
    expect(result.id).toBe('me');
  });

  it('should throw for unknown action', async () => {
    await expect(linkedinConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });

  it('should return empty events from pollTrigger', async () => {
    const events = await linkedinConnector.pollTrigger!('new-message', 'token');
    expect(events).toEqual([]);
  });

  it('should define triggers', () => {
    expect(linkedinConnector.triggers).toHaveLength(2);
    const triggerIds = linkedinConnector.triggers.map((t) => t.id);
    expect(triggerIds).toContain('new-message');
    expect(triggerIds).toContain('post-engagement');
  });

  it('should define entities', () => {
    expect(linkedinConnector.entities).toHaveLength(2);
    const entityIds = linkedinConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('post');
    expect(entityIds).toContain('connection');
  });
});
