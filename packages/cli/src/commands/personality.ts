import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { PersonalityManager } from '@auxiora/personality';
import type { SoulConfig } from '@auxiora/personality';
import { loadConfig, saveConfig, type Config } from '@auxiora/config';
import { getWorkspacePath, getSoulPath, getPluginsDir } from '@auxiora/core';
import { RegistryClient } from '@auxiora/marketplace';
import type { MarketplaceConfig } from '@auxiora/marketplace';
import * as path from 'node:path';

function createRegistryFromConfig(config: Config): RegistryClient {
  const mktConfig: MarketplaceConfig = {
    registryUrl: config.plugins.marketplace.registryUrl,
    autoUpdate: config.plugins.marketplace.autoUpdate,
    installDir: getPluginsDir(),
  };
  return new RegistryClient(mktConfig);
}

function getManager(): PersonalityManager {
  const workspaceDir = getWorkspacePath();
  const templatesDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'personality', 'templates');
  return new PersonalityManager(templatesDir, workspaceDir);
}

export function createPersonalityCommand(): Command {
  const cmd = new Command('personality')
    .description('Manage agent personality');

  cmd.command('list')
    .description('List available personality templates')
    .action(async () => {
      const manager = getManager();
      const templates = await manager.listTemplates();

      if (templates.length === 0) {
        console.log('No personality templates found.');
        return;
      }

      console.log('\nAvailable Personality Templates\n');
      for (const t of templates) {
        console.log(`  ${t.id}`);
        console.log(`    Name: ${t.name}`);
        if (t.description) console.log(`    Description: ${t.description}`);
        if (t.preview) console.log(`    Preview: "${t.preview}"`);
        console.log('');
      }
    });

  cmd.command('show')
    .description('Show current personality')
    .action(async () => {
      const manager = getManager();
      const personality = await manager.getCurrentPersonality();
      const config = await loadConfig();

      if (!personality) {
        console.log('No personality configured. Run `auxiora init` or `auxiora personality set <template>`.');
        return;
      }

      console.log('\nCurrent Personality\n');
      console.log(`  Name: ${personality.name}`);
      console.log(`  Pronouns: ${personality.pronouns}`);
      console.log(`  Template: ${config.agent.personality}`);
      console.log(`  Error Style: ${personality.errorStyle}`);
      console.log(`  Tone:`);
      console.log(`    Warmth: ${personality.tone.warmth}`);
      console.log(`    Directness: ${personality.tone.directness}`);
      console.log(`    Humor: ${personality.tone.humor}`);
      console.log(`    Formality: ${personality.tone.formality}`);

      if (personality.expertise.length > 0) {
        console.log(`  Expertise: ${personality.expertise.join(', ')}`);
      }

      const catchphraseEntries = Object.entries(personality.catchphrases);
      if (catchphraseEntries.length > 0) {
        console.log('  Catchphrases:');
        for (const [key, value] of catchphraseEntries) {
          console.log(`    ${key}: "${value}"`);
        }
      }
      console.log('');
    });

  cmd.command('set <template>')
    .description('Switch to a personality template')
    .action(async (template: string) => {
      const manager = getManager();

      // Verify the template exists
      const tmpl = await manager.getTemplate(template);
      if (!tmpl) {
        const available = await manager.listTemplates();
        console.error(`Template "${template}" not found.`);
        if (available.length > 0) {
          console.error(`Available templates: ${available.map((t) => t.id).join(', ')}`);
        }
        process.exit(1);
      }

      await manager.applyTemplate(template);

      // Update config to track which template is active
      const config = await loadConfig();
      config.agent.personality = template;
      await saveConfig(config);

      console.log(`\nPersonality switched to "${tmpl.name}".`);
      if (tmpl.preview) {
        console.log(`Preview: "${tmpl.preview}"`);
      }
      console.log('');
    });

  cmd.command('build')
    .description('Build a custom personality interactively')
    .action(async () => {
      console.log('\nCustom Personality Builder\n');

      const name = await input({
        message: 'Agent name:',
        default: 'Auxiora',
      });

      const pronouns = await select({
        message: 'Pronouns:',
        choices: [
          { name: 'she/her', value: 'she/her' },
          { name: 'he/him', value: 'he/him' },
          { name: 'they/them', value: 'they/them' },
          { name: 'it/its', value: 'it/its' },
        ],
        default: 'they/them',
      });

      const warmth = await select({
        message: 'Warmth level:',
        choices: [
          { name: 'Cool (0.2)', value: '0.2' },
          { name: 'Balanced (0.5)', value: '0.5' },
          { name: 'Warm (0.8)', value: '0.8' },
          { name: 'Very warm (1.0)', value: '1.0' },
        ],
        default: '0.5',
      });

      const directness = await select({
        message: 'Directness level:',
        choices: [
          { name: 'Gentle (0.2)', value: '0.2' },
          { name: 'Balanced (0.5)', value: '0.5' },
          { name: 'Direct (0.8)', value: '0.8' },
          { name: 'Very direct (1.0)', value: '1.0' },
        ],
        default: '0.5',
      });

      const humor = await select({
        message: 'Humor level:',
        choices: [
          { name: 'Serious (0.0)', value: '0.0' },
          { name: 'Occasional (0.3)', value: '0.3' },
          { name: 'Playful (0.6)', value: '0.6' },
          { name: 'Very humorous (0.9)', value: '0.9' },
        ],
        default: '0.3',
      });

      const formality = await select({
        message: 'Formality level:',
        choices: [
          { name: 'Casual (0.2)', value: '0.2' },
          { name: 'Balanced (0.5)', value: '0.5' },
          { name: 'Formal (0.8)', value: '0.8' },
          { name: 'Very formal (1.0)', value: '1.0' },
        ],
        default: '0.5',
      });

      const errorStyle = await select({
        message: 'Error communication style:',
        choices: [
          { name: 'Professional', value: 'professional' },
          { name: 'Apologetic', value: 'apologetic' },
          { name: 'Matter of fact', value: 'matter_of_fact' },
          { name: 'Self-deprecating', value: 'self_deprecating' },
        ],
        default: 'professional',
      });

      const expertiseRaw = await input({
        message: 'Areas of expertise (comma-separated, or leave empty):',
        default: '',
      });

      const greeting = await input({
        message: 'Greeting catchphrase (or leave empty):',
        default: '',
      });

      const soulConfig: SoulConfig = {
        name,
        pronouns,
        tone: {
          warmth: Number(warmth),
          directness: Number(directness),
          humor: Number(humor),
          formality: Number(formality),
        },
        expertise: expertiseRaw
          ? expertiseRaw.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        errorStyle,
        catchphrases: greeting ? { greeting } : {},
        boundaries: { neverJokeAbout: [], neverAdviseOn: [] },
      };

      const manager = getManager();
      await manager.buildCustom(soulConfig);

      // Update config
      const config = await loadConfig();
      config.agent.name = name;
      config.agent.pronouns = pronouns;
      config.agent.personality = 'custom';
      config.agent.tone = soulConfig.tone;
      config.agent.errorStyle = errorStyle as typeof config.agent.errorStyle;
      config.agent.expertise = soulConfig.expertise;
      if (greeting) {
        config.agent.catchphrases.greeting = greeting;
      }
      await saveConfig(config);

      console.log(`\nCustom personality for "${name}" saved to SOUL.md.`);
      console.log('Run `auxiora personality show` to review.\n');
    });

  cmd.command('search [query]')
    .description('Search the personality marketplace')
    .option('-a, --author <author>', 'Filter by author')
    .option('-s, --sort <sort>', 'Sort by: downloads, rating, updated, name', 'downloads')
    .option('-l, --limit <limit>', 'Number of results', '10')
    .action(async (query: string | undefined, opts: { author?: string; sort?: string; limit?: string }) => {
      const config = await loadConfig();
      const registry = createRegistryFromConfig(config);

      try {
        const result = await registry.searchPersonalities({
          query,
          author: opts.author,
          sortBy: (opts.sort as 'downloads' | 'rating' | 'updated' | 'name') ?? 'downloads',
          limit: parseInt(opts.limit ?? '10', 10),
        });

        if (result.personalities.length === 0) {
          console.log('No personalities found.');
          return;
        }

        console.log(`\nPersonality Marketplace (${result.total} total)\n`);
        for (const p of result.personalities) {
          console.log(`  ${p.name} v${p.version} by ${p.author}`);
          console.log(`    ${p.description}`);
          console.log(`    Preview: "${p.preview}"`);
          console.log(`    Downloads: ${p.downloads} | Rating: ${p.rating}/5`);
          console.log('');
        }
      } catch (error) {
        console.error('Failed to search marketplace:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  cmd.command('install <name>')
    .description('Install a personality from the marketplace')
    .option('-v, --version <version>', 'Specific version to install')
    .action(async (name: string, opts: { version?: string }) => {
      const config = await loadConfig();
      const registry = createRegistryFromConfig(config);

      try {
        console.log(`Installing personality "${name}"...`);
        const result = await registry.installPersonality(name, opts.version);

        if (!result.success) {
          console.error(`Installation failed: ${result.error}`);
          process.exit(1);
        }

        console.log(`\nPersonality "${result.name}" v${result.version} installed successfully.`);
        console.log('Run `auxiora personality set <name>` to activate it.\n');
      } catch (error) {
        console.error('Failed to install personality:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  cmd.command('publish [path]')
    .description('Publish your SOUL.md personality to the marketplace')
    .action(async (soulPath?: string) => {
      const config = await loadConfig();
      const registry = createRegistryFromConfig(config);

      const filePath = soulPath ?? getSoulPath();

      try {
        console.log(`Publishing personality from ${filePath}...`);
        const result = await registry.publishPersonality(filePath);

        if (!result.success) {
          console.error(`Publish failed: ${result.error}`);
          process.exit(1);
        }

        console.log(`\nPersonality "${result.name}" v${result.version} published successfully.`);
      } catch (error) {
        console.error('Failed to publish personality:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  cmd.command('preview <name>')
    .description('Preview a personality from the marketplace')
    .action(async (name: string) => {
      const config = await loadConfig();
      const registry = createRegistryFromConfig(config);

      try {
        const listing = await registry.getPersonality(name);

        if (!listing) {
          console.error(`Personality "${name}" not found in marketplace.`);
          process.exit(1);
        }

        console.log(`\nPersonality: ${listing.name} v${listing.version}\n`);
        console.log(`  Author: ${listing.author}`);
        console.log(`  Description: ${listing.description}`);
        console.log(`  Preview: "${listing.preview}"`);
        console.log(`  Tone:`);
        console.log(`    Warmth: ${listing.tone.warmth}`);
        console.log(`    Humor: ${listing.tone.humor}`);
        console.log(`    Formality: ${listing.tone.formality}`);
        console.log(`  Keywords: ${listing.keywords.join(', ')}`);
        console.log(`  Downloads: ${listing.downloads} | Rating: ${listing.rating}/5`);
        console.log(`  Updated: ${listing.updatedAt}`);
        console.log('');
      } catch (error) {
        console.error('Failed to preview personality:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return cmd;
}
