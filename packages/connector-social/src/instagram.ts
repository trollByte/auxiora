import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

export const instagramConnector = defineConnector({
  id: 'instagram',
  name: 'Instagram',
  description: 'Integration with Instagram for posts, stories, and direct messages',
  version: '1.0.0',
  category: 'social',
  icon: 'instagram',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://api.instagram.com/oauth/authorize',
      tokenUrl: 'https://api.instagram.com/oauth/access_token',
      scopes: ['user_profile', 'user_media', 'instagram_basic', 'instagram_manage_messages'],
    },
  },

  actions: [
    {
      id: 'feed-read',
      name: 'Read Feed',
      description: 'Read the Instagram feed',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'stories-read',
      name: 'Read Stories',
      description: 'Read Instagram stories',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'dm-list',
      name: 'List Direct Messages',
      description: 'List Instagram direct messages',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'dm-send',
      name: 'Send Direct Message',
      description: 'Send an Instagram direct message',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        recipientId: { type: 'string', description: 'Recipient user ID', required: true },
        text: { type: 'string', description: 'Message text', required: true },
      },
    },
    {
      id: 'post-schedule',
      name: 'Schedule Post',
      description: 'Schedule a post on Instagram',
      trustMinimum: 3,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: true,
      params: {
        caption: { type: 'string', description: 'Post caption', required: true },
        mediaUrl: { type: 'string', description: 'Media URL', required: true },
        scheduledAt: { type: 'string', description: 'Scheduled time (ISO 8601)' },
      },
    },
    {
      id: 'profile-get',
      name: 'Get Profile',
      description: 'Get an Instagram profile',
      trustMinimum: 1,
      trustDomain: 'messaging',
      reversible: false,
      sideEffects: false,
      params: {
        userId: { type: 'string', description: 'User ID (default: authenticated user)' },
      },
    },
  ],

  triggers: [
    {
      id: 'new-dm',
      name: 'New Direct Message',
      description: 'Triggered when a new direct message is received',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
    {
      id: 'new-comment',
      name: 'New Comment',
      description: 'Triggered when a new comment is posted on your content',
      type: 'poll',
      pollIntervalMs: 300_000,
    },
  ],

  entities: [
    {
      id: 'post',
      name: 'Post',
      description: 'An Instagram post',
      fields: { id: 'string', caption: 'string', mediaUrl: 'string', likeCount: 'number', commentCount: 'number' },
    },
    {
      id: 'story',
      name: 'Story',
      description: 'An Instagram story',
      fields: { id: 'string', mediaUrl: 'string', expiresAt: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'feed-read':
        return { posts: [] };
      case 'stories-read':
        return { stories: [] };
      case 'dm-list':
        return { messages: [] };
      case 'dm-send':
        return { messageId: `dm_${Date.now()}`, status: 'sent', recipientId: params.recipientId };
      case 'post-schedule':
        return { postId: `post_${Date.now()}`, status: 'scheduled', caption: params.caption };
      case 'profile-get':
        return { userId: params.userId ?? 'me', username: '', bio: '' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
