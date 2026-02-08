import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { toolRegistry, type Tool, type ToolParameter, ToolPermission, type ToolResult, type ExecutionContext } from '@auxiora/tools';
import { getPluginsDir, isWindows } from '@auxiora/core';
import type {
  PluginExport,
  PluginManifest,
  PluginToolDefinition,
  PluginBehaviorDefinition,
  PluginProviderDefinition,
  CommandDefinition,
  RouteDefinition,
  WidgetDefinition,
  ChannelDefinition,
  PluginContext,
  LoadedPlugin,
  PluginPermission,
} from './types.js';
import { TOOL_NAME_PATTERN, ALL_PLUGIN_PERMISSIONS } from './types.js';

const logger = getLogger('plugins:loader');

export interface PluginLoaderOptions {
  pluginsDir?: string;
  pluginConfigs?: Record<string, Record<string, unknown>>;
  approvedPermissions?: Record<string, PluginPermission[]>;
}

export class PluginLoader {
  private pluginsDir: string;
  private loaded: LoadedPlugin[] = [];
  private builtinToolNames: Set<string>;
  private registeredBehaviors: PluginBehaviorDefinition[] = [];
  private registeredProviders: PluginProviderDefinition[] = [];
  private registeredCommands: CommandDefinition[] = [];
  private registeredRoutes: RouteDefinition[] = [];
  private registeredWidgets: WidgetDefinition[] = [];
  private registeredChannels: ChannelDefinition[] = [];
  private pluginConfigs: Record<string, Record<string, unknown>>;
  private approvedPermissions: Record<string, PluginPermission[]>;

  constructor(pluginsDirOrOptions?: string | PluginLoaderOptions) {
    if (typeof pluginsDirOrOptions === 'string' || pluginsDirOrOptions === undefined) {
      this.pluginsDir = pluginsDirOrOptions ?? getPluginsDir();
      this.pluginConfigs = {};
      this.approvedPermissions = {};
    } else {
      this.pluginsDir = pluginsDirOrOptions.pluginsDir ?? getPluginsDir();
      this.pluginConfigs = pluginsDirOrOptions.pluginConfigs ?? {};
      this.approvedPermissions = pluginsDirOrOptions.approvedPermissions ?? {};
    }
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
      files = entries.filter(f => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.')).sort();
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

      // Support both legacy PluginExport and new PluginManifest
      const pluginExport: PluginExport | PluginManifest = module.plugin;

      this.validatePlugin(pluginExport, fileName);

      const isManifest = this.isManifest(pluginExport);
      const manifest = isManifest ? pluginExport as PluginManifest : null;

      // Validate permissions if manifest
      const permissions = manifest?.permissions ?? [];
      if (permissions.length > 0) {
        this.validatePermissions(pluginExport.name, permissions);
      }

      // Validate plugin config against schema if provided
      let pluginConfig: Record<string, unknown> = {};
      if (manifest?.configSchema) {
        const rawConfig = this.pluginConfigs[pluginExport.name] ?? {};
        pluginConfig = manifest.configSchema.parse(rawConfig);
      }

      const toolNames: string[] = [];
      const behaviorNames: string[] = [];
      const providerNames: string[] = [];
      const commandNames: string[] = [];
      const routePaths: string[] = [];
      const widgetIds: string[] = [];
      const channelNames: string[] = [];

      // Dynamically registered items via context
      const dynamicTools: PluginToolDefinition[] = [];
      const dynamicBehaviors: PluginBehaviorDefinition[] = [];
      const dynamicProviders: PluginProviderDefinition[] = [];
      const dynamicCommands: CommandDefinition[] = [];
      const dynamicRoutes: RouteDefinition[] = [];
      const dynamicWidgets: WidgetDefinition[] = [];
      const dynamicChannels: ChannelDefinition[] = [];

      // Register static tools
      for (const toolDef of pluginExport.tools) {
        const tool = this.adaptTool(toolDef, pluginExport.name);
        toolRegistry.register(tool);
        toolNames.push(toolDef.name);
      }

      // Register static behaviors
      if (manifest?.behaviors) {
        for (const behavior of manifest.behaviors) {
          this.registeredBehaviors.push(behavior);
          behaviorNames.push(behavior.name);
        }
      }

      // Register static providers
      if (manifest?.providers) {
        for (const provider of manifest.providers) {
          this.registeredProviders.push(provider);
          providerNames.push(provider.name);
        }
      }

      // Register static commands
      if (manifest?.commands) {
        for (const command of manifest.commands) {
          this.registeredCommands.push(command);
          commandNames.push(command.name);
        }
      }

      // Register static routes
      if (manifest?.routes) {
        for (const route of manifest.routes) {
          this.registeredRoutes.push(route);
          routePaths.push(`${route.method} ${route.path}`);
        }
      }

      // Register static widgets
      if (manifest?.widgets) {
        for (const widget of manifest.widgets) {
          this.registeredWidgets.push(widget);
          widgetIds.push(widget.id);
        }
      }

      // Register static channels
      if (manifest?.channels) {
        for (const channel of manifest.channels) {
          this.registeredChannels.push(channel);
          channelNames.push(channel.name);
        }
      }

      // Initialize plugin
      if (manifest && isManifest) {
        // New-style: pass PluginContext
        if (manifest.initialize) {
          const context = this.createPluginContext(
            pluginExport.name,
            pluginConfig,
            dynamicTools,
            dynamicBehaviors,
            dynamicProviders,
            dynamicCommands,
            dynamicRoutes,
            dynamicWidgets,
            dynamicChannels,
          );
          try {
            await manifest.initialize(context);
          } catch (initError) {
            for (const name of toolNames) {
              toolRegistry.unregister(name);
            }
            throw initError;
          }

          // Register dynamically added items
          for (const toolDef of dynamicTools) {
            const tool = this.adaptTool(toolDef, pluginExport.name);
            toolRegistry.register(tool);
            toolNames.push(toolDef.name);
          }
          for (const behavior of dynamicBehaviors) {
            this.registeredBehaviors.push(behavior);
            behaviorNames.push(behavior.name);
          }
          for (const provider of dynamicProviders) {
            this.registeredProviders.push(provider);
            providerNames.push(provider.name);
          }
          for (const command of dynamicCommands) {
            this.registeredCommands.push(command);
            commandNames.push(command.name);
          }
          for (const route of dynamicRoutes) {
            this.registeredRoutes.push(route);
            routePaths.push(`${route.method} ${route.path}`);
          }
          for (const widget of dynamicWidgets) {
            this.registeredWidgets.push(widget);
            widgetIds.push(widget.id);
          }
          for (const channel of dynamicChannels) {
            this.registeredChannels.push(channel);
            channelNames.push(channel.name);
          }
        }
      } else {
        // Legacy: call initialize() with no args
        const legacy = pluginExport as PluginExport;
        if (legacy.initialize) {
          try {
            await legacy.initialize();
          } catch (initError) {
            for (const name of toolNames) {
              toolRegistry.unregister(name);
            }
            throw initError;
          }
        }
      }

      const loaded: LoadedPlugin = {
        name: pluginExport.name,
        version: pluginExport.version,
        file: fileName,
        toolCount: toolNames.length,
        toolNames,
        behaviorNames,
        providerNames,
        commandNames,
        routePaths,
        widgetIds,
        channelNames,
        permissions,
        status: 'loaded',
        shutdown: pluginExport.shutdown,
      };
      this.loaded.push(loaded);

      void audit('plugin.loaded', {
        name: pluginExport.name,
        version: pluginExport.version,
        toolCount: toolNames.length,
        permissions,
      });

      logger.info('Plugin loaded', {
        name: pluginExport.name,
        version: pluginExport.version,
        tools: toolNames,
        behaviors: behaviorNames,
        providers: providerNames,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.loaded.push({
        name: fileName.replace('.js', ''),
        version: 'unknown',
        file: fileName,
        toolCount: 0,
        toolNames: [],
        behaviorNames: [],
        providerNames: [],
        commandNames: [],
        routePaths: [],
        widgetIds: [],
        channelNames: [],
        permissions: [],
        status: 'failed',
        error: errorMessage,
      });

      void audit('plugin.load_failed', { name: fileName, error: errorMessage });
      logger.warn('Failed to load plugin', { file: fileName, error: new Error(errorMessage) });
    }
  }

  private isManifest(plugin: PluginExport | PluginManifest): plugin is PluginManifest {
    return 'permissions' in plugin && Array.isArray((plugin as PluginManifest).permissions);
  }

  private validatePermissions(pluginName: string, requested: PluginPermission[]): void {
    // Validate permission values
    for (const perm of requested) {
      if (!ALL_PLUGIN_PERMISSIONS.includes(perm)) {
        throw new Error(`Plugin "${pluginName}" requests unknown permission: ${perm}`);
      }
    }

    // Check against approved permissions
    const approved = this.approvedPermissions[pluginName];
    if (approved !== undefined) {
      const denied = requested.filter(p => !approved.includes(p));
      if (denied.length > 0) {
        throw new Error(
          `Plugin "${pluginName}" requires unapproved permissions: ${denied.join(', ')}. ` +
          `Approve them in config plugins.approvedPermissions.`
        );
      }
    }
  }

  private createPluginContext(
    pluginName: string,
    config: Record<string, unknown>,
    dynamicTools: PluginToolDefinition[],
    dynamicBehaviors: PluginBehaviorDefinition[],
    dynamicProviders: PluginProviderDefinition[],
    dynamicCommands: CommandDefinition[],
    dynamicRoutes: RouteDefinition[],
    dynamicWidgets: WidgetDefinition[],
    dynamicChannels: ChannelDefinition[],
  ): PluginContext {
    const pluginLogger = getLogger(`plugin:${pluginName}`);

    return {
      logger: {
        info: (msg, meta) => pluginLogger.info(msg, meta),
        warn: (msg, meta) => pluginLogger.warn(msg, meta),
        error: (msg, meta) => pluginLogger.error(msg, meta ? { error: new Error(msg), ...meta } : { error: new Error(msg) }),
        debug: (msg, meta) => pluginLogger.debug(msg, meta),
      },
      config,
      registerTool: (tool: PluginToolDefinition) => {
        dynamicTools.push(tool);
      },
      registerBehavior: (behavior: PluginBehaviorDefinition) => {
        dynamicBehaviors.push(behavior);
      },
      registerProvider: (provider: PluginProviderDefinition) => {
        dynamicProviders.push(provider);
      },
      registerCommand: (command: CommandDefinition) => {
        dynamicCommands.push(command);
      },
      registerRoute: (route: RouteDefinition) => {
        dynamicRoutes.push(route);
      },
      registerWidget: (widget: WidgetDefinition) => {
        dynamicWidgets.push(widget);
      },
      registerChannel: (channel: ChannelDefinition) => {
        dynamicChannels.push(channel);
      },
      getMemory: async (_key: string) => {
        // Placeholder — will be wired to memory store
        return undefined;
      },
      sendMessage: async (_channel: string, _content: string) => {
        // Placeholder — will be wired to channel system
      },
    };
  }

  private validatePlugin(plugin: unknown, fileName: string): asserts plugin is PluginExport | PluginManifest {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(`Plugin file ${fileName} must export a 'plugin' object`);
    }

    const p = plugin as Record<string, unknown>;

    if (typeof p.name !== 'string' || !p.name) {
      throw new Error('Plugin must have a non-empty "name" string');
    }

    if (typeof p.version !== 'string' || !p.version) {
      throw new Error('Plugin must have a non-empty "version" string');
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
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            toolDef.execute(params),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('Plugin tool timed out')), context.timeout || 30_000);
            }),
          ]);
          return {
            success: result.success,
            output: result.output,
            error: result.error,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        } finally {
          if (timer !== undefined) {
            clearTimeout(timer);
          }
        }
      },
    };
  }

  listPlugins(): LoadedPlugin[] {
    return [...this.loaded];
  }

  listBehaviors(): PluginBehaviorDefinition[] {
    return [...this.registeredBehaviors];
  }

  listProviders(): PluginProviderDefinition[] {
    return [...this.registeredProviders];
  }

  listCommands(): CommandDefinition[] {
    return [...this.registeredCommands];
  }

  listRoutes(): RouteDefinition[] {
    return [...this.registeredRoutes];
  }

  listWidgets(): WidgetDefinition[] {
    return [...this.registeredWidgets];
  }

  listChannels(): ChannelDefinition[] {
    return [...this.registeredChannels];
  }

  async shutdownAll(): Promise<void> {
    for (const plugin of this.loaded) {
      if (plugin.shutdown) {
        try {
          await plugin.shutdown();
        } catch (error) {
          logger.warn('Plugin shutdown error', { name: plugin.name, error: error instanceof Error ? error : new Error(String(error)) });
        }
      }
    }
  }
}
