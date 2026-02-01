import { Command } from 'commander';
import { password as passwordPrompt } from '@inquirer/prompts';
import { startAuxiora, type Auxiora } from '@auxiora/runtime';

let auxiora: Auxiora | null = null;

async function gracefulShutdown(): Promise<void> {
  console.log('\nShutting down...');
  if (auxiora) {
    await auxiora.stop();
  }
  process.exit(0);
}

export function createStartCommand(): Command {
  return new Command('start')
    .description('Start the Auxiora gateway')
    .option('-p, --password <password>', 'Vault password (will prompt if not provided)')
    .option('--no-vault', 'Start without unlocking the vault')
    .action(async (options) => {
      let vaultPassword: string | undefined;

      if (options.vault !== false) {
        vaultPassword = options.password;

        if (!vaultPassword) {
          try {
            vaultPassword = await passwordPrompt({
              message: 'Enter vault password:',
            });
          } catch {
            console.log('Vault password required. Use --no-vault to skip.');
            process.exit(1);
          }
        }
      }

      // Handle shutdown signals
      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);

      try {
        auxiora = await startAuxiora({ vaultPassword });

        // Keep process running
        process.stdin.resume();
      } catch (error) {
        console.error('Failed to start:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
