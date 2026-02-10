import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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
      case 'feed-read':
        return { posts: [] };
      case 'post-update':
        return { postId: `post_${Date.now()}`, status: 'posted', text: params.text };
      case 'post-article':
        return { postId: `post_${Date.now()}`, status: 'shared', title: params.title };
      case 'connections-list':
        return { connections: [] };
      case 'messages-list':
        return { messages: [] };
      case 'message-send':
        return { messageId: `msg_${Date.now()}`, status: 'sent', recipientId: params.recipientId };
      case 'profile-get':
        return { profileId: params.profileId ?? 'me', name: '', headline: '' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
