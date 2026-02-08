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
    .option('-p, --password <password>', 'Vault password (or set AUXIORA_VAULT_PASSWORD env var)')
    .option('--no-vault', 'Start without unlocking the vault')
    .action(async (options) => {
      let vaultPassword: string | undefined;

      if (options.vault !== false) {
        vaultPassword = options.password || process.env.AUXIORA_VAULT_PASSWORD;

        if (!vaultPassword) {
          // No password from flag or env — prompt interactively if possible
          if (!process.stdin.isTTY) {
            console.error('No vault password provided. Set AUXIORA_VAULT_PASSWORD or use --password.');
            process.exit(1);
          }
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
