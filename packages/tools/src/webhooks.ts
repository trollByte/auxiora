import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:webhooks');

// Use string constants matching ToolPermission enum values to avoid circular
// dependency with index.ts (which imports and registers these tools at module level).
const AUTO_APPROVE = 'auto_approve' as any;
const USER_APPROVAL = 'user_approval' as any;

// Webhook manager will be injected by the runtime
let webhookManager: any = null;

export function setWebhookManager(manager: any): void {
  webhookManager = manager;
  logger.info('Webhook manager connected to tools');
}

function requireManager(): any {
  if (!webhookManager) {
    throw new Error('Webhook system not initialized');
  }
  return webhookManager;
}

// ─── 1. webhook_list ─────────────────────────────────────────────────────────

export const WebhookListTool: Tool = {
  name: 'webhook_list',
  description:
    'List all registered webhooks. Returns an array of webhook entries with their name, URL, and status.',

  parameters: [] as ToolParameter[],

  getPermission() {
    return AUTO_APPROVE;
  },

  async execute(_params: any, _context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const webhooks = await manager.list();

      return {
        success: true,
        output: JSON.stringify(webhooks, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 2. webhook_create ───────────────────────────────────────────────────────

export const WebhookCreateTool: Tool = {
  name: 'webhook_create',
  description:
    'Create a new generic webhook listener. Requires a unique name, a shared secret for signature verification, and a behavior ID to trigger when the webhook is received.',

  parameters: [
    {
      name: 'name',
      type: 'string',
      description: 'Unique name for the webhook (used in the URL path)',
      required: true,
    },
    {
      name: 'secret',
      type: 'string',
      description: 'Shared secret for HMAC signature verification',
      required: true,
    },
    {
      name: 'behaviorId',
      type: 'string',
      description: 'ID of the behavior to trigger when this webhook is received',
      required: true,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.name || typeof params.name !== 'string') {
      return 'name is required and must be a string';
    }
    if (!params.secret || typeof params.secret !== 'string') {
      return 'secret is required and must be a string';
    }
    if (!params.behaviorId || typeof params.behaviorId !== 'string') {
      return 'behaviorId is required and must be a string';
    }
    return null;
  },

  getPermission() {
    return USER_APPROVAL;
  },

  async execute(params: any, _context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const webhook = await manager.create({
        name: params.name,
        secret: params.secret,
        behaviorId: params.behaviorId,
      });

      return {
        success: true,
        output: JSON.stringify({
          name: webhook.name,
          url: webhook.url,
          behaviorId: webhook.behaviorId,
          message: `Webhook created: ${webhook.name}`,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 3. webhook_delete ───────────────────────────────────────────────────────

export const WebhookDeleteTool: Tool = {
  name: 'webhook_delete',
  description:
    'Delete an existing webhook by name. Returns an error if the webhook does not exist.',

  parameters: [
    {
      name: 'name',
      type: 'string',
      description: 'Name of the webhook to delete',
      required: true,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.name || typeof params.name !== 'string') {
      return 'name is required and must be a string';
    }
    return null;
  },

  getPermission() {
    return USER_APPROVAL;
  },

  async execute(params: any, _context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const deleted = await manager.delete(params.name);

      if (!deleted) {
        return {
          success: false,
          error: `Webhook not found: ${params.name}`,
        };
      }

      return {
        success: true,
        output: JSON.stringify({
          name: params.name,
          message: `Webhook deleted: ${params.name}`,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
