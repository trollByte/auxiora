import { Command } from 'commander';
import { input, select, password as passwordPrompt, checkbox } from '@inquirer/prompts';
import { OnboardingWizard, applyOnboarding } from '@auxiora/onboarding';
import type { OnboardingAnswers, OnboardingChoice } from '@auxiora/onboarding';
import { PersonalityManager } from '@auxiora/personality';
import { getWorkspacePath } from '@auxiora/core';
import * as path from 'node:path';

export function createInitCommand(): Command {
  return new Command('init')
    .description('Set up Auxiora with an interactive wizard')
    .option('--name <name>', 'Agent name')
    .option('--personality <template>', 'Personality template')
    .option('--provider <provider>', 'AI provider (anthropic|openai)')
    .option('--channel <channels...>', 'Channels to enable')
    .action(async (options: {
      name?: string;
      personality?: string;
      provider?: string;
      channel?: string[];
    }) => {
      console.log('\nWelcome to Auxiora Setup\n');

      const wizard = new OnboardingWizard();

      // Load available templates for the personality step
      const workspaceDir = getWorkspacePath();
      const templatesDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'personality', 'templates');
      const manager = new PersonalityManager(templatesDir, workspaceDir);
      const templates = await manager.listTemplates();

      const steps = wizard.getSteps(templates);
      const raw: Record<string, unknown> = {};

      for (const step of steps) {
        // Use CLI flags if provided, otherwise prompt interactively
        if (step.id === 'agentName' && options.name) {
          raw[step.id] = options.name;
          continue;
        }
        if (step.id === 'personality' && options.personality) {
          raw[step.id] = options.personality;
          continue;
        }
        if (step.id === 'provider' && options.provider) {
          raw[step.id] = options.provider;
          continue;
        }
        if (step.id === 'channels' && options.channel) {
          raw[step.id] = options.channel;
          continue;
        }

        switch (step.type) {
          case 'text':
            raw[step.id] = await input({
              message: step.prompt,
              default: step.default,
            });
            break;

          case 'select':
            raw[step.id] = await select({
              message: step.prompt,
              choices: (step.choices ?? []).map((c: OnboardingChoice) => ({
                name: c.name,
                value: c.value,
                description: c.description,
              })),
              default: step.default,
            });
            break;

          case 'password':
            raw[step.id] = await passwordPrompt({
              message: step.prompt,
            });
            break;

          case 'multiselect':
            raw[step.id] = await checkbox({
              message: step.prompt,
              choices: (step.choices ?? []).map((c: OnboardingChoice) => ({
                name: c.name,
                value: c.value,
                checked: c.value === step.default,
              })),
            });
            break;
        }
      }

      const answers: OnboardingAnswers = wizard.buildAnswers(raw);
      const result = await applyOnboarding(answers);

      // Note: API key should be stored in vault separately via `auxiora vault add`
      if (answers.apiKey) {
        const keyName = answers.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
        console.log(`\nTo store your API key securely, run:`);
        console.log(`  auxiora vault add ${keyName}\n`);
      }

      console.log('\n' + result.summary);
      console.log('\nSetup complete! Run `auxiora start` to launch your agent.\n');
    });
}
