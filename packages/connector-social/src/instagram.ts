import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

async function instagramFetch(token: string, path: string, options?: { method?: string; body?: unknown }) {
  const url = new URL(`https://graph.instagram.com${path}`);
  if (!options?.method || options.method === 'GET') {
    url.searchParams.set('access_token', token);
  }
  const res = await fetch(url.toString(), {
    method: options?.method ?? 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Authorization': `Bearer ${token}` },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`Instagram API error: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

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
      case 'feed-read': {
        const res = await instagramFetch(token, '/me/media?fields=id,caption,media_url,timestamp,like_count,comments_count');
        return { posts: res.data };
      }
      case 'stories-read': {
        const res = await instagramFetch(token, '/me/stories?fields=id,media_url,timestamp');
        return { stories: res.data };
      }
      case 'dm-list': {
        return { messages: [], note: 'Instagram Messaging API requires approved app access' };
      }
      case 'dm-send': {
        return { error: 'Instagram Messaging API requires approved app access', status: 'unavailable' };
      }
      case 'post-schedule': {
        // Step 1: Create media container
        const container = await instagramFetch(token, '/me/media', {
          method: 'POST',
          body: {
            caption: params.caption,
            image_url: params.mediaUrl,
          },
        });
        const creationId = container.id as string;
        // Step 2: Publish the media
        const published = await instagramFetch(token, '/me/media_publish', {
          method: 'POST',
          body: { creation_id: creationId },
        });
        return { postId: published.id, status: 'published' };
      }
      case 'profile-get': {
        const userId = (params.userId as string | undefined) ?? 'me';
        const fields = 'id,username,name,biography,media_count,followers_count,follows_count';
        const res = await instagramFetch(token, `/${userId}?fields=${fields}`);
        return res;
      }
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    switch (triggerId) {
      case 'new-dm':
        // Instagram Messaging API requires approved access
        return [];
      case 'new-comment': {
        const media = await instagramFetch(token, '/me/media?fields=id&limit=10');
        const posts = (media.data ?? []) as Array<Record<string, unknown>>;
        const events: TriggerEvent[] = [];
        const since = lastPollAt ? new Date(lastPollAt).toISOString() : undefined;
        for (const post of posts) {
          const sinceParam = since ? `&since=${since}` : '';
          const commentsRes = await instagramFetch(token, `/${post.id as string}/comments?fields=id,text,username,timestamp${sinceParam}`);
          const comments = (commentsRes.data ?? []) as Array<Record<string, unknown>>;
          for (const comment of comments) {
            events.push({
              triggerId: 'new-comment',
              connectorId: 'instagram',
              data: { ...comment, mediaId: post.id },
              timestamp: comment.timestamp ? new Date(comment.timestamp as string).getTime() : Date.now(),
            });
          }
        }
        return events;
      }
      default:
        return [];
    }
  },
});
