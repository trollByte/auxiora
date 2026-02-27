import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { getVaultPath, isWindows } from '@auxiora/core';
import { encrypt, decrypt, zeroBuffer } from './crypto.js';
import type { Vault } from './vault.js';

/** Seal file format persisted to disk */
export interface SealFile {
  version: 1;
  fingerprintHash: string;
  pinRequired: boolean;
  iv: string;
  data: string;
  tag: string;
  salt: string;
}

/** Options for SealManager */
export interface SealOptions {
  vaultPath?: string;
}

// Lighter Argon2 params — fingerprint adds entropy so we don't need 64MB
const SEAL_MEMORY_COST = 8192; // 8MB
const SEAL_TIME_COST = 1;
const SEAL_KEY_LENGTH = 32;

/**
 * Collects a machine-specific fingerprint for binding the seal to this host.
 *
 * On Linux: reads /etc/machine-id
 * On macOS: reads IOPlatformUUID via ioreg
 * Fallback: hostname + homedir (less unique but still machine-bound)
 */
export async function getMachineFingerprint(): Promise<Buffer> {
  const hostname = os.hostname();
  const platform = os.platform();

  let machineId: string;
  try {
    if (platform === 'linux') {
      machineId = (await fs.readFile('/etc/machine-id', 'utf-8')).trim();
    } else if (platform === 'darwin') {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
      const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      machineId = match ? match[1] : `${hostname}-${os.homedir()}`;
    } else {
      machineId = `${hostname}-${os.homedir()}`;
    }
  } catch {
    machineId = `${hostname}-${os.homedir()}`;
  }

  const raw = `${hostname}:${platform}:${machineId}`;
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Derives a seal key from an optional PIN and machine fingerprint.
 */
async function deriveSealKey(pin: string, fingerprint: Buffer): Promise<Buffer> {
  const key = await argon2.hash(pin, {
    type: argon2.argon2id,
    salt: fingerprint,
    memoryCost: SEAL_MEMORY_COST,
    timeCost: SEAL_TIME_COST,
    parallelism: 1,
    hashLength: SEAL_KEY_LENGTH,
    raw: true,
  });
  return key;
}

/**
 * Manages sealed auto-unseal for the vault.
 *
 * Sealing encrypts the vault password with a machine-derived key so the vault
 * can auto-unlock on restart without a plaintext password on disk.
 */
export class SealManager {
  private readonly sealPath: string;

  constructor(options?: SealOptions) {
    const vaultDir = path.dirname(options?.vaultPath ?? getVaultPath());
    this.sealPath = path.join(vaultDir, 'seal.enc');
  }

  /**
   * Seal the vault password for auto-unseal on restart.
   * Vault must already be unlocked (caller verified the password).
   */
  async seal(vaultPassword: string, pin?: string): Promise<void> {
    const fingerprint = await getMachineFingerprint();
    const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
    const effectivePin = pin ?? '';

    const sealKey = await deriveSealKey(effectivePin, fingerprint);

    try {
      const plaintext = Buffer.from(vaultPassword, 'utf-8');
      const encrypted = encrypt(plaintext, sealKey);

      const sealFile: SealFile = {
        version: 1,
        fingerprintHash,
        pinRequired: effectivePin.length > 0,
        iv: encrypted.iv.toString('base64'),
        data: encrypted.ciphertext.toString('base64'),
        tag: encrypted.tag.toString('base64'),
        salt: fingerprint.toString('base64'),
      };

      const dir = path.dirname(this.sealPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.sealPath, JSON.stringify(sealFile, null, 2), 'utf-8');

      if (!isWindows()) {
        await fs.chmod(this.sealPath, 0o600);
      }
    } finally {
      zeroBuffer(sealKey);
    }
  }

  /**
   * Attempt to auto-unseal the vault using the seal file.
   * Returns true on success, false on failure (caller should fall back).
   */
  async autoUnseal(vault: Vault, pin?: string): Promise<boolean> {
    if (!(await this.isSealed())) {
      return false;
    }

    let sealKey: Buffer | null = null;
    let recoveredPassword: Buffer | null = null;

    try {
      const content = await fs.readFile(this.sealPath, 'utf-8');
      const sealFile = JSON.parse(content) as SealFile;

      if (sealFile.version !== 1) {
        return false;
      }

      // Reconstruct fingerprint and verify machine match
      const fingerprint = await getMachineFingerprint();
      const currentHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

      if (currentHash !== sealFile.fingerprintHash) {
        return false; // Different machine
      }

      const effectivePin = pin ?? '';

      // If seal requires PIN but none provided, fail
      if (sealFile.pinRequired && effectivePin.length === 0) {
        return false;
      }

      sealKey = await deriveSealKey(effectivePin, fingerprint);

      const encryptedData = {
        iv: Buffer.from(sealFile.iv, 'base64'),
        ciphertext: Buffer.from(sealFile.data, 'base64'),
        tag: Buffer.from(sealFile.tag, 'base64'),
      };

      recoveredPassword = decrypt(encryptedData, sealKey);
      const passwordStr = recoveredPassword.toString('utf-8');

      await vault.unlock(passwordStr);
      return true;
    } catch {
      return false; // Decryption failed, wrong PIN, corrupted file, etc.
    } finally {
      if (sealKey) zeroBuffer(sealKey);
      if (recoveredPassword) zeroBuffer(recoveredPassword);
    }
  }

  /**
   * Remove the seal file, disabling auto-unseal.
   */
  async unseal(): Promise<void> {
    try {
      await fs.unlink(this.sealPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if a seal file exists.
   */
  async isSealed(): Promise<boolean> {
    try {
      await fs.access(this.sealPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the seal requires a PIN for auto-unseal.
   */
  async needsPin(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.sealPath, 'utf-8');
      const sealFile = JSON.parse(content) as SealFile;
      return sealFile.pinRequired;
    } catch {
      return false;
    }
  }
}
