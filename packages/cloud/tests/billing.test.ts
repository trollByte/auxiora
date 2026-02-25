import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TenantManager } from '../src/tenant.js';
import { BillingManager } from '../src/billing.js';
import type { CloudConfig, StripeClient } from '../src/types.js';

function makeConfig(baseDataDir: string): CloudConfig {
  return {
    enabled: true,
    baseDataDir,
    jwtSecret: 'test-secret-32-chars-long-enough!',
    domain: 'test.auxiora.cloud',
  };
}

function createMockStripe(): StripeClient {
  return {
    createCustomer: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
    createSubscription: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
    cancelSubscription: vi.fn().mockResolvedValue(undefined),
    getInvoices: vi.fn().mockResolvedValue([
      { id: 'inv_1', amount: 1900, status: 'paid', created: '2025-01-01T00:00:00Z' },
    ]),
    createPaymentIntent: vi.fn().mockResolvedValue({ clientSecret: 'pi_secret' }),
  };
}

describe('BillingManager', () => {
  let tenantManager: TenantManager;
  let billing: BillingManager;
  let mockStripe: StripeClient;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-billing-'));
    tenantManager = new TenantManager({ config: makeConfig(tmpDir) });
    mockStripe = createMockStripe();
    billing = new BillingManager({ tenantManager, stripe: mockStripe });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('createCustomer', () => {
    it('should create a Stripe customer', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const customerId = await billing.createCustomer(tenant.id);
      expect(customerId).toBe('cus_test123');
      expect(mockStripe.createCustomer).toHaveBeenCalledWith('alice@test.com', 'Alice');
    });

    it('should throw if Stripe not configured', async () => {
      const billingNoStripe = new BillingManager({ tenantManager });
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      await expect(billingNoStripe.createCustomer(tenant.id)).rejects.toThrow('Stripe not configured');
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      // Manually set stripeCustomerId
      (tenant as any).stripeCustomerId = 'cus_test123';

      const result = await billing.createSubscription(tenant.id, 'pro');
      expect(result.subscriptionId).toBe('sub_test123');
      expect(result.status).toBe('active');
    });

    it('should throw without customer ID', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      await expect(billing.createSubscription(tenant.id, 'pro')).rejects.toThrow('No Stripe customer ID');
    });
  });

  describe('getBillingInfo', () => {
    it('should return billing info', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice', 'pro');
      const info = await billing.getBillingInfo(tenant.id);
      expect(info.tenantId).toBe(tenant.id);
      expect(info.plan).toBe('pro');
    });
  });

  describe('getInvoices', () => {
    it('should return invoices from Stripe', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      (tenant as any).stripeCustomerId = 'cus_test123';

      const invoices = await billing.getInvoices(tenant.id);
      expect(invoices).toHaveLength(1);
      expect(invoices[0].id).toBe('inv_1');
    });

    it('should return empty for tenant without customer', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice');
      const invoices = await billing.getInvoices(tenant.id);
      expect(invoices).toHaveLength(0);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should downgrade on subscription deleted', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice', 'pro');
      (tenant as any).stripeCustomerId = 'cus_alice';

      await billing.handleWebhookEvent('customer.subscription.deleted', { customer: 'cus_alice' });

      const updated = await tenantManager.get(tenant.id);
      expect(updated.plan).toBe('free');
    });

    it('should suspend on payment failed', async () => {
      const tenant = await tenantManager.create('alice@test.com', 'Alice', 'pro');
      (tenant as any).stripeCustomerId = 'cus_alice';

      await billing.handleWebhookEvent('invoice.payment_failed', { customer: 'cus_alice' });

      const updated = await tenantManager.get(tenant.id);
      expect(updated.status).toBe('suspended');
    });
  });
});
