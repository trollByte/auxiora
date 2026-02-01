import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getVaultPath, isWindows } from '@auxiora/core';

export interface VaultFile {
  version: number;
  salt: string;
  iv: string;
  data: string;
  tag: string;
}

export async function readVaultFile(): Promise<VaultFile | null> {
  const vaultPath = getVaultPath();

  try {
    const content = await fs.readFile(vaultPath, 'utf-8');
    return JSON.parse(content) as VaultFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeVaultFile(vaultFile: VaultFile): Promise<void> {
  const vaultPath = getVaultPath();
  const vaultDir = path.dirname(vaultPath);

  // Create parent directories if needed
  await fs.mkdir(vaultDir, { recursive: true });

  // Write the file
  await fs.writeFile(vaultPath, JSON.stringify(vaultFile, null, 2), 'utf-8');

  // Set permissions to 0600 on Unix
  if (!isWindows()) {
    await fs.chmod(vaultPath, 0o600);
  }
}

export async function deleteVaultFile(): Promise<void> {
  const vaultPath = getVaultPath();

  try {
    await fs.unlink(vaultPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
