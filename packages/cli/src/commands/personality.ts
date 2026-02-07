import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { PersonalityManager } from '@auxiora/personality';
import type { SoulConfig } from '@auxiora/personality';
import { loadConfig, saveConfig } from '@auxiora/config';
import { getWorkspacePath } from '@auxiora/core';
import * as path from 'node:path';

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

  return cmd;
}
