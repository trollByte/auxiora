import { Command } from 'commander';
import { password as passwordPrompt } from '@inquirer/prompts';
import { Vault, VaultError } from '@auxiora/vault';
import { audit } from '@auxiora/audit';

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

  return vaultCmd;
}
