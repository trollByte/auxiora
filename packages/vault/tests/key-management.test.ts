import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { KeyManager } from '../src/key-management.js';

describe('KeyManager', () => {
  describe('deriveKey', () => {
    it('should derive a 32-byte key from a password', async () => {
      const { key, salt } = await KeyManager.deriveKey('my-password');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
      expect(salt.length).toBe(32);
    });

    it('should produce the same key with the same salt', async () => {
      const { key: key1, salt } = await KeyManager.deriveKey('my-password');
      const { key: key2 } = await KeyManager.deriveKey('my-password', salt);
      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys for different passwords', async () => {
      const salt = crypto.randomBytes(32);
      const { key: key1 } = await KeyManager.deriveKey('password-1', salt);
      const { key: key2 } = await KeyManager.deriveKey('password-2', salt);
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('generateKey', () => {
    it('should generate a random 32-byte key', () => {
      const key = KeyManager.generateKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should produce unique keys', () => {
      const k1 = KeyManager.generateKey();
      const k2 = KeyManager.generateKey();
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe('rotateKey', () => {
    it('should produce old and new keys', async () => {
      const { salt: oldSalt } = await KeyManager.deriveKey('old-password');
      const { oldKey, newKey, newSalt } = await KeyManager.rotateKey('old-password', oldSalt, 'new-password');

      expect(oldKey.length).toBe(32);
      expect(newKey.length).toBe(32);
      expect(newSalt.length).toBe(32);
      expect(oldKey.equals(newKey)).toBe(false);
    });
  });

  describe('exportKeyMetadata / verifyPassword', () => {
    it('should export and verify a password', async () => {
      const { key, salt } = await KeyManager.deriveKey('test-password');
      const exported = KeyManager.exportKeyMetadata(salt, key);

      expect(exported.version).toBe(1);
      expect(exported.salt).toBeDefined();
      expect(exported.keyHash).toBeDefined();

      const { valid, key: verifiedKey } = await KeyManager.verifyPassword('test-password', exported);
      expect(valid).toBe(true);
      expect(verifiedKey.length).toBe(32);
    });

    it('should reject wrong password', async () => {
      const { key, salt } = await KeyManager.deriveKey('correct-password');
      const exported = KeyManager.exportKeyMetadata(salt, key);

      const { valid } = await KeyManager.verifyPassword('wrong-password', exported);
      expect(valid).toBe(false);
    });
  });
});
