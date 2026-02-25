import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TenantManager } from '../src/tenant.js';
import { TenantIsolation } from '../src/isolation.js';
import { TenantNotFoundError, TenantSuspendedError } from '../src/types.js';
import type { CloudConfig } from '../src/types.js';

function makeConfig(baseDataDir: string): CloudConfig {
  return {
    enabled: true,
    baseDataDir,
    jwtSecret: 'test-secret-32-chars-long-enough!',
    domain: 'test.auxiora.cloud',
  };
}

describe('TenantIsolation', () => {
  let tenantManager: TenantManager;
  let isolation: TenantIsolation;
  let tmpDir: string;
  let config: CloudConfig;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-isolation-'));
    config = makeConfig(tmpDir);
    tenantManager = new TenantManager({ config });
    isolation = new TenantIsolation({ tenantManager, config });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('extractTenant', () => {
    it('should extract tenant from JWT payload with tenantId', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const context = await isolation.extractTenant({ tenantId: tenant.id });
      expect(context.tenantId).toBe(tenant.id);
      expect(context.tenant.email).toBe('alice@test.com');
    });

    it('should extract tenant from JWT payload with sub', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const context = await isolation.extractTenant({ sub: tenant.id });
      expect(context.tenantId).toBe(tenant.id);
    });

    it('should throw for missing tenant ID', async () => {
      await expect(isolation.extractTenant({})).rejects.toThrow(TenantNotFoundError);
    });

    it('should throw for suspended tenant', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      await tenantManager.suspend(tenant.id, 'overdue');
      await expect(isolation.extractTenant({ tenantId: tenant.id })).rejects.toThrow(TenantSuspendedError);
    });

    it('should throw for deleted tenant', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      await tenantManager.delete(tenant.id);
      await expect(isolation.extractTenant({ tenantId: tenant.id })).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('scopePath', () => {
    it('should resolve paths within tenant dir', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const scoped = isolation.scopePath(tenant, 'config/settings.json');
      expect(scoped).toContain(tenant.id);
      expect(scoped).toContain('config/settings.json');
    });

    it('should block path traversal', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      expect(() => isolation.scopePath(tenant, '../../etc/passwd')).toThrow('Path traversal');
    });
  });

  describe('validateAccess', () => {
    it('should allow access to own resources', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const context = await isolation.extractTenant({ tenantId: tenant.id });
      expect(isolation.validateAccess(context, tenant.id)).toBe(true);
    });

    it('should deny access to other tenant resources', async () => {
      const alice = await tenantManager.create('alice@test.com', 'Alice');
      const bob = await tenantManager.create('bob@test.com', 'Bob');
      const context = await isolation.extractTenant({ tenantId: alice.id });
      expect(isolation.validateAccess(context, bob.id)).toBe(false);
    });
  });
});
