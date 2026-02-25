import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

async function twitterFetch(token: string, path: string, options?: { method?: string; body?: unknown }) {
  const res = await fetch(`https://api.twitter.com/2${path}`, {
    method: options?.method ?? 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`Twitter API error: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function getMyUserId(token: string): Promise<string> {
  const res = await twitterFetch(token, '/users/me');
  const data = res.data as Record<string, unknown>;
  return data.id as string;
}

export const twitterConnector = defineConnector({
  id: 'twitter',
  name: 'Twitter / X',
  description: 'Integration with Twitter/X for tweets, mentions, and direct messages',
  version: '1.0.0',
  category: 'social',
  icon: 'twitter',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'dm.read', 'dm.write', 'offline.access'],
    },
  },

  actions: [
    {
      id: 'timeline-read',
      name: 'Read Timeline',
      description: 'Read the authenticated user timeline',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'mentions-list',
      name: 'List Mentions',
      description: 'List recent mentions of the authenticated user',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'post-tweet',
      name: 'Post Tweet',
      description: 'Post a new tweet',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        text: { type: 'string', description: 'Tweet text', required: true },
      },
    },
    {
      id: 'reply-tweet',
      name: 'Reply to Tweet',
      description: 'Reply to an existing tweet',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        tweetId: { type: 'string', description: 'Tweet ID to reply to', required: true },
        text: { type: 'string', description: 'Reply text', required: true },
      },
    },
    {
      id: 'delete-tweet',
      name: 'Delete Tweet',
      description: 'Delete an existing tweet',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        tweetId: { type: 'string', description: 'Tweet ID to delete', required: true },
      },
    },
    {
      id: 'search-tweets',
      name: 'Search Tweets',
      description: 'Search for tweets matching a query',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
      },
    },
    {
      id: 'dm-list',
      name: 'List Direct Messages',
      description: 'List recent direct messages',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'dm-send',
      name: 'Send Direct Message',
      description: 'Send a direct message to a user',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        recipientId: { type: 'string', description: 'Recipient user ID', required: true },
        text: { type: 'string', description: 'Message text', required: true },
      },
    },
  ],

  triggers: [
    {
      id: 'new-mention',
      name: 'New Mention',
      description: 'Triggered when the user is mentioned in a tweet',
      type: 'poll',
      pollIntervalMs: 60_000,
    },
    {
      id: 'new-dm',
      name: 'New Direct Message',
      description: 'Triggered when a new direct message is received',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
  ],

  entities: [
    {
      id: 'tweet',
      name: 'Tweet',
      description: 'A tweet on Twitter/X',
      fields: { id: 'string', text: 'string', authorId: 'string', createdAt: 'string', likeCount: 'number', retweetCount: 'number' },
    },
    {
      id: 'direct-message',
      name: 'Direct Message',
      description: 'A direct message on Twitter/X',
      fields: { id: 'string', text: 'string', senderId: 'string', createdAt: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'timeline-read': {
        const userId = await getMyUserId(token);
        const res = await twitterFetch(token, `/users/${userId}/timelines/reverse_chronological`);
        return { tweets: res.data };
      }
      case 'mentions-list': {
        const userId = await getMyUserId(token);
        const res = await twitterFetch(token, `/users/${userId}/mentions`);
        return { mentions: res.data };
      }
      case 'post-tweet': {
        const res = await twitterFetch(token, '/tweets', {
          method: 'POST',
          body: { text: params.text },
        });
        const data = res.data as Record<string, unknown>;
        return { tweetId: data.id, status: 'posted' };
      }
      case 'reply-tweet': {
        const res = await twitterFetch(token, '/tweets', {
          method: 'POST',
          body: { text: params.text, reply: { in_reply_to_tweet_id: params.tweetId } },
        });
        const data = res.data as Record<string, unknown>;
        return { tweetId: data.id, status: 'replied' };
      }
      case 'delete-tweet': {
        await twitterFetch(token, `/tweets/${params.tweetId as string}`, { method: 'DELETE' });
        return { tweetId: params.tweetId, status: 'deleted' };
      }
      case 'search-tweets': {
        const query = encodeURIComponent(params.query as string);
        const res = await twitterFetch(token, `/tweets/search/recent?query=${query}`);
        return { tweets: res.data };
      }
      case 'dm-list': {
        const res = await twitterFetch(token, '/dm_events');
        return { messages: res.data };
      }
      case 'dm-send': {
        const res = await twitterFetch(token, `/dm_conversations/with/${params.recipientId as string}/messages`, {
          method: 'POST',
          body: { text: params.text },
        });
        const data = res.data as Record<string, unknown>;
        return { messageId: data.dm_event_id ?? data.id, status: 'sent' };
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    switch (triggerId) {
      case 'new-mention': {
        const userId = await getMyUserId(token);
        const startTime = lastPollAt ? new Date(lastPollAt).toISOString() : undefined;
        const query = startTime ? `?start_time=${startTime}` : '';
        const res = await twitterFetch(token, `/users/${userId}/mentions${query}`);
        const mentions = (res.data ?? []) as Array<Record<string, unknown>>;
        return mentions.map((m) => ({
          triggerId: 'new-mention',
          connectorId: 'twitter',
          data: m,
          timestamp: m.created_at ? new Date(m.created_at as string).getTime() : Date.now(),
        }));
      }
      case 'new-dm': {
        const res = await twitterFetch(token, '/dm_events?event_types=MessageCreate');
        const events = (res.data ?? []) as Array<Record<string, unknown>>;
        const cutoff = lastPollAt ?? 0;
        return events
          .filter((e) => {
            const ts = e.created_at ? new Date(e.created_at as string).getTime() : 0;
            return ts > cutoff;
          })
          .map((e) => ({
            triggerId: 'new-dm',
            connectorId: 'twitter',
            data: e,
            timestamp: e.created_at ? new Date(e.created_at as string).getTime() : Date.now(),
          }));
      }
      default:
        return [];
    }
  },
});
