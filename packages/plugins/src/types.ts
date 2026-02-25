import type { ToolResult } from '@auxiora/tools';
import type { z } from 'zod';

export interface PluginToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execute: (params: any) => Promise<PluginToolResult>;
}

export type PluginToolResult = ToolResult | { success: boolean; output?: string; error?: string };

/** Permission types that plugins can request */
export type PluginPermission =
  | 'NETWORK'
  | 'FILESYSTEM'
  | 'SHELL'
  | 'PROVIDER_ACCESS'
  | 'CHANNEL_ACCESS'
  | 'MEMORY_ACCESS';

export const ALL_PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'NETWORK',
  'FILESYSTEM',
  'SHELL',
  'PROVIDER_ACCESS',
  'CHANNEL_ACCESS',
  'MEMORY_ACCESS',
] as const;

/** Behavior definition registered by a plugin */
export interface PluginBehaviorDefinition {
  name: string;
  description: string;
  type: 'scheduled' | 'monitor' | 'one-shot';
  defaultSchedule?: string; // cron expression for scheduled behaviors
  execute: (context: PluginBehaviorContext) => Promise<string>;
}

export interface PluginBehaviorContext {
  lastRun?: string;
  runCount: number;
  sendMessage: (content: string) => Promise<void>;
}

/** Provider definition registered by a plugin */
export interface PluginProviderDefinition {
  name: string;
  displayName: string;
  description: string;
  models: string[];
  initialize: (config: Record<string, unknown>) => Promise<void>;
  complete: (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>) => Promise<{ content: string; model: string }>;
}

/** CLI command definition registered by a plugin */
export interface CommandDefinition {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  options?: Array<{ flags: string; description: string; default?: string }>;
  execute: (args: Record<string, string>, options: Record<string, string>) => Promise<string>;
}

/** HTTP route definition registered by a plugin */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  handler: (req: { params: Record<string, string>; query: Record<string, string>; body: unknown; headers: Record<string, string> }) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;
}

/** Dashboard widget definition registered by a plugin */
export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  type: 'chart' | 'table' | 'stat' | 'log' | 'custom';
  size: 'small' | 'medium' | 'large';
  getData: () => Promise<unknown>;
  refreshInterval?: number;
}

/** Channel adapter definition registered by a plugin */
export interface ChannelDefinition {
  name: string;
  displayName: string;
  description: string;
  configSchema?: Record<string, { type: string; description: string; required?: boolean }>;
  connect: (config: Record<string, unknown>) => Promise<void>;
  disconnect: () => Promise<void>;
  send: (channelId: string, message: { content: string }) => Promise<{ success: boolean; error?: string }>;
  onMessage?: (handler: (message: { channelId: string; senderId: string; content: string }) => void) => void;
}

/** Extended plugin export with permissions, config, behaviors, and providers */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  permissions: PluginPermission[];
  configSchema?: z.ZodType<any>;
  tools: PluginToolDefinition[];
  behaviors?: PluginBehaviorDefinition[];
  providers?: PluginProviderDefinition[];
  commands?: CommandDefinition[];
  routes?: RouteDefinition[];
  widgets?: WidgetDefinition[];
  channels?: ChannelDefinition[];
  initialize?: (context: PluginContext) => Promise<void>;
  shutdown?: () => Promise<void>;
}

/** Restricted API surface passed to plugin init */
export interface PluginContext {
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };
  config: Record<string, unknown>;
  registerTool: (tool: PluginToolDefinition) => void;
  registerBehavior: (behavior: PluginBehaviorDefinition) => void;
  registerProvider: (provider: PluginProviderDefinition) => void;
  registerCommand: (command: CommandDefinition) => void;
  registerRoute: (route: RouteDefinition) => void;
  registerWidget: (widget: WidgetDefinition) => void;
  registerChannel: (channel: ChannelDefinition) => void;
  getMemory: (key: string) => Promise<string | undefined>;
  sendMessage: (channel: string, content: string) => Promise<void>;
}

/** Legacy plugin export (still supported for backwards compat) */
export interface PluginExport {
  name: string;
  version: string;
  tools: PluginToolDefinition[];
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

export interface LoadedPlugin {
  name: string;
  version: string;
  file: string;
  toolCount: number;
  toolNames: string[];
  behaviorNames: string[];
  providerNames: string[];
  commandNames: string[];
  routePaths: string[];
  widgetIds: string[];
  channelNames: string[];
  permissions: PluginPermission[];
  status: 'loaded' | 'failed';
  error?: string;
  shutdown?: () => Promise<void>;
}

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;
