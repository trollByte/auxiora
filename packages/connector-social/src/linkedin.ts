import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

async function linkedinFetch(token: string, path: string, options?: { method?: string; body?: unknown }) {
  const res = await fetch(`https://api.linkedin.com/v2${path}`, {
    method: options?.method ?? 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`LinkedIn API error: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export const linkedinConnector = defineConnector({
  id: 'linkedin',
  name: 'LinkedIn',
  description: 'Integration with LinkedIn for posts, connections, and messaging',
  version: '1.0.0',
  category: 'social',
  icon: 'linkedin',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social', 'r_basicprofile'],
    },
  },

  actions: [
    {
      id: 'feed-read',
      name: 'Read Feed',
      description: 'Read the LinkedIn news feed',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'post-update',
      name: 'Post Update',
      description: 'Post a status update on LinkedIn',
      trustMinimum: 3,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        text: { type: 'string', description: 'Post text', required: true },
      },
    },
    {
      id: 'post-article',
      name: 'Post Article',
      description: 'Share an article on LinkedIn',
      trustMinimum: 3,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        title: { type: 'string', description: 'Article title', required: true },
        url: { type: 'string', description: 'Article URL', required: true },
        commentary: { type: 'string', description: 'Commentary text' },
      },
    },
    {
      id: 'connections-list',
      name: 'List Connections',
      description: 'List LinkedIn connections',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'messages-list',
      name: 'List Messages',
      description: 'List LinkedIn messages',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'message-send',
      name: 'Send Message',
      description: 'Send a message on LinkedIn',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        recipientId: { type: 'string', description: 'Recipient profile ID', required: true },
        text: { type: 'string', description: 'Message text', required: true },
      },
    },
    {
      id: 'profile-get',
      name: 'Get Profile',
      description: 'Get a LinkedIn profile',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        profileId: { type: 'string', description: 'Profile ID (default: authenticated user)' },
      },
    },
  ],

  triggers: [
    {
      id: 'new-message',
      name: 'New Message',
      description: 'Triggered when a new LinkedIn message is received',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
    {
      id: 'post-engagement',
      name: 'Post Engagement',
      description: 'Triggered when a post receives engagement',
      type: 'poll',
      pollIntervalMs: 300_000,
    },
  ],

  entities: [
    {
      id: 'post',
      name: 'Post',
      description: 'A LinkedIn post',
      fields: { id: 'string', text: 'string', authorName: 'string', likes: 'number', comments: 'number', shares: 'number' },
    },
    {
      id: 'connection',
      name: 'Connection',
      description: 'A LinkedIn connection',
      fields: { id: 'string', name: 'string', headline: 'string', company: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'feed-read': {
        const me = await linkedinFetch(token, '/me');
        const urn = `urn:li:person:${me.id as string}`;
        try {
          const posts = await linkedinFetch(token, `/ugcPosts?q=authors&authors=List(${encodeURIComponent(urn)})&count=10`);
          return { posts: posts.elements };
        } catch (err) {
          return { posts: [], error: `Feed access restricted: ${(err as Error).message}` };
        }
      }
      case 'post-update': {
        const me = await linkedinFetch(token, '/me');
        const authorUrn = `urn:li:person:${me.id as string}`;
        const res = await linkedinFetch(token, '/ugcPosts', {
          method: 'POST',
          body: {
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: params.text },
                shareMediaCategory: 'NONE',
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          },
        });
        return { postId: res.id, status: 'posted' };
      }
      case 'post-article': {
        const me = await linkedinFetch(token, '/me');
        const authorUrn = `urn:li:person:${me.id as string}`;
        const res = await linkedinFetch(token, '/ugcPosts', {
          method: 'POST',
          body: {
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: (params.commentary as string) ?? '' },
                shareMediaCategory: 'ARTICLE',
                media: [{
                  status: 'READY',
                  originalUrl: params.url,
                  title: { text: params.title },
                }],
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          },
        });
        return { postId: res.id, status: 'shared' };
      }
      case 'connections-list': {
        try {
          const res = await linkedinFetch(token, '/connections?q=viewer&count=50');
          return { connections: res.elements };
        } catch (err) {
          return { connections: [], error: `Connections access restricted: ${(err as Error).message}` };
        }
      }
      case 'messages-list': {
        try {
          const res = await linkedinFetch(token, '/messages');
          return { messages: res.elements };
        } catch (err) {
          return { messages: [], error: `Messages access restricted: ${(err as Error).message}` };
        }
      }
      case 'message-send': {
        const res = await linkedinFetch(token, '/messages', {
          method: 'POST',
          body: {
            recipients: [`urn:li:person:${params.recipientId as string}`],
            body: params.text,
          },
        });
        return { messageId: res.id, status: 'sent' };
      }
      case 'profile-get': {
        const profileId = params.profileId as string | undefined;
        const path = profileId ? `/people/(id:${profileId})` : '/me';
        const profile = await linkedinFetch(token, path);
        return profile;
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  // LinkedIn doesn't support efficient polling for triggers
  async pollTrigger(_triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
