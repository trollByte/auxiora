import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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
      case 'front-page':
        return { posts: [] };
      case 'subreddit-read':
        return { posts: [], subreddit: params.subreddit };
      case 'post-submit':
        return { postId: `post_${Date.now()}`, status: 'submitted', subreddit: params.subreddit };
      case 'comment':
        return { commentId: `comment_${Date.now()}`, status: 'posted', postId: params.postId };
      case 'inbox-read':
        return { messages: [] };
      case 'search':
        return { posts: [], query: params.query };
      case 'save-post':
        return { postId: params.postId, status: 'saved' };
      case 'upvote':
        return { postId: params.postId, status: 'voted', direction: params.direction ?? 'up' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
