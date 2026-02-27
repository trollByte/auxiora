import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Vault } from '../src/vault.js';
import { SealManager } from '../src/seal.js';
import type { SealFile } from '../src/seal.js';

let testDir: string;
let testVaultPath: string;
let testSealPath: string;

describe('SealManager', () => {
  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'auxiora-seal-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    testVaultPath = path.join(testDir, 'vault.enc');
    testSealPath = path.join(testDir, 'seal.enc');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should seal and auto-unseal round-trip', async () => {
    // Create and populate vault
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('my-secure-password');
    await vault.add('SECRET', 'hello-world');
    vault.lock();

    // Seal the vault password (no PIN)
    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('my-secure-password');

    expect(await seal.isSealed()).toBe(true);

    // Auto-unseal into a fresh vault instance
    const vault2 = new Vault({ path: testVaultPath });
    const result = await seal.autoUnseal(vault2);

    expect(result).toBe(true);
    expect(vault2.get('SECRET')).toBe('hello-world');
    vault2.lock();
  });

  it('should seal and auto-unseal with PIN', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('my-password');
    await vault.add('KEY', 'value');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('my-password', '1234');

    expect(await seal.needsPin()).toBe(true);

    const vault2 = new Vault({ path: testVaultPath });
    const result = await seal.autoUnseal(vault2, '1234');

    expect(result).toBe(true);
    expect(vault2.get('KEY')).toBe('value');
    vault2.lock();
  });

  it('should work without PIN (pin-less mode)', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('password123');

    expect(await seal.needsPin()).toBe(false);

    const vault2 = new Vault({ path: testVaultPath });
    const result = await seal.autoUnseal(vault2);

    expect(result).toBe(true);
    vault2.lock();
  });

  it('should fail auto-unseal with wrong PIN', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('password123', 'correct-pin');

    const vault2 = new Vault({ path: testVaultPath });
    const result = await seal.autoUnseal(vault2, 'wrong-pin');

    expect(result).toBe(false);
  });

  it('should fail auto-unseal on different machine', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('password123');

    // Tamper with fingerprint hash to simulate different machine
    const content = JSON.parse(await fs.readFile(testSealPath, 'utf-8')) as SealFile;
    content.fingerprintHash = 'deadbeef'.repeat(8);
    await fs.writeFile(testSealPath, JSON.stringify(content), 'utf-8');

    const vault2 = new Vault({ path: testVaultPath });
    const result = await seal.autoUnseal(vault2);

    expect(result).toBe(false);
  });

  it('should report correct isSealed state', async () => {
    const seal = new SealManager({ vaultPath: testVaultPath });

    expect(await seal.isSealed()).toBe(false);

    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    await seal.seal('password123');
    expect(await seal.isSealed()).toBe(true);
  });

  it('should remove seal file on unseal', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('password123');
    expect(await seal.isSealed()).toBe(true);

    await seal.unseal();
    expect(await seal.isSealed()).toBe(false);

    // Verify file is actually gone
    const exists = await fs.access(testSealPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('should write seal file with correct format', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('password123', 'mypin');

    const content = JSON.parse(await fs.readFile(testSealPath, 'utf-8')) as SealFile;

    expect(content.version).toBe(1);
    expect(content.pinRequired).toBe(true);
    expect(content.fingerprintHash).toMatch(/^[0-9a-f]{64}$/);
    expect(content.iv).toBeTruthy();
    expect(content.data).toBeTruthy();
    expect(content.tag).toBeTruthy();
    expect(content.salt).toBeTruthy();

    // Verify base64 fields decode properly
    expect(() => Buffer.from(content.iv, 'base64')).not.toThrow();
    expect(() => Buffer.from(content.data, 'base64')).not.toThrow();
    expect(() => Buffer.from(content.tag, 'base64')).not.toThrow();
    expect(() => Buffer.from(content.salt, 'base64')).not.toThrow();
  });

  it('should fail auto-unseal when PIN required but not provided', async () => {
    const vault = new Vault({ path: testVaultPath });
    await vault.unlock('password123');
    vault.lock();

    const seal = new SealManager({ vaultPath: testVaultPath });
    await seal.seal('password123', 'mypin');

    const vault2 = new Vault({ path: testVaultPath });
    // No PIN provided but seal requires one
    const result = await seal.autoUnseal(vault2);

    expect(result).toBe(false);
  });

  it('should return false for auto-unseal when no seal exists', async () => {
    const vault = new Vault({ path: testVaultPath });
    const seal = new SealManager({ vaultPath: testVaultPath });

    const result = await seal.autoUnseal(vault);
    expect(result).toBe(false);
  });

  it('should handle unseal when no seal file exists', async () => {
    const seal = new SealManager({ vaultPath: testVaultPath });
    // Should not throw
    await seal.unseal();
    expect(await seal.isSealed()).toBe(false);
  });
});
