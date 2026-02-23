import { toolRegistry, ToolPermission } from '@auxiora/tools';
import type { Tool, ToolResult, ExecutionContext } from '@auxiora/tools';
import { SkillAuthor } from './skill-author.js';
import type { GenerateFn } from './skill-author.js';
import { SkillInstaller } from './skill-installer.js';
import type { PluginLoader } from './loader.js';

export interface CreateSkillToolOptions {
  loader: PluginLoader;
  generate: GenerateFn;
  pluginsDir?: string;
}

/**
 * Register the create_skill built-in tool.
 * Called by the runtime after PluginLoader.loadAll().
 */
export function registerCreateSkillTool(options: CreateSkillToolOptions): void {
  const author = new SkillAuthor({ generate: options.generate });
  const installer = new SkillInstaller({ pluginsDir: options.pluginsDir });

  const tool: Tool = {
    name: 'create_skill',
    description:
      'Create a new plugin/skill from a natural language description. ' +
      'The generated plugin is validated, installed, and hot-loaded immediately.',
    parameters: [
      {
        name: 'description',
        type: 'string',
        description: 'Natural language description of what the skill should do',
        required: true,
      },
      {
        name: 'name',
        type: 'string',
        description:
          'Optional plugin name (lowercase_snake_case). Auto-derived from description if not provided.',
        required: false,
      },
    ],

    async execute(
      params: { description: string; name?: string },
      _context: ExecutionContext,
    ): Promise<ToolResult> {
      // Step 1: Generate and validate
      const authorResult = await author.createSkill(params.description);
      if (!authorResult.success) {
        return {
          success: false,
          output: `Failed to generate valid plugin code:\n${authorResult.errors?.join('\n') ?? 'Unknown error'}`,
        };
      }

      const pluginName = params.name ?? authorResult.pluginName!;

      // Step 2: Install to disk
      const installResult = await installer.install(pluginName, authorResult.source!);
      if (!installResult.success) {
        return {
          success: false,
          output: `Failed to install plugin: ${installResult.error}`,
        };
      }

      // Step 3: Hot-load
      const loaded = await options.loader.loadSingle(installResult.filePath!);
      if (loaded.status === 'failed') {
        return {
          success: false,
          output: `Plugin installed but failed to load: ${loaded.error}`,
        };
      }

      return {
        success: true,
        output: `Created and loaded plugin "${pluginName}" with tools: ${loaded.toolNames.join(', ')}`,
        metadata: {
          pluginName,
          toolNames: loaded.toolNames,
          filePath: installResult.filePath,
        },
      };
    },

    getPermission(
      _params: any,
      _context: ExecutionContext,
    ): ToolPermission {
      // Creating skills needs explicit user confirmation
      return ToolPermission.USER_APPROVAL;
    },
  };

  toolRegistry.register(tool);
}
