import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const REDDIT_BASE = 'https://oauth.reddit.com';
const REDDIT_UA = 'auxiora:v1.0.0 (by /u/auxiora)';

async function redditGet(token: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${REDDIT_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': REDDIT_UA,
    },
  });
  if (!res.ok) throw new Error(`Reddit API error: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function redditPost(token: string, path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${REDDIT_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': REDDIT_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`Reddit API error: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function extractPosts(listing: Record<string, unknown>): unknown[] {
  const data = listing.data as Record<string, unknown> | undefined;
  const children = (data?.children ?? []) as Array<Record<string, unknown>>;
  return children.map((c) => c.data);
}

export const redditConnector = defineConnector({
  id: 'reddit',
  name: 'Reddit',
  description: 'Integration with Reddit for browsing, posting, and messaging',
  version: '1.0.0',
  category: 'social',
  icon: 'reddit',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://www.reddit.com/api/v1/authorize',
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
      scopes: ['read', 'submit', 'privatemessages', 'vote', 'save', 'identity'],
    },
  },

  actions: [
    {
      id: 'front-page',
      name: 'Read Front Page',
      description: 'Read posts from the Reddit front page',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'subreddit-read',
      name: 'Read Subreddit',
      description: 'Read posts from a specific subreddit',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {
        subreddit: { type: 'string', description: 'Subreddit name', required: true },
      },
    },
    {
      id: 'post-submit',
      name: 'Submit Post',
      description: 'Submit a new post to a subreddit',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        subreddit: { type: 'string', description: 'Subreddit name', required: true },
        title: { type: 'string', description: 'Post title', required: true },
        body: { type: 'string', description: 'Post body', required: true },
      },
    },
    {
      id: 'comment',
      name: 'Post Comment',
      description: 'Post a comment on a Reddit post',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        postId: { type: 'string', description: 'Post ID to comment on', required: true },
        body: { type: 'string', description: 'Comment body', required: true },
      },
    },
    {
      id: 'inbox-read',
      name: 'Read Inbox',
      description: 'Read Reddit inbox messages',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'search',
      name: 'Search Reddit',
      description: 'Search across Reddit',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
      },
    },
    {
      id: 'save-post',
      name: 'Save Post',
      description: 'Save a Reddit post',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: true,
      sideEffects: true,
      params: {
        postId: { type: 'string', description: 'Post ID to save', required: true },
      },
    },
    {
      id: 'upvote',
      name: 'Upvote',
      description: 'Upvote or downvote a post',
      trustMinimum: 2,
      trustDomain: 'messaging',
      reversible: true,
      sideEffects: true,
      params: {
        postId: { type: 'string', description: 'Post ID to vote on', required: true },
        direction: { type: 'string', description: 'Vote direction (up or down)', default: 'up' },
      },
    },
  ],

  triggers: [
    {
      id: 'new-inbox',
      name: 'New Inbox Message',
      description: 'Triggered when a new inbox message is received',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
    {
      id: 'subreddit-new',
      name: 'New Subreddit Post',
      description: 'Triggered when a new post appears in a monitored subreddit',
      type: 'poll',
      pollIntervalMs: 300_000,
    },
  ],

  entities: [
    {
      id: 'post',
      name: 'Post',
      description: 'A Reddit post',
      fields: { id: 'string', title: 'string', subreddit: 'string', author: 'string', score: 'number', commentCount: 'number' },
    },
    {
      id: 'comment',
      name: 'Comment',
      description: 'A Reddit comment',
      fields: { id: 'string', body: 'string', author: 'string', score: 'number', postId: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'front-page': {
        const res = await redditGet(token, '/best?limit=25');
        return { posts: extractPosts(res) };
      }
      case 'subreddit-read': {
        const sub = params.subreddit as string;
        const res = await redditGet(token, `/r/${sub}/hot?limit=25`);
        return { posts: extractPosts(res) };
      }
      case 'post-submit': {
        const res = await redditPost(token, '/api/submit', {
          sr: params.subreddit as string,
          kind: 'self',
          title: params.title as string,
          text: params.body as string,
        });
        const json = res.json as Record<string, unknown> | undefined;
        const data = json?.data as Record<string, unknown> | undefined;
        return { postId: data?.id ?? data?.name, status: 'submitted' };
      }
      case 'comment': {
        const postId = params.postId as string;
        const thingId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
        const res = await redditPost(token, '/api/comment', {
          thing_id: thingId,
          text: params.body as string,
        });
        const json = res.json as Record<string, unknown> | undefined;
        const data = json?.data as Record<string, unknown> | undefined;
        const things = data?.things as Array<Record<string, unknown>> | undefined;
        const commentData = things?.[0]?.data as Record<string, unknown> | undefined;
        return { commentId: commentData?.id ?? commentData?.name, status: 'posted' };
      }
      case 'inbox-read': {
        const res = await redditGet(token, '/message/inbox?limit=25');
        return { messages: extractPosts(res) };
      }
      case 'search': {
        const query = encodeURIComponent(params.query as string);
        const res = await redditGet(token, `/search?q=${query}&limit=25`);
        return { posts: extractPosts(res) };
      }
      case 'save-post': {
        const postId = params.postId as string;
        const fullId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
        await redditPost(token, '/api/save', { id: fullId });
        return { postId: params.postId, status: 'saved' };
      }
      case 'upvote': {
        const postId = params.postId as string;
        const fullId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
        const direction = (params.direction as string) ?? 'up';
        const dir = direction === 'up' ? '1' : '-1';
        await redditPost(token, '/api/vote', { id: fullId, dir });
        return { postId: params.postId, status: 'voted' };
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    switch (triggerId) {
      case 'new-inbox': {
        const res = await redditGet(token, '/message/unread?limit=25');
        const messages = extractPosts(res) as Array<Record<string, unknown>>;
        return messages.map((m) => ({
          triggerId: 'new-inbox',
          connectorId: 'reddit',
          data: m,
          timestamp: typeof m.created_utc === 'number' ? (m.created_utc as number) * 1000 : Date.now(),
        }));
      }
      case 'subreddit-new':
        // Cannot poll specific subreddit without config
        return [];
      default:
        return [];
    }
  },
});
