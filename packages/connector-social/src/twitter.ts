import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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
      case 'timeline-read':
        return { tweets: [] };
      case 'mentions-list':
        return { mentions: [] };
      case 'post-tweet':
        return { tweetId: `tweet_${Date.now()}`, status: 'posted', text: params.text };
      case 'reply-tweet':
        return { tweetId: `tweet_${Date.now()}`, status: 'replied', inReplyTo: params.tweetId };
      case 'delete-tweet':
        return { tweetId: params.tweetId, status: 'deleted' };
      case 'search-tweets':
        return { tweets: [], query: params.query };
      case 'dm-list':
        return { messages: [] };
      case 'dm-send':
        return { messageId: `dm_${Date.now()}`, status: 'sent', recipientId: params.recipientId };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
