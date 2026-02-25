import * as crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 600000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;

export interface ExportedKey {
  version: number;
  salt: string;
  iterations: number;
  keyHash: string;
}

/**
 * KeyManager handles key derivation, rotation, and import/export
 * for client-side cloud vault encryption.
 */
export class KeyManager {
  /**
   * Derive a 256-bit key from a password using PBKDF2.
   */
  static async deriveKey(password: string, salt?: Buffer): Promise<{ key: Buffer; salt: Buffer }> {
    const keySalt = salt ?? crypto.randomBytes(SALT_LENGTH);

    const key = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, keySalt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });

    return { key, salt: keySalt };
  }

  /**
   * Generate a random 256-bit master key.
   */
  static generateKey(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  /**
   * Rotate a key: derive a new key from a new password.
   * Returns both old and new keys for re-encryption.
   */
  static async rotateKey(
    oldPassword: string,
    oldSalt: Buffer,
    newPassword: string,
  ): Promise<{ oldKey: Buffer; newKey: Buffer; newSalt: Buffer }> {
    const { key: oldKey } = await KeyManager.deriveKey(oldPassword, oldSalt);
    const { key: newKey, salt: newSalt } = await KeyManager.deriveKey(newPassword);

    return { oldKey, newKey, newSalt };
  }

  /**
   * Export a key's metadata for storage (does NOT export the key itself).
   * Stores the salt and a hash of the derived key for verification.
   */
  static exportKeyMetadata(salt: Buffer, key: Buffer): ExportedKey {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    return {
      version: 1,
      salt: salt.toString('base64'),
      iterations: PBKDF2_ITERATIONS,
      keyHash,
    };
  }

  /**
   * Import key metadata and verify a password against it.
   */
  static async verifyPassword(password: string, exported: ExportedKey): Promise<{ valid: boolean; key: Buffer }> {
    const salt = Buffer.from(exported.salt, 'base64');
    const { key } = await KeyManager.deriveKey(password, salt);
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    if (keyHash === exported.keyHash) {
      return { valid: true, key };
    }

    key.fill(0);
    return { valid: false, key: Buffer.alloc(0) };
  }
}
