import type { ToolResult } from '@auxiora/tools';

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
  status: 'loaded' | 'failed';
  error?: string;
  shutdown?: () => Promise<void>;
}

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;
