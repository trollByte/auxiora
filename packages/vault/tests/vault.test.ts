import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Vault, VaultError } from '../src/vault.js';

// Create unique test dir for each test run
let testDir: string;
let testVaultPath: string;

describe('Vault', () => {
  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'auxiora-vault-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    testVaultPath = path.join(testDir, 'vault.enc');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('unlock', () => {
    it('should create a new vault if none exists', async () => {
      const vault = new Vault({ path: testVaultPath });
      await vault.unlock('test-password');

      expect(vault.list()).toEqual([]);

      const exists = await fs.access(testVaultPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      vault.lock();
    });

    it('should unlock an existing vault with correct password', async () => {
      // Create vault
      const vault1 = new Vault({ path: testVaultPath });
      await vault1.unlock('test-password');
      await vault1.add('TEST_KEY', 'test-value');
      vault1.lock();

      // Reopen vault
      const vault2 = new Vault({ path: testVaultPath });
      await vault2.unlock('test-password');

      expect(vault2.get('TEST_KEY')).toBe('test-value');
      vault2.lock();
    });

    it('should fail with wrong password', async () => {
      // Create vault
      const vault1 = new Vault({ path: testVaultPath });
      await vault1.unlock('correct-password');
      await vault1.add('TEST_KEY', 'test-value');
      vault1.lock();

      // Try wrong password
      const vault2 = new Vault({ path: testVaultPath });
      await expect(vault2.unlock('wrong-password')).rejects.toThrow(VaultError);
    });
  });

  describe('credentials', () => {
    let vault: Vault;

    beforeEach(async () => {
      vault = new Vault({ path: testVaultPath });
      await vault.unlock('test-password');
    });

    afterEach(() => {
      vault.lock();
    });

    it('should add and retrieve credentials', async () => {
      await vault.add('API_KEY', 'secret-value');
      expect(vault.get('API_KEY')).toBe('secret-value');
    });

    it('should list credential names', async () => {
      await vault.add('KEY1', 'value1');
      await vault.add('KEY2', 'value2');

      const names = vault.list();
      expect(names).toContain('KEY1');
      expect(names).toContain('KEY2');
      expect(names).toHaveLength(2);
    });

    it('should remove credentials', async () => {
      await vault.add('TO_DELETE', 'value');
      expect(vault.has('TO_DELETE')).toBe(true);

      const removed = await vault.remove('TO_DELETE');
      expect(removed).toBe(true);
      expect(vault.has('TO_DELETE')).toBe(false);
    });

    it('should return false when removing non-existent credential', async () => {
      const removed = await vault.remove('NON_EXISTENT');
      expect(removed).toBe(false);
    });

    it('should persist credentials across sessions', async () => {
      await vault.add('PERSISTENT', 'persisted-value');
      vault.lock();

      const vault2 = new Vault({ path: testVaultPath });
      await vault2.unlock('test-password');
      expect(vault2.get('PERSISTENT')).toBe('persisted-value');
      vault2.lock();
    });
  });

  describe('lock', () => {
    it('should clear data on lock', async () => {
      const vault = new Vault({ path: testVaultPath });
      await vault.unlock('test-password');
      await vault.add('KEY', 'value');

      vault.lock();

      expect(() => vault.list()).toThrow(VaultError);
      expect(() => vault.get('KEY')).toThrow(VaultError);
    });
  });
});
