/**
 * Encrypted storage interface for The Architect's persistence layer.
 *
 * Implementations must ensure all stored values are encrypted at rest.
 * The persistence module stores serialized JSON strings via this interface
 * and trusts the adapter to handle encryption transparently.
 */
export interface EncryptedStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * In-memory implementation of EncryptedStorage for development and testing.
 * Data is NOT encrypted — use only in non-production environments.
 */
export class InMemoryEncryptedStorage implements EncryptedStorage {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}

/**
 * Adapter that wraps Auxiora's Vault as an EncryptedStorage implementation.
 *
 * The Vault must be unlocked before use. All values are AES-256-GCM encrypted
 * on disk via the vault's own encryption layer.
 *
 * Usage:
 *   const vault = new Vault();
 *   await vault.unlock(password);
 *   const storage = new VaultStorageAdapter(vault);
 *   const persistence = new ArchitectPersistence(storage);
 */
export class VaultStorageAdapter implements EncryptedStorage {
  private vault: VaultLike;

  constructor(vault: VaultLike) {
    this.vault = vault;
  }

  async get(key: string): Promise<string | null> {
    return this.vault.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.vault.add(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.vault.remove(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.vault.has(key);
  }
}

/**
 * Minimal interface matching Auxiora's Vault class.
 * Allows the adapter to work without a hard dependency on the vault package.
 */
export interface VaultLike {
  get(name: string): string | undefined;
  add(name: string, value: string): Promise<void>;
  remove(name: string): Promise<boolean>;
  has(name: string): boolean;
}
