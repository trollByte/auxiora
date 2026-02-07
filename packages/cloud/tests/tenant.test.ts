import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TenantManager } from '../src/tenant.js';
import { TenantNotFoundError } from '../src/types.js';
import type { CloudConfig } from '../src/types.js';

function makeConfig(baseDataDir: string): CloudConfig {
  return {
    enabled: true,
    baseDataDir,
    jwtSecret: 'test-secret-32-chars-long-enough!',
    domain: 'test.auxiora.cloud',
  };
}

describe('TenantManager', () => {
  let manager: TenantManager;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-tenant-'));
    manager = new TenantManager({ config: makeConfig(tmpDir) });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a tenant with defaults', async () => {
      const tenant = await manager.create('alice@test.com', 'Alice');
      expect(tenant.id).toMatch(/^tenant-/);
      expect(tenant.email).toBe('alice@test.com');
      expect(tenant.name).toBe('Alice');
      expect(tenant.plan).toBe('free');
      expect(tenant.status).toBe('active');
      expect(tenant.dataDir).toContain(tenant.id);
    });

    it('should create a tenant with a specific plan', async () => {
      const tenant = await manager.create('bob@test.com', 'Bob', 'pro');
      expect(tenant.plan).toBe('pro');
    });

    it('should persist tenant to disk', async () => {
      const tenant = await manager.create('charlie@test.com', 'Charlie');
      const tenantFile = path.join(tenant.dataDir, 'tenant.json');
      const content = await fs.readFile(tenantFile, 'utf-8');
      const persisted = JSON.parse(content);
      expect(persisted.email).toBe('charlie@test.com');
    });
  });

  describe('get', () => {
    it('should return an existing tenant', async () => {
      const created = await manager.create('alice@test.com', 'Alice');
      const found = await manager.get(created.id);
      expect(found.email).toBe('alice@test.com');
    });

    it('should throw TenantNotFoundError for unknown id', async () => {
      await expect(manager.get('nonexistent')).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('getByEmail', () => {
    it('should find a tenant by email', async () => {
      await manager.create('alice@test.com', 'Alice');
      const found = await manager.getByEmail('alice@test.com');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Alice');
    });

    it('should return null for unknown email', async () => {
      const found = await manager.getByEmail('nobody@test.com');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update tenant fields', async () => {
      const tenant = await manager.create('alice@test.com', 'Alice');
      const updated = await manager.update(tenant.id, { name: 'Alice Smith', plan: 'pro' });
      expect(updated.name).toBe('Alice Smith');
      expect(updated.plan).toBe('pro');
    });
  });

  describe('suspend / reactivate', () => {
    it('should suspend and reactivate a tenant', async () => {
      const tenant = await manager.create('alice@test.com', 'Alice');

      const suspended = await manager.suspend(tenant.id, 'Payment failed');
      expect(suspended.status).toBe('suspended');
      expect(suspended.suspendReason).toBe('Payment failed');

      const reactivated = await manager.reactivate(tenant.id);
      expect(reactivated.status).toBe('active');
      expect(reactivated.suspendedAt).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should mark tenant as deleted', async () => {
      const tenant = await manager.create('alice@test.com', 'Alice');
      const result = await manager.delete(tenant.id);
      expect(result).toBe(true);

      const list = await manager.list();
      expect(list).toHaveLength(0);
    });

    it('should return false for unknown tenant', async () => {
      const result = await manager.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('should list active tenants', async () => {
      await manager.create('alice@test.com', 'Alice');
      await manager.create('bob@test.com', 'Bob');
      const list = await manager.list();
      expect(list).toHaveLength(2);
    });

    it('should exclude deleted tenants', async () => {
      const a = await manager.create('alice@test.com', 'Alice');
      await manager.create('bob@test.com', 'Bob');
      await manager.delete(a.id);
      const list = await manager.list();
      expect(list).toHaveLength(1);
    });
  });

  describe('loadFromDisk', () => {
    it('should reload tenants from disk', async () => {
      const tenant = await manager.create('alice@test.com', 'Alice');

      // Create new manager and load
      const manager2 = new TenantManager({ config: makeConfig(tmpDir) });
      await manager2.loadFromDisk();
      const found = await manager2.get(tenant.id);
      expect(found.email).toBe('alice@test.com');
    });
  });
});
