import { Command } from 'commander';
import { password as passwordPrompt, confirm } from '@inquirer/prompts';
import { Vault, VaultError, vaultExists } from '@auxiora/vault';
import { audit } from '@auxiora/audit';

// Known secret names used by Auxiora
const KNOWN_SECRETS = {
  // AI Providers
  ANTHROPIC_API_KEY: 'Anthropic Claude API key',
  ANTHROPIC_OAUTH_TOKEN: 'Anthropic OAuth token (from claude setup-token)',
  OPENAI_API_KEY: 'OpenAI API key',
  // Channel adapters
  DISCORD_BOT_TOKEN: 'Discord bot token',
  TELEGRAM_BOT_TOKEN: 'Telegram bot token',
  SLACK_BOT_TOKEN: 'Slack bot OAuth token',
  SLACK_APP_TOKEN: 'Slack app-level token (for Socket Mode)',
  TWILIO_ACCOUNT_SID: 'Twilio account SID',
  TWILIO_AUTH_TOKEN: 'Twilio auth token',
  TWILIO_PHONE_NUMBER: 'Twilio phone number',
} as const;

type KnownSecret = keyof typeof KNOWN_SECRETS;

async function unlockVault(vault: Vault): Promise<boolean> {
  const password = await passwordPrompt({
    message: 'Enter vault password:',
  });

  try {
    await vault.unlock(password);
    await audit('vault.unlock', { success: true });
    return true;
  } catch (error) {
    if (error instanceof VaultError) {
      await audit('vault.unlock_failed', { reason: error.message });
      console.error(`Error: ${error.message}`);
      return false;
    }
    throw error;
  }
}

export function createVaultCommand(): Command {
  const vaultCmd = new Command('vault').description(
    'Manage encrypted credential vault'
  );

  vaultCmd
    .command('add <name>')
    .description('Add a credential to the vault')
    .action(async (name: string) => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const value = await passwordPrompt({
          message: `Enter value for "${name}":`,
        });

        await vault.add(name, value);
        await audit('vault.add', { name });
        console.log(`Added "${name}" to vault`);
      } finally {
        await audit('vault.lock', {});
        vault.lock();
      }
    });

  vaultCmd
    .command('list')
    .description('List all credential names in the vault')
    .action(async () => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const names = vault.list();

        if (names.length === 0) {
          console.log('No credentials stored');
        } else {
          console.log('Stored credentials:');
          for (const name of names) {
            console.log(`  - ${name}`);
          }
        }
      } finally {
        await audit('vault.lock', {});
        vault.lock();
      }
    });

  vaultCmd
    .command('remove <name>')
    .description('Remove a credential from the vault')
    .action(async (name: string) => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const removed = await vault.remove(name);

        if (removed) {
          await audit('vault.remove', { name });
          console.log(`Removed "${name}" from vault`);
        } else {
          console.log(`Credential "${name}" not found`);
        }
      } finally {
        await audit('vault.lock', {});
        vault.lock();
      }
    });

  vaultCmd
    .command('get <name>')
    .description('Get a credential value from the vault')
    .action(async (name: string) => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const value = vault.get(name);

        if (value === undefined) {
          console.error(`Credential "${name}" not found`);
          process.exit(1);
        } else {
          await audit('vault.access', { name });
          console.log(value);
        }
      } finally {
        await audit('vault.lock', {});
        vault.lock();
      }
    });

  vaultCmd
    .command('status')
    .description('Show vault status and configured secrets')
    .action(async () => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const storedNames = new Set(vault.list());
        const customSecrets = vault.list().filter((name) => !(name in KNOWN_SECRETS));

        console.log('\n🔐 Vault Status\n');

        // AI Providers section
        console.log('AI Providers:');
        const providerSecrets: KnownSecret[] = ['ANTHROPIC_API_KEY', 'ANTHROPIC_OAUTH_TOKEN', 'OPENAI_API_KEY'];
        for (const name of providerSecrets) {
          const status = storedNames.has(name) ? '✅' : '❌';
          console.log(`  ${status} ${name} - ${KNOWN_SECRETS[name]}`);
        }

        // Channels section
        console.log('\nChannel Adapters:');
        const channelSecrets: KnownSecret[] = [
          'DISCORD_BOT_TOKEN',
          'TELEGRAM_BOT_TOKEN',
          'SLACK_BOT_TOKEN',
          'SLACK_APP_TOKEN',
          'TWILIO_ACCOUNT_SID',
          'TWILIO_AUTH_TOKEN',
          'TWILIO_PHONE_NUMBER',
        ];
        for (const name of channelSecrets) {
          const status = storedNames.has(name) ? '✅' : '⬚ ';
          console.log(`  ${status} ${name} - ${KNOWN_SECRETS[name]}`);
        }

        // Custom secrets
        if (customSecrets.length > 0) {
          console.log('\nCustom Secrets:');
          for (const name of customSecrets) {
            console.log(`  ✅ ${name}`);
          }
        }

        // Summary
        const configured = storedNames.size;
        const hasProvider = storedNames.has('ANTHROPIC_API_KEY') || storedNames.has('ANTHROPIC_OAUTH_TOKEN') || storedNames.has('OPENAI_API_KEY');

        console.log('\n---');
        console.log(`Total secrets: ${configured}`);

        if (!hasProvider) {
          console.log('\n⚠️  No AI provider configured. Add one with:');
          console.log('   auxiora vault add ANTHROPIC_API_KEY');
        }

        console.log('');
      } finally {
        await audit('vault.lock', {});
        vault.lock();
      }
    });

  vaultCmd
    .command('secrets')
    .description('List all known secret names and their purpose')
    .action(() => {
      console.log('\n📋 Known Secrets\n');
      console.log('AI Providers (at least one required):');
      console.log('  ANTHROPIC_API_KEY   - Anthropic Claude API key');
      console.log('  OPENAI_API_KEY      - OpenAI API key');
      console.log('\nDiscord:');
      console.log('  DISCORD_BOT_TOKEN   - Discord bot token from Developer Portal');
      console.log('\nTelegram:');
      console.log('  TELEGRAM_BOT_TOKEN  - Telegram bot token from @BotFather');
      console.log('\nSlack (both required):');
      console.log('  SLACK_BOT_TOKEN     - Bot User OAuth Token (xoxb-...)');
      console.log('  SLACK_APP_TOKEN     - App-Level Token for Socket Mode (xapp-...)');
      console.log('\nTwilio (all required):');
      console.log('  TWILIO_ACCOUNT_SID  - Account SID from Console');
      console.log('  TWILIO_AUTH_TOKEN   - Auth Token from Console');
      console.log('  TWILIO_PHONE_NUMBER - Your Twilio phone number (+1...)');
      console.log('\nUsage:');
      console.log('  auxiora vault add DISCORD_BOT_TOKEN');
      console.log('  auxiora vault status\n');
    });

  vaultCmd
    .command('init')
    .description('Initialize a new vault with a password')
    .action(async () => {
      // Check if vault already exists
      if (await vaultExists()) {
        console.error('Vault already exists. Use "vault change-password" to change the password.');
        console.error('Or delete the vault file and run init again.');
        process.exit(1);
      }

      console.log('Initializing new vault...\n');

      const password = await passwordPrompt({
        message: 'Enter new vault password:',
      });

      const confirmPassword = await passwordPrompt({
        message: 'Confirm vault password:',
      });

      if (password !== confirmPassword) {
        console.error('Passwords do not match');
        process.exit(1);
      }

      if (password.length < 8) {
        console.error('Password must be at least 8 characters');
        process.exit(1);
      }

      const vault = new Vault();
      await vault.unlock(password);
      vault.lock();

      await audit('vault.init', {});
      console.log('✅ Vault initialized successfully');
      console.log('\nNext steps:');
      console.log('  auxiora vault add ANTHROPIC_API_KEY');
      console.log('  auxiora vault status');
    });

  vaultCmd
    .command('change-password')
    .description('Change the vault password')
    .action(async () => {
      // Check if vault exists
      if (!(await vaultExists())) {
        console.error('No vault found. Use "vault init" to create one.');
        process.exit(1);
      }

      const vault = new Vault();

      // Unlock with current password
      console.log('Enter your current vault password to continue.\n');
      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const newPassword = await passwordPrompt({
          message: 'Enter new vault password:',
        });

        const confirmPassword = await passwordPrompt({
          message: 'Confirm new vault password:',
        });

        if (newPassword !== confirmPassword) {
          console.error('Passwords do not match');
          process.exit(1);
        }

        if (newPassword.length < 8) {
          console.error('Password must be at least 8 characters');
          process.exit(1);
        }

        const confirmed = await confirm({
          message: 'Are you sure you want to change the vault password?',
          default: false,
        });

        if (!confirmed) {
          console.log('Cancelled');
          process.exit(0);
        }

        await vault.changePassword(newPassword);
        await audit('vault.password_changed', {});
        console.log('✅ Vault password changed successfully');
      } finally {
        vault.lock();
      }
    });

  return vaultCmd;
}
