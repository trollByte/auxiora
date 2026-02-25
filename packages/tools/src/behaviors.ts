import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:behaviors');

// These will be set by the runtime when behaviors are initialized
let behaviorManager: any = null;

export function setBehaviorManager(manager: any): void {
  behaviorManager = manager;
  logger.info('Behavior manager connected to tools');
}

function requireManager(): any {
  if (!behaviorManager) {
    throw new Error('Behavior system not initialized');
  }
  return behaviorManager;
}

export const CreateBehaviorTool: Tool = {
  name: 'create_behavior',
  description: 'Create a proactive behavior: scheduled task, condition monitor, or one-shot reminder. The AI assistant calls this when a user asks it to do something periodically, monitor something, or remind them later.',

  parameters: [
    {
      name: 'type',
      type: 'string',
      description: 'Behavior type: "scheduled" (cron), "monitor" (polling with condition), or "one-shot" (delayed once)',
      required: true,
    },
    {
      name: 'action',
      type: 'string',
      description: 'What to do when triggered (natural language prompt for the AI)',
      required: true,
    },
    {
      name: 'cron',
      type: 'string',
      description: 'Cron expression for scheduled behaviors (e.g., "0 8 * * *" for daily at 8am)',
      required: false,
    },
    {
      name: 'timezone',
      type: 'string',
      description: 'IANA timezone (e.g., "America/New_York"). Defaults to system timezone.',
      required: false,
    },
    {
      name: 'intervalMs',
      type: 'number',
      description: 'Polling interval in milliseconds for monitors (minimum 60000)',
      required: false,
    },
    {
      name: 'condition',
      type: 'string',
      description: 'Condition for monitors: only deliver when this is true (natural language)',
      required: false,
    },
    {
      name: 'delay',
      type: 'string',
      description: 'ISO timestamp for one-shot behaviors (when to fire)',
      required: false,
    },
    {
      name: 'channelOverride',
      type: 'string',
      description: 'Override delivery channel (e.g., "telegram", "discord")',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();

      const input: any = {
        type: params.type,
        action: params.action,
        channel: {
          type: params.channelOverride || context.environment?.channelType || 'webchat',
          id: context.environment?.channelId || context.sessionId || 'default',
          overridden: !!params.channelOverride,
        },
        createdBy: context.userId || 'unknown',
      };

      if (params.type === 'scheduled') {
        input.schedule = {
          cron: params.cron,
          timezone: params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      } else if (params.type === 'monitor') {
        input.polling = {
          intervalMs: params.intervalMs,
          condition: params.condition,
        };
      } else if (params.type === 'one-shot') {
        input.delay = { fireAt: params.delay };
      }

      const behavior = await manager.create(input);

      return {
        success: true,
        output: JSON.stringify({
          id: behavior.id,
          type: behavior.type,
          action: behavior.action,
          status: behavior.status,
          message: `Behavior created: ${behavior.id}`,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const ListBehaviorsTool: Tool = {
  name: 'list_behaviors',
  description: 'List all proactive behaviors for the current user. Shows scheduled tasks, monitors, and reminders with their status.',

  parameters: [
    {
      name: 'type',
      type: 'string',
      description: 'Filter by type: "scheduled", "monitor", or "one-shot"',
      required: false,
    },
    {
      name: 'status',
      type: 'string',
      description: 'Filter by status: "active", "paused"',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const behaviors = await manager.list({
        type: params.type,
        status: params.status,
      });

      const summary = behaviors.map((b: any) => ({
        id: b.id,
        type: b.type,
        status: b.status,
        action: b.action,
        lastRun: b.lastRun || 'never',
        runCount: b.runCount,
      }));

      return {
        success: true,
        output: JSON.stringify(summary, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const UpdateBehaviorTool: Tool = {
  name: 'update_behavior',
  description: 'Update an existing behavior: change schedule, pause, resume, or modify the action.',

  parameters: [
    {
      name: 'id',
      type: 'string',
      description: 'Behavior ID (e.g., "bh_a3xK9m")',
      required: true,
    },
    {
      name: 'status',
      type: 'string',
      description: 'New status: "active" (resume), "paused"',
      required: false,
    },
    {
      name: 'action',
      type: 'string',
      description: 'New action prompt',
      required: false,
    },
    {
      name: 'cron',
      type: 'string',
      description: 'New cron expression (scheduled behaviors only)',
      required: false,
    },
    {
      name: 'intervalMs',
      type: 'number',
      description: 'New polling interval (monitor behaviors only)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const updates: any = {};

      if (params.status) updates.status = params.status;
      if (params.action) updates.action = params.action;
      if (params.cron) updates.schedule = { cron: params.cron, timezone: params.timezone };
      if (params.intervalMs) updates.polling = { intervalMs: params.intervalMs };

      const updated = await manager.update(params.id, updates);

      if (!updated) {
        return { success: false, error: `Behavior not found: ${params.id}` };
      }

      return {
        success: true,
        output: JSON.stringify({
          id: updated.id,
          status: updated.status,
          message: `Behavior updated: ${updated.id}`,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const DeleteBehaviorsTool: Tool = {
  name: 'delete_behaviors',
  description: 'Delete one or more behaviors by ID or type.',

  parameters: [
    {
      name: 'id',
      type: 'string',
      description: 'Specific behavior ID to delete',
      required: false,
    },
    {
      name: 'type',
      type: 'string',
      description: 'Delete all behaviors of this type: "scheduled", "monitor", or "one-shot"',
      required: false,
    },
    {
      name: 'all',
      type: 'boolean',
      description: 'Delete all behaviors',
      required: false,
      default: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const manager = requireManager();
      let deleted = 0;

      if (params.id) {
        const removed = await manager.remove(params.id);
        deleted = removed ? 1 : 0;
      } else if (params.type || params.all) {
        const behaviors = await manager.list(params.type ? { type: params.type } : undefined);
        for (const b of behaviors) {
          await manager.remove(b.id);
          deleted++;
        }
      } else {
        return { success: false, error: 'Provide id, type, or all=true' };
      }

      return {
        success: true,
        output: JSON.stringify({ deleted, message: `Deleted ${deleted} behavior(s)` }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
