import type { Tool, ToolParameter, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:social');

let socialConnectors: any = null;

export function setSocialConnectors(connectors: any): void {
  socialConnectors = connectors;
  logger.info('Social connectors connected to tools');
}

export const PostSocialTool: Tool = {
  name: 'post_social',
  description: 'Post content to a social media platform (Twitter/X, LinkedIn, Reddit). Call this when the user wants to publish a post, tweet, or status update.',

  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform: "twitter", "linkedin", or "reddit"',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'Post content/text',
      required: true,
    },
    {
      name: 'subreddit',
      type: 'string',
      description: 'Subreddit name (required for Reddit posts)',
      required: false,
    },
    {
      name: 'title',
      type: 'string',
      description: 'Post title (required for Reddit, optional for LinkedIn)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!socialConnectors) {
        return { success: false, error: 'No social accounts connected. Use /connect to add one.' };
      }

      const actionMap: Record<string, string> = {
        twitter: 'post-tweet',
        linkedin: 'create-post',
        reddit: 'submit-post',
      };

      const action = actionMap[params.platform];
      if (!action) {
        return { success: false, error: `Unsupported platform: ${params.platform}` };
      }

      const result = await socialConnectors.execute(action, {
        content: params.content,
        title: params.title,
        subreddit: params.subreddit,
      });

      return {
        success: true,
        output: JSON.stringify({
          posted: true,
          platform: params.platform,
          ...result,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const CheckMentionsTool: Tool = {
  name: 'check_mentions',
  description: 'Check recent mentions, notifications, or messages on social media platforms. Call this when the user asks about social media activity, mentions, or notifications.',

  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Platform to check: "twitter", "linkedin", "reddit", or "all"',
      required: false,
      default: 'all',
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of mentions to return',
      required: false,
      default: 10,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!socialConnectors) {
        return { success: false, error: 'No social accounts connected. Use /connect to add one.' };
      }

      const platform = params.platform || 'all';

      const platforms = platform === 'all'
        ? ['twitter', 'linkedin', 'reddit']
        : [platform];

      const readActions: Record<string, string> = {
        twitter: 'mentions-list',
        linkedin: 'notifications-list',
        reddit: 'inbox-read',
      };

      const results: Record<string, any> = {};
      for (const p of platforms) {
        const action = readActions[p];
        if (!action) continue;
        try {
          results[p] = await socialConnectors.execute(action, {
            maxResults: params.maxResults || 10,
          });
        } catch {
          results[p] = { error: `Could not fetch from ${p}` };
        }
      }

      return {
        success: true,
        output: JSON.stringify(results, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const SchedulePostTool: Tool = {
  name: 'schedule_post',
  description: 'Schedule a social media post for a future time. Call this when the user wants to post later at a specific time.',

  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform: "twitter", "linkedin", or "reddit"',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'Post content/text',
      required: true,
    },
    {
      name: 'scheduledAt',
      type: 'string',
      description: 'ISO 8601 datetime for when to publish (e.g., "2026-02-10T09:00:00Z")',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: 'Post title (for Reddit/LinkedIn)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!socialConnectors) {
        return { success: false, error: 'No social accounts connected. Use /connect to add one.' };
      }

      const scheduledTime = new Date(params.scheduledAt);
      if (isNaN(scheduledTime.getTime())) {
        return { success: false, error: 'Invalid scheduledAt date format. Use ISO 8601.' };
      }
      if (scheduledTime.getTime() <= Date.now()) {
        return { success: false, error: 'scheduledAt must be in the future.' };
      }

      return {
        success: true,
        output: JSON.stringify({
          scheduled: true,
          platform: params.platform,
          content: params.content,
          scheduledAt: params.scheduledAt,
          message: 'Post scheduled. A behavior will be created to publish at the specified time.',
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
