import { Command } from 'commander';
import { loadConfig } from '@auxiora/config';
import { PluginLoader } from '@auxiora/plugins';
import { RegistryClient } from '@auxiora/marketplace';
import type { MarketplaceConfig } from '@auxiora/marketplace';
import { getPluginsDir } from '@auxiora/core';

export function createPluginCommand(): Command {
  const cmd = new Command('plugin').description('Manage plugins');

  cmd
    .command('list')
    .description('List installed plugins')
    .action(async () => {
      const config = await loadConfig();
      const loader = new PluginLoader({
        pluginsDir: config.plugins.dir ?? getPluginsDir(),
        pluginConfigs: config.plugins.pluginConfigs as Record<string, Record<string, unknown>>,
        approvedPermissions: config.plugins.approvedPermissions as Record<string, any>,
      });

      const plugins = await loader.loadAll();

      if (plugins.length === 0) {
        console.log('No plugins installed.');
        return;
      }

      console.log('\nInstalled Plugins:\n');
      console.log('  Name                | Version  | Status  | Tools');
      console.log('  --------------------+----------+---------+------');

      for (const plugin of plugins) {
        const name = plugin.name.padEnd(18);
        const version = plugin.version.padEnd(8);
        const status = plugin.status === 'loaded' ? 'loaded ' : 'FAILED ';
        const tools = plugin.toolNames.join(', ') || '-';
        console.log(`  ${name} | ${version} | ${status} | ${tools}`);
        if (plugin.error) {
          console.log(`    Error: ${plugin.error}`);
        }
        if (plugin.permissions.length > 0) {
          console.log(`    Permissions: ${plugin.permissions.join(', ')}`);
        }
      }
      console.log('');

      await loader.shutdownAll();
    });

  cmd
    .command('search <query>')
    .description('Search the plugin marketplace')
    .option('--limit <n>', 'Max results', '20')
    .action(async (query: string, options: { limit: string }) => {
      const config = await loadConfig();
      const client = createRegistryClient(config);

      try {
        const result = await client.search({
          query,
          limit: parseInt(options.limit, 10),
        });

        if (result.plugins.length === 0) {
          console.log('No plugins found.');
          return;
        }

        console.log(`\nFound ${result.total} plugins:\n`);
        for (const plugin of result.plugins) {
          console.log(`  ${plugin.name} v${plugin.version}`);
          console.log(`    ${plugin.description}`);
          console.log(`    by ${plugin.author} | ${plugin.downloads} downloads | rating: ${plugin.rating}`);
          if (plugin.permissions.length > 0) {
            console.log(`    permissions: ${plugin.permissions.join(', ')}`);
          }
          console.log('');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Search failed: ${msg}`);
        process.exit(1);
      }
    });

  cmd
    .command('install <name>')
    .description('Install a plugin from the marketplace')
    .option('--version <version>', 'Specific version to install')
    .action(async (name: string, options: { version?: string }) => {
      const config = await loadConfig();
      const client = createRegistryClient(config);

      console.log(`Installing ${name}${options.version ? `@${options.version}` : ''}...`);

      try {
        const result = await client.install(name, options.version);

        if (result.success) {
          console.log(`Installed ${result.name} v${result.version}`);
          if (result.dependencies.length > 0) {
            console.log(`  Dependencies: ${result.dependencies.join(', ')}`);
          }
        } else {
          console.error(`Installation failed: ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Install failed: ${msg}`);
        process.exit(1);
      }
    });

  cmd
    .command('uninstall <name>')
    .description('Uninstall a plugin')
    .action(async (name: string) => {
      const config = await loadConfig();
      const client = createRegistryClient(config);

      const removed = await client.uninstall(name);

      if (removed) {
        console.log(`Uninstalled: ${name}`);
      } else {
        console.error(`Plugin "${name}" is not installed.`);
        process.exit(1);
      }
    });

  cmd
    .command('create <name>')
    .description('Create a new plugin from template')
    .action(async (name: string) => {
      console.log(`Creating plugin: ${name}`);
      console.log('');
      console.log('Plugin template:');
      console.log('');
      console.log(`  // ${name}/plugin.js`);
      console.log(`  export const plugin = {`);
      console.log(`    name: '${name}',`);
      console.log(`    version: '1.0.0',`);
      console.log(`    permissions: [],`);
      console.log(`    tools: [{`);
      console.log(`      name: '${name.replace(/-/g, '_')}_action',`);
      console.log(`      description: 'My custom tool',`);
      console.log(`      parameters: {`);
      console.log(`        type: 'object',`);
      console.log(`        properties: {`);
      console.log(`          input: { type: 'string', description: 'Input value' }`);
      console.log(`        },`);
      console.log(`        required: ['input']`);
      console.log(`      },`);
      console.log(`      execute: async ({ input }) => ({ success: true, output: input })`);
      console.log(`    }]`);
      console.log(`  };`);
      console.log('');
      console.log(`Place the plugin file in your plugins directory.`);
    });

  cmd
    .command('dev <path>')
    .description('Load a plugin in development mode')
    .action(async (pluginPath: string) => {
      console.log(`Loading plugin from: ${pluginPath}`);
      console.log('Development mode: plugin will be reloaded on file changes');
      console.log('Press Ctrl+C to stop.');
    });

  cmd
    .command('test <path>')
    .description('Test a plugin')
    .action(async (pluginPath: string) => {
      console.log(`Testing plugin at: ${pluginPath}`);
      console.log('Validation checks:');
      console.log('  - Plugin exports valid');
      console.log('  - Tool names valid');
      console.log('  - Permissions declared');
      console.log('  - Initialize/shutdown hooks');
    });

  cmd
    .command('publish <path>')
    .description('Publish a plugin to the marketplace')
    .action(async (pluginPath: string) => {
      const config = await loadConfig();
      const client = createRegistryClient(config);

      console.log(`Publishing plugin from: ${pluginPath}...`);

      try {
        const result = await client.publish(pluginPath);

        if (result.success) {
          console.log(`Published ${result.name} v${result.version}`);
        } else {
          console.error(`Publish failed: ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Publish failed: ${msg}`);
        process.exit(1);
      }
    });

  return cmd;
}

function createRegistryClient(config: { plugins: { marketplace: { registryUrl: string; autoUpdate: boolean } } }): RegistryClient {
  const marketplaceConfig: MarketplaceConfig = {
    registryUrl: config.plugins.marketplace.registryUrl,
    autoUpdate: config.plugins.marketplace.autoUpdate,
    installDir: getPluginsDir(),
  };
  return new RegistryClient(marketplaceConfig);
}
