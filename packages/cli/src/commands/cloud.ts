import { Command } from 'commander';
import { password as passwordPrompt } from '@inquirer/prompts';
import { Vault, VaultError, CloudVault, KeyManager, EjectManager } from '@auxiora/vault';
import { audit } from '@auxiora/audit';

async function unlockVault(vault: Vault): Promise<boolean> {
  const password = await passwordPrompt({
    message: 'Enter vault password:',
  });

  try {
    await vault.unlock(password);
    return true;
  } catch (error) {
    if (error instanceof VaultError) {
      console.error(`Error: ${error.message}`);
      return false;
    }
    throw error;
  }
}

export function createCloudCommand(): Command {
  const cloudCmd = new Command('cloud').description(
    'Cloud vault operations — export, import, eject'
  );

  cloudCmd
    .command('export <file>')
    .description('Export vault credentials to a portable file')
    .action(async (file: string) => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const names = vault.list();
        const credentials: Record<string, string> = {};
        for (const name of names) {
          const value = vault.get(name);
          if (value !== undefined) {
            credentials[name] = value;
          }
        }

        const data = EjectManager.exportData(credentials);
        await EjectManager.saveToFile(data, file);
        await audit('cloud.export', { credentialCount: names.length });
        console.log(`Exported ${names.length} credentials to ${file}`);
      } finally {
        vault.lock();
      }
    });

  cloudCmd
    .command('import <file>')
    .description('Import credentials from a portable file into the vault')
    .action(async (file: string) => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const data = await EjectManager.loadFromFile(file);
        const credentials = EjectManager.getCredentials(data);
        let count = 0;

        for (const [name, value] of Object.entries(credentials)) {
          await vault.add(name, value);
          count++;
        }

        console.log(`Imported ${count} credentials from ${file}`);
      } finally {
        vault.lock();
      }
    });

  cloudCmd
    .command('eject <file>')
    .description('Export all data in a portable format for migration')
    .action(async (file: string) => {
      const vault = new Vault();

      if (!(await unlockVault(vault))) {
        process.exit(1);
      }

      try {
        const names = vault.list();
        const credentials: Record<string, string> = {};
        for (const name of names) {
          const value = vault.get(name);
          if (value !== undefined) {
            credentials[name] = value;
          }
        }

        const data = EjectManager.exportData(credentials, {
          source: 'auxiora-cloud',
          ejectedAt: new Date().toISOString(),
        });

        await EjectManager.saveToFile(data, file);
        console.log(`Ejected ${names.length} credentials to ${file}`);
        console.log('You can import this file into any Auxiora instance.');
      } finally {
        vault.lock();
      }
    });

  return cloudCmd;
}
