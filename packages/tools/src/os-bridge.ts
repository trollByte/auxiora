import type { Tool, ToolParameter, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:os-bridge');

let clipboardMonitor: any = null;
let appController: any = null;
let systemStateMonitor: any = null;

export function setClipboardMonitor(monitor: any): void {
  clipboardMonitor = monitor;
  logger.info('Clipboard monitor connected to tools');
}

export function setAppController(controller: any): void {
  appController = controller;
  logger.info('App controller connected to tools');
}

export function setSystemStateMonitor(monitor: any): void {
  systemStateMonitor = monitor;
  logger.info('System state monitor connected to tools');
}

export const ClipboardTransformTool: Tool = {
  name: 'clipboard_transform',
  description: 'Read clipboard content and optionally transform it (uppercase, lowercase, trim, JSON format). Call this when the user asks about clipboard contents or wants to transform copied text.',

  parameters: [
    {
      name: 'operation',
      type: 'string',
      description: 'Transform operation: "read", "uppercase", "lowercase", "trim", or "json-format"',
      required: false,
      default: 'read',
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!clipboardMonitor) {
        return { success: false, error: 'Clipboard monitor not available. OS bridge not initialized.' };
      }

      const current = clipboardMonitor.getContent();
      const op = params.operation || 'read';

      if (op === 'read') {
        return {
          success: true,
          output: JSON.stringify({
            content: current.content,
            type: current.type,
            timestamp: current.timestamp,
          }),
        };
      }

      const transformed = clipboardMonitor.transform(current.content, op);
      return {
        success: true,
        output: JSON.stringify({
          original: current.content,
          transformed,
          operation: op,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const AppLaunchTool: Tool = {
  name: 'app_launch',
  description: 'Launch, focus, or close applications on the user\'s machine. Call this when the user asks to open an app, switch to a window, or close a program.',

  parameters: [
    {
      name: 'appName',
      type: 'string',
      description: 'Application name (e.g., "Firefox", "Slack", "Terminal")',
      required: true,
    },
    {
      name: 'action',
      type: 'string',
      description: 'Action to perform: "launch", "focus", or "close"',
      required: false,
      default: 'launch',
    },
  ] as ToolParameter[],

  getPermission(params: any): ToolPermission {
    if (params.action === 'close') {
      return ToolPermission.USER_APPROVAL;
    }
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!appController) {
        return { success: false, error: 'App controller not available. OS bridge not initialized.' };
      }

      const action = params.action || 'launch';
      const result = await appController[action](params.appName);

      return {
        success: true,
        output: JSON.stringify({
          action,
          appName: params.appName,
          command: result.command,
        }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const SystemInfoTool: Tool = {
  name: 'system_info',
  description: 'Get system information including CPU, memory, disk, and battery status. Call this when the user asks about system resources, performance, or machine specs.',

  parameters: [] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(): Promise<ToolResult> {
    try {
      if (!systemStateMonitor) {
        return { success: false, error: 'System state monitor not available. OS bridge not initialized.' };
      }

      const state = systemStateMonitor.getState();
      return {
        success: true,
        output: JSON.stringify({
          platform: state.platform,
          hostname: state.hostname,
          uptime: `${Math.floor(state.uptime / 3600)}h ${Math.floor((state.uptime % 3600) / 60)}m`,
          memory: {
            total: `${(state.memory.total / (1024 ** 3)).toFixed(1)} GB`,
            free: `${(state.memory.free / (1024 ** 3)).toFixed(1)} GB`,
            used: `${state.memory.usedPercent.toFixed(1)}%`,
          },
          cpu: {
            model: state.cpu.model,
            cores: state.cpu.cores,
            loadAvg: state.cpu.loadAvg.map((l: number) => l.toFixed(2)),
          },
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
