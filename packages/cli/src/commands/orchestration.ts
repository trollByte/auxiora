import { Command } from 'commander';
import { loadConfig } from '@auxiora/config';

export function createOrchestrationCommand(): Command {
  const cmd = new Command('orchestrate').description(
    'Multi-agent orchestration',
  );

  cmd
    .command('status')
    .description('Show orchestration engine status')
    .action(async () => {
      const config = await loadConfig();
      const orch = config.orchestration;

      console.log('\nOrchestration Configuration:\n');
      console.log(`  Enabled:             ${orch.enabled}`);
      console.log(`  Max Concurrent:      ${orch.maxConcurrentAgents}`);
      console.log(`  Default Timeout:     ${orch.defaultTimeout}ms`);
      console.log(`  Total Timeout:       ${orch.totalTimeout}ms`);
      console.log(`  Cost Warning:        ${orch.costMultiplierWarning}x`);
      console.log(`  Allowed Patterns:    ${orch.allowedPatterns.join(', ')}`);
      console.log('');
    });

  cmd
    .command('run')
    .argument('<pattern>', 'Orchestration pattern: parallel, sequential, debate, map-reduce, supervisor')
    .argument('<goal>', 'The goal or question for the agents')
    .option('--providers <list>', 'Comma-separated providers to use', 'anthropic')
    .option('--agents <count>', 'Number of agents per provider', '2')
    .description('Run an orchestration workflow (requires running server)')
    .action(async (pattern: string, goal: string, options: { providers: string; agents: string }) => {
      const validPatterns = ['parallel', 'sequential', 'debate', 'map-reduce', 'supervisor'];
      if (!validPatterns.includes(pattern)) {
        console.error(`Invalid pattern: ${pattern}`);
        console.error(`Valid patterns: ${validPatterns.join(', ')}`);
        process.exit(1);
      }

      const providers = options.providers.split(',').map((p) => p.trim());
      const agentCount = parseInt(options.agents, 10);

      console.log(`\nOrchestration: ${pattern}`);
      console.log(`Goal: ${goal}`);
      console.log(`Providers: ${providers.join(', ')}`);
      console.log(`Agents per provider: ${agentCount}`);
      console.log('');
      console.log('Note: Direct CLI orchestration requires a running Auxiora server.');
      console.log('Use the assemble_team tool via chat, or start the server first.');
      console.log('');
      console.log('Example via chat:');
      console.log(`  "Use the assemble_team tool with pattern=${pattern} and goal: ${goal}"`);
      console.log('');
    });

  return cmd;
}
