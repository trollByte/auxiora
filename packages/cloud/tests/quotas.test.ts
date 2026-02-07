import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TenantManager } from '../src/tenant.js';
import { QuotaEnforcer } from '../src/quotas.js';
import { QuotaExceededError } from '../src/types.js';
import type { CloudConfig } from '../src/types.js';

function makeConfig(baseDataDir: string): CloudConfig {
  return {
    enabled: true,
    baseDataDir,
    jwtSecret: 'test-secret-32-chars-long-enough!',
    domain: 'test.auxiora.cloud',
  };
}

describe('QuotaEnforcer', () => {
  let tenantManager: TenantManager;
  let enforcer: QuotaEnforcer;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-quota-'));
    tenantManager = new TenantManager({ config: makeConfig(tmpDir) });
    enforcer = new QuotaEnforcer({ tenantManager });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('check', () => {
    it('should pass when under quota', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice', 'free');
      await expect(enforcer.check(tenant.id, 'maxMessages')).resolves.toBeUndefined();
    });

    it('should throw QuotaExceededError when over limit', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice', 'free');
      // Free plan: 100 messages
      for (let i = 0; i < 100; i++) {
        enforcer.record(tenant.id, 'maxMessages');
      }
      await expect(enforcer.check(tenant.id, 'maxMessages')).rejects.toThrow(QuotaExceededError);
    });

    it('should not throw for enterprise (unlimited)', async () => {
      const tenant = await tenantManager.create('corp@test.com', 'Corp', 'enterprise');
      for (let i = 0; i < 10000; i++) {
        enforcer.record(tenant.id, 'maxMessages');
      }
      await expect(enforcer.check(tenant.id, 'maxMessages')).resolves.toBeUndefined();
    });
  });

  describe('record', () => {
    it('should track usage', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      enforcer.record(tenant.id, 'maxMessages');
      enforcer.record(tenant.id, 'maxMessages');
      expect(enforcer.getUsage(tenant.id, 'maxMessages')).toBe(2);
    });

    it('should return usage record', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const record = enforcer.record(tenant.id, 'maxSessions', 3);
      expect(record.tenantId).toBe(tenant.id);
      expect(record.metric).toBe('maxSessions');
      expect(record.value).toBe(3);
    });
  });

  describe('getAllUsage', () => {
    it('should return all metrics', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      enforcer.record(tenant.id, 'maxMessages', 10);
      enforcer.record(tenant.id, 'maxSessions', 2);
      const usage = enforcer.getAllUsage(tenant.id);
      expect(usage.maxMessages).toBe(10);
      expect(usage.maxSessions).toBe(2);
    });

    it('should return empty for unknown tenant', () => {
      const usage = enforcer.getAllUsage('nonexistent');
      expect(usage).toEqual({});
    });
  });

  describe('resetUsage', () => {
    it('should reset all usage for a tenant', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      enforcer.record(tenant.id, 'maxMessages', 50);
      enforcer.resetUsage(tenant.id);
      expect(enforcer.getUsage(tenant.id, 'maxMessages')).toBe(0);
    });
  });

  describe('getUsagePercentage', () => {
    it('should calculate percentage', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice', 'free');
      enforcer.record(tenant.id, 'maxMessages', 50);
      const pct = await enforcer.getUsagePercentage(tenant.id, 'maxMessages');
      expect(pct).toBe(50);
    });

    it('should return 0 for enterprise (unlimited)', async () => {
      const tenant = await tenantManager.create('corp@test.com', 'Corp', 'enterprise');
      enforcer.record(tenant.id, 'maxMessages', 999);
      const pct = await enforcer.getUsagePercentage(tenant.id, 'maxMessages');
      expect(pct).toBe(0);
    });
  });
});
