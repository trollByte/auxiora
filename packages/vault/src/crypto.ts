import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { zeroBuffer } from '@auxiora/core';

const ARGON2_MEMORY_COST = 65536; // 64MB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const key = await argon2.hash(password, {
    type: argon2.argon2id,
    salt,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: KEY_LENGTH,
    raw: true,
  });
  return key;
}

export function generateSalt(): Buffer {
  return crypto.randomBytes(32);
}

export function generateIv(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

export interface EncryptedData {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

export function encrypt(plaintext: Buffer, key: Buffer): EncryptedData {
  const iv = generateIv();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { iv, ciphertext, tag };
}

export function decrypt(encryptedData: EncryptedData, key: Buffer): Buffer {
  const { iv, ciphertext, tag } = encryptedData;

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext;
}

export { zeroBuffer };
