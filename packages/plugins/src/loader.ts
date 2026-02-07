import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { toolRegistry, type Tool, type ToolParameter, ToolPermission, type ToolResult, type ExecutionContext } from '@auxiora/tools';
import { getPluginsDir, isWindows } from '@auxiora/core';
import type { PluginExport, PluginToolDefinition, LoadedPlugin } from './types.js';
import { TOOL_NAME_PATTERN } from './types.js';

const logger = getLogger('plugins:loader');

export class PluginLoader {
  private pluginsDir: string;
  private loaded: LoadedPlugin[] = [];
  private builtinToolNames: Set<string>;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir ?? getPluginsDir();
    this.builtinToolNames = new Set(toolRegistry.listNames());
  }

  async loadAll(): Promise<LoadedPlugin[]> {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
    } catch {
      return [];
    }

    if (!isWindows()) {
      try { await fs.chmod(this.pluginsDir, 0o700); } catch { /* best effort */ }
    }

    let files: string[];
    try {
      const entries = await fs.readdir(this.pluginsDir);
      files = entries.filter(f => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.'));
    } catch {
      return [];
    }

    for (const file of files) {
      await this.loadPlugin(path.join(this.pluginsDir, file));
    }

    return this.loaded;
  }

  private async loadPlugin(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);

    try {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      const pluginExport: PluginExport = module.plugin;

      this.validatePlugin(pluginExport, fileName);

      const toolNames: string[] = [];
      for (const toolDef of pluginExport.tools) {
        const tool = this.adaptTool(toolDef, pluginExport.name);
        toolRegistry.register(tool);
        toolNames.push(toolDef.name);
      }

      if (pluginExport.initialize) {
        await pluginExport.initialize();
      }

      const loaded: LoadedPlugin = {
        name: pluginExport.name,
        version: pluginExport.version,
        file: fileName,
        toolCount: toolNames.length,
        toolNames,
        status: 'loaded',
        shutdown: pluginExport.shutdown,
      };
      this.loaded.push(loaded);

      void audit('plugin.loaded', {
        name: pluginExport.name,
        version: pluginExport.version,
        toolCount: toolNames.length,
      });

      logger.info('Plugin loaded', {
        name: pluginExport.name,
        version: pluginExport.version,
        tools: toolNames,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.loaded.push({
        name: fileName.replace('.js', ''),
        version: 'unknown',
        file: fileName,
        toolCount: 0,
        toolNames: [],
        status: 'failed',
        error: errorMessage,
      });

      void audit('plugin.load_failed', { name: fileName, error: errorMessage });
      logger.warn('Failed to load plugin', { file: fileName, error: errorMessage });
    }
  }

  private validatePlugin(plugin: unknown, fileName: string): asserts plugin is PluginExport {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(`Plugin file ${fileName} must export a 'plugin' object`);
    }

    const p = plugin as Record<string, unknown>;

    if (typeof p.name !== 'string' || !p.name) {
      throw new Error('Plugin must have a non-empty "name" string');
    }

    if (!Array.isArray(p.tools) || p.tools.length === 0) {
      throw new Error('Plugin must have a non-empty "tools" array');
    }

    for (const tool of p.tools as PluginToolDefinition[]) {
      if (typeof tool.name !== 'string' || !TOOL_NAME_PATTERN.test(tool.name)) {
        throw new Error(
          `Tool name "${tool.name}" is invalid. Must match ${TOOL_NAME_PATTERN}`
        );
      }

      if (typeof tool.description !== 'string' || !tool.description) {
        throw new Error(`Tool "${tool.name}" must have a description`);
      }

      if (typeof tool.execute !== 'function') {
        throw new Error(`Tool "${tool.name}" must have an execute function`);
      }

      if (this.builtinToolNames.has(tool.name)) {
        throw new Error(
          `Tool "${tool.name}" collides with a built-in tool`
        );
      }

      const existingPlugin = this.loaded.find(lp =>
        lp.toolNames.includes(tool.name)
      );
      if (existingPlugin) {
        throw new Error(
          `Tool "${tool.name}" collides with tool from plugin "${existingPlugin.name}"`
        );
      }
    }
  }

  private adaptTool(toolDef: PluginToolDefinition, pluginName: string): Tool {
    const parameters: ToolParameter[] = [];
    if (toolDef.parameters?.properties) {
      for (const [name, schema] of Object.entries(toolDef.parameters.properties)) {
        parameters.push({
          name,
          type: schema.type as ToolParameter['type'],
          description: schema.description,
          required: toolDef.parameters.required?.includes(name) ?? false,
        });
      }
    }

    return {
      name: toolDef.name,
      description: `[Plugin: ${pluginName}] ${toolDef.description}`,
      parameters,
      getPermission: () => ToolPermission.USER_APPROVAL,
      execute: async (params: any, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const result = await Promise.race([
            toolDef.execute(params),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Plugin tool timed out')), context.timeout || 30_000)
            ),
          ]);
          return {
            success: result.success,
            output: result.output,
            error: result.error,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        }
      },
    };
  }

  listPlugins(): LoadedPlugin[] {
    return [...this.loaded];
  }

  async shutdownAll(): Promise<void> {
    for (const plugin of this.loaded) {
      if (plugin.shutdown) {
        try {
          await plugin.shutdown();
        } catch (error) {
          logger.warn('Plugin shutdown error', { name: plugin.name, error });
        }
      }
    }
  }
}
