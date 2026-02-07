import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { CloudVault } from '../src/cloud-vault.js';

describe('CloudVault', () => {
  const masterKey = crypto.randomBytes(32);

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt data', () => {
      const plaintext = Buffer.from('Hello, cloud vault!');
      const envelope = CloudVault.encrypt(plaintext, masterKey);

      expect(envelope.version).toBe(1);
      expect(envelope.encryptedDataKey).toBeDefined();
      expect(envelope.encryptedPayload).toBeDefined();

      const decrypted = CloudVault.decrypt(envelope, masterKey);
      expect(decrypted.toString()).toBe('Hello, cloud vault!');
    });

    it('should fail with wrong master key', () => {
      const plaintext = Buffer.from('secret data');
      const envelope = CloudVault.encrypt(plaintext, masterKey);

      const wrongKey = crypto.randomBytes(32);
      expect(() => CloudVault.decrypt(envelope, wrongKey)).toThrow();
    });

    it('should handle empty data', () => {
      const plaintext = Buffer.from('');
      const envelope = CloudVault.encrypt(plaintext, masterKey);
      const decrypted = CloudVault.decrypt(envelope, masterKey);
      expect(decrypted.toString()).toBe('');
    });

    it('should handle large data', () => {
      const plaintext = crypto.randomBytes(1024 * 1024); // 1MB
      const envelope = CloudVault.encrypt(plaintext, masterKey);
      const decrypted = CloudVault.decrypt(envelope, masterKey);
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = Buffer.from('same data');
      const e1 = CloudVault.encrypt(plaintext, masterKey);
      const e2 = CloudVault.encrypt(plaintext, masterKey);
      expect(e1.encryptedPayload).not.toBe(e2.encryptedPayload);
    });
  });

  describe('reEncrypt', () => {
    it('should re-encrypt with a new master key', () => {
      const plaintext = Buffer.from('data to rotate');
      const envelope = CloudVault.encrypt(plaintext, masterKey);

      const newMasterKey = crypto.randomBytes(32);
      const rotated = CloudVault.reEncrypt(envelope, masterKey, newMasterKey);

      // Old key should no longer work
      expect(() => CloudVault.decrypt(rotated, masterKey)).toThrow();

      // New key should work
      const decrypted = CloudVault.decrypt(rotated, newMasterKey);
      expect(decrypted.toString()).toBe('data to rotate');
    });

    it('should preserve the payload ciphertext during rotation', () => {
      const plaintext = Buffer.from('preserved payload');
      const envelope = CloudVault.encrypt(plaintext, masterKey);

      const newMasterKey = crypto.randomBytes(32);
      const rotated = CloudVault.reEncrypt(envelope, masterKey, newMasterKey);

      // Payload should be the same (only key envelope changed)
      expect(rotated.encryptedPayload).toBe(envelope.encryptedPayload);
      expect(rotated.payloadIv).toBe(envelope.payloadIv);
      expect(rotated.payloadTag).toBe(envelope.payloadTag);
    });
  });
});
