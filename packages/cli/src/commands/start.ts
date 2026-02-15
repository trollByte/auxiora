import { Command } from 'commander';
import { password as passwordPrompt } from '@inquirer/prompts';
import open from 'open';
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
    .option('--no-browser', 'Do not auto-open browser')
    .action(async (options) => {
      let vaultPassword: string | undefined;

      if (options.vault !== false) {
        vaultPassword = options.password || process.env.AUXIORA_VAULT_PASSWORD;

        if (!vaultPassword) {
          if (!process.stdin.isTTY) {
            // Setup mode: start without vault, setup wizard handles initialization
            console.log('No vault password found. Starting in setup mode...');
            console.log('Open the dashboard in your browser to complete setup.');
            // vaultPassword stays undefined — runtime starts with vault locked
          } else {
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
      }

      // Handle shutdown signals (SIGINT: Ctrl+C on all platforms, SIGTERM: Unix,
      // SIGBREAK: Windows console close / Ctrl+Break)
      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);
      if (process.platform === 'win32') {
        process.on('SIGBREAK', gracefulShutdown);
      }

      process.on('unhandledRejection', (reason) => {
        console.error('Unhandled rejection:', reason instanceof Error ? reason.message : reason);
      });

      process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error.message);
        gracefulShutdown();
      });

      try {
        auxiora = await startAuxiora({ vaultPassword });

        const port = process.env.AUXIORA_GATEWAY_PORT || '18800';
        const dashboardUrl = `http://localhost:${port}/dashboard`;

        console.log('');
        console.log('  ╔══════════════════════════════════════════════╗');
        console.log(`  ║  Auxiora is running!                         ║`);
        console.log(`  ║  Dashboard: ${dashboardUrl.padEnd(33)}║`);
        console.log('  ╚══════════════════════════════════════════════╝');
        console.log('');

        // Auto-open browser if interactive TTY and not explicitly disabled
        if (process.stdin.isTTY && !process.env.AUXIORA_NO_BROWSER && options.browser !== false) {
          try {
            await open(dashboardUrl);
          } catch {
            // Non-fatal — user can open manually
          }
        }

        // Keep process running
        process.stdin.resume();
      } catch (error) {
        console.error('Failed to start:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
