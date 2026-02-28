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

export { getVaultPath };

export async function readVaultFile(customPath?: string): Promise<VaultFile | null> {
  const vaultPath = customPath || getVaultPath();

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

export async function writeVaultFile(vaultFile: VaultFile, customPath?: string): Promise<void> {
  const vaultPath = customPath || getVaultPath();
  const vaultDir = path.dirname(vaultPath);

  // Create parent directories if needed
  await fs.mkdir(vaultDir, { recursive: true });

  // Atomic write: write to temp file, then rename (rename is atomic on POSIX)
  const tmpPath = vaultPath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(vaultFile, null, 2), 'utf-8');

  // Set permissions to 0600 on Unix before rename
  if (!isWindows()) {
    await fs.chmod(tmpPath, 0o600);
  }

  await fs.rename(tmpPath, vaultPath);
}

export async function deleteVaultFile(customPath?: string): Promise<void> {
  const vaultPath = customPath || getVaultPath();

  try {
    await fs.unlink(vaultPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function vaultExists(customPath?: string): Promise<boolean> {
  const vaultPath = customPath || getVaultPath();

  try {
    await fs.access(vaultPath);
    return true;
  } catch {
    return false;
  }
}
