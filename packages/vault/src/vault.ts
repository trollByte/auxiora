import {
  deriveKey,
  generateSalt,
  encrypt,
  decrypt,
  zeroBuffer,
  type EncryptedData,
} from './crypto.js';
import { readVaultFile, writeVaultFile, type VaultFile } from './storage.js';

interface VaultData {
  credentials: Record<string, string>;
}

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

export interface VaultOptions {
  path?: string;
}

export class Vault {
  private key: Buffer | null = null;
  private salt: Buffer | null = null;
  private credentials: Record<string, string> = {};
  private isUnlocked = false;
  private vaultPath?: string;

  constructor(options?: VaultOptions) {
    this.vaultPath = options?.path;
  }

  async unlock(password: string): Promise<void> {
    const vaultFile = await readVaultFile(this.vaultPath);

    if (vaultFile === null) {
      // New vault - create with this password
      this.salt = generateSalt();
      this.key = await deriveKey(password, this.salt);
      this.credentials = {};
      this.isUnlocked = true;
      await this.save();
      return;
    }

    // Existing vault - decrypt
    this.salt = Buffer.from(vaultFile.salt, 'base64');
    this.key = await deriveKey(password, this.salt);

    const encryptedData: EncryptedData = {
      iv: Buffer.from(vaultFile.iv, 'base64'),
      ciphertext: Buffer.from(vaultFile.data, 'base64'),
      tag: Buffer.from(vaultFile.tag, 'base64'),
    };

    try {
      const plaintext = decrypt(encryptedData, this.key);
      const data = JSON.parse(plaintext.toString('utf-8')) as VaultData;
      this.credentials = data.credentials;
      this.isUnlocked = true;
    } catch {
      this.lock();
      throw new VaultError('Wrong password or corrupted vault');
    }
  }

  lock(): void {
    if (this.key) {
      zeroBuffer(this.key);
      this.key = null;
    }
    this.salt = null;
    this.credentials = {};
    this.isUnlocked = false;
  }

  private ensureUnlocked(): void {
    if (!this.isUnlocked || !this.key || !this.salt) {
      throw new VaultError('Vault is locked');
    }
  }

  private async save(): Promise<void> {
    this.ensureUnlocked();

    const data: VaultData = { credentials: this.credentials };
    const plaintext = Buffer.from(JSON.stringify(data), 'utf-8');
    const encrypted = encrypt(plaintext, this.key!);

    const vaultFile: VaultFile = {
      version: 1,
      salt: this.salt!.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      data: encrypted.ciphertext.toString('base64'),
      tag: encrypted.tag.toString('base64'),
    };

    await writeVaultFile(vaultFile, this.vaultPath);
  }

  async add(name: string, value: string): Promise<void> {
    this.ensureUnlocked();
    this.credentials[name] = value;
    await this.save();
  }

  list(): string[] {
    this.ensureUnlocked();
    return Object.keys(this.credentials);
  }

  async remove(name: string): Promise<boolean> {
    this.ensureUnlocked();
    if (!(name in this.credentials)) {
      return false;
    }
    delete this.credentials[name];
    await this.save();
    return true;
  }

  get(name: string): string | undefined {
    this.ensureUnlocked();
    return this.credentials[name];
  }

  has(name: string): boolean {
    this.ensureUnlocked();
    return name in this.credentials;
  }
}
