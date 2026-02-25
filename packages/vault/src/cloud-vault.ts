import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encrypted envelope containing a data key encrypted by the master key,
 * and the data encrypted by the data key.
 */
export interface EncryptedEnvelope {
  version: number;
  /** Encrypted data key (base64) */
  encryptedDataKey: string;
  /** IV for data key encryption (base64) */
  dataKeyIv: string;
  /** Auth tag for data key encryption (base64) */
  dataKeyTag: string;
  /** Encrypted payload (base64) */
  encryptedPayload: string;
  /** IV for payload encryption (base64) */
  payloadIv: string;
  /** Auth tag for payload encryption (base64) */
  payloadTag: string;
}

function encryptAes256Gcm(plaintext: Buffer, key: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

function decryptAes256Gcm(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * CloudVault provides client-side AES-256-GCM encryption with envelope encryption.
 * All data is encrypted before leaving the client, so the server never sees plaintext.
 */
export class CloudVault {
  /**
   * Encrypt data using envelope encryption.
   * Generates a random data key, encrypts the payload with it,
   * then encrypts the data key with the master key.
   */
  static encrypt(plaintext: Buffer, masterKey: Buffer): EncryptedEnvelope {
    // Generate a random data key
    const dataKey = crypto.randomBytes(KEY_LENGTH);

    // Encrypt the payload with the data key
    const payload = encryptAes256Gcm(plaintext, dataKey);

    // Encrypt the data key with the master key
    const wrappedKey = encryptAes256Gcm(dataKey, masterKey);

    // Zero the data key
    dataKey.fill(0);

    return {
      version: 1,
      encryptedDataKey: wrappedKey.ciphertext.toString('base64'),
      dataKeyIv: wrappedKey.iv.toString('base64'),
      dataKeyTag: wrappedKey.tag.toString('base64'),
      encryptedPayload: payload.ciphertext.toString('base64'),
      payloadIv: payload.iv.toString('base64'),
      payloadTag: payload.tag.toString('base64'),
    };
  }

  /**
   * Decrypt an envelope-encrypted payload.
   */
  static decrypt(envelope: EncryptedEnvelope, masterKey: Buffer): Buffer {
    // Unwrap the data key
    const dataKey = decryptAes256Gcm(
      Buffer.from(envelope.encryptedDataKey, 'base64'),
      masterKey,
      Buffer.from(envelope.dataKeyIv, 'base64'),
      Buffer.from(envelope.dataKeyTag, 'base64'),
    );

    // Decrypt the payload
    const plaintext = decryptAes256Gcm(
      Buffer.from(envelope.encryptedPayload, 'base64'),
      dataKey,
      Buffer.from(envelope.payloadIv, 'base64'),
      Buffer.from(envelope.payloadTag, 'base64'),
    );

    // Zero the data key
    dataKey.fill(0);

    return plaintext;
  }

  /**
   * Re-encrypt an envelope with a new master key (for key rotation).
   * The data key is unwrapped with the old key and re-wrapped with the new key.
   * The payload itself is not re-encrypted (only the key envelope changes).
   */
  static reEncrypt(envelope: EncryptedEnvelope, oldMasterKey: Buffer, newMasterKey: Buffer): EncryptedEnvelope {
    // Unwrap data key with old master key
    const dataKey = decryptAes256Gcm(
      Buffer.from(envelope.encryptedDataKey, 'base64'),
      oldMasterKey,
      Buffer.from(envelope.dataKeyIv, 'base64'),
      Buffer.from(envelope.dataKeyTag, 'base64'),
    );

    // Re-wrap data key with new master key
    const wrappedKey = encryptAes256Gcm(dataKey, newMasterKey);

    // Zero the data key
    dataKey.fill(0);

    return {
      ...envelope,
      encryptedDataKey: wrappedKey.ciphertext.toString('base64'),
      dataKeyIv: wrappedKey.iv.toString('base64'),
      dataKeyTag: wrappedKey.tag.toString('base64'),
    };
  }
}
