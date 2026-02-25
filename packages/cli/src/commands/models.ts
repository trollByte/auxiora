import { Command } from 'commander';
import { loadConfig, saveConfig } from '@auxiora/config';
import { Vault } from '@auxiora/vault';
import {
  ProviderFactory,
  readClaudeCliCredentials,
  isSetupToken,
} from '@auxiora/providers';
import { CostTracker } from '@auxiora/router';

export function createModelsCommand(): Command {
  const cmd = new Command('models').description(
    'Manage AI model providers and routing',
  );

  cmd
    .command('list')
    .description('List all configured providers and models')
    .action(async () => {
      const config = await loadConfig();
      const vault = new Vault();

      // Try to unlock vault for credential check
      let anthropicKey: string | undefined;
      let openaiKey: string | undefined;
      let googleKey: string | undefined;

      try {
        anthropicKey = vault.get('ANTHROPIC_API_KEY');
        openaiKey = vault.get('OPENAI_API_KEY');
        googleKey = vault.get('GOOGLE_API_KEY');

        if (anthropicKey && isSetupToken(anthropicKey)) {
          anthropicKey = '(oauth-token)';
        }
      } catch {
        // vault locked
      }

      // Check CLI credentials
      const cliCreds = readClaudeCliCredentials();

      console.log('\nConfigured Providers:\n');
      console.log(`  Primary: ${config.provider.primary}`);
      if (config.provider.fallback) {
        console.log(`  Fallback: ${config.provider.fallback}`);
      }

      console.log('\n  Provider         | Model                        | Status');
      console.log('  -----------------+------------------------------+---------');

      // Anthropic
      const anthropicStatus = anthropicKey || cliCreds ? 'ready' : 'no key';
      console.log(
        `  anthropic        | ${config.provider.anthropic.model.padEnd(28)} | ${anthropicStatus}`,
      );

      // OpenAI
      const openaiStatus = openaiKey ? 'ready' : 'no key';
      console.log(
        `  openai           | ${config.provider.openai.model.padEnd(28)} | ${openaiStatus}`,
      );

      // Google
      const googleStatus = googleKey ? 'ready' : 'no key';
      console.log(
        `  google           | ${config.provider.google.model.padEnd(28)} | ${googleStatus}`,
      );

      // Ollama
      console.log(
        `  ollama           | ${config.provider.ollama.model.padEnd(28)} | local`,
      );

      // OpenAI-compatible
      if (config.provider.openaiCompatible.baseUrl) {
        const name = config.provider.openaiCompatible.name;
        console.log(
          `  ${name.padEnd(16)} | ${config.provider.openaiCompatible.model.padEnd(28)} | custom`,
        );
      }

      console.log('');
    });

  cmd
    .command('status')
    .description('Show current routing status and cost summary')
    .action(async () => {
      const config = await loadConfig();

      console.log('\nRouting Configuration:\n');
      console.log(`  Enabled:  ${config.routing.enabled}`);
      if (config.routing.defaultModel) {
        console.log(`  Default:  ${config.routing.defaultModel}`);
      }

      if (config.routing.rules.length > 0) {
        console.log('\n  Rules:');
        for (const rule of config.routing.rules) {
          console.log(
            `    ${rule.task} -> ${rule.provider}/${rule.model} (priority: ${rule.priority})`,
          );
        }
      }

      console.log('\n  Preferences:');
      console.log(`    Prefer local:  ${config.routing.preferences.preferLocal}`);
      console.log(`    Prefer cheap:  ${config.routing.preferences.preferCheap}`);
      console.log(`    Sensitive to local:  ${config.routing.preferences.sensitiveToLocal}`);

      // Cost summary
      const costTracker = new CostTracker(config.routing.costLimits);
      await costTracker.load();
      const summary = costTracker.getSummary();

      console.log('\n  Cost Summary:');
      console.log(`    Today:       $${summary.today.toFixed(4)}`);
      console.log(`    This month:  $${summary.thisMonth.toFixed(4)}`);
      if (summary.budgetRemaining !== undefined) {
        console.log(`    Remaining:   $${summary.budgetRemaining.toFixed(4)}`);
      }
      if (summary.warningThresholdReached) {
        console.log('    WARNING: Budget warning threshold reached');
      }
      if (summary.isOverBudget) {
        console.log('    ALERT: Over budget!');
      }

      console.log('');
    });

  cmd
    .command('set-default')
    .argument('<provider>', 'Provider name')
    .argument('[model]', 'Model name')
    .description('Set the default model for all requests')
    .action(async (provider: string, model?: string) => {
      const config = await loadConfig();

      if (model) {
        config.routing = {
          ...config.routing,
          defaultModel: model,
        };
        console.log(`Default model set to: ${provider}/${model}`);
      } else {
        config.provider = {
          ...config.provider,
          primary: provider,
        };
        console.log(`Primary provider set to: ${provider}`);
      }

      await saveConfig(config);
      console.log('Configuration saved.');
    });

  cmd
    .command('cost')
    .description('Show detailed cost breakdown')
    .action(async () => {
      const config = await loadConfig();
      const costTracker = new CostTracker(config.routing.costLimits);
      await costTracker.load();

      console.log('\nCost Breakdown:\n');

      const byProvider = costTracker.getByProvider();
      if (byProvider.size > 0) {
        console.log('  By Provider:');
        for (const [name, cost] of byProvider) {
          console.log(`    ${name.padEnd(16)} $${cost.toFixed(4)}`);
        }
      }

      const byModel = costTracker.getByModel();
      if (byModel.size > 0) {
        console.log('\n  By Model:');
        for (const [name, cost] of byModel) {
          console.log(`    ${name.padEnd(28)} $${cost.toFixed(4)}`);
        }
      }

      if (byProvider.size === 0) {
        console.log('  No cost data recorded yet.');
      }

      // Budget info
      if (config.routing.costLimits.dailyBudget || config.routing.costLimits.monthlyBudget) {
        console.log('\n  Budget Limits:');
        if (config.routing.costLimits.dailyBudget) {
          console.log(`    Daily:   $${config.routing.costLimits.dailyBudget.toFixed(2)}`);
        }
        if (config.routing.costLimits.monthlyBudget) {
          console.log(`    Monthly: $${config.routing.costLimits.monthlyBudget.toFixed(2)}`);
        }
      }

      console.log('');
    });

  return cmd;
}
