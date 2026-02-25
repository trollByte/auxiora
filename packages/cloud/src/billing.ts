import type { BillingInfo, StripeClient, TenantPlan } from './types.js';
import type { TenantManager } from './tenant.js';
import { getPlanDefinition } from './plans.js';

export interface BillingManagerOptions {
  tenantManager: TenantManager;
  stripe?: StripeClient;
}

/**
 * BillingManager handles Stripe integration for subscription management.
 * Uses dependency injection for the Stripe SDK to enable easy testing.
 */
export class BillingManager {
  private tenantManager: TenantManager;
  private stripe?: StripeClient;

  constructor(options: BillingManagerOptions) {
    this.tenantManager = options.tenantManager;
    this.stripe = options.stripe;
  }

  /**
   * Create a Stripe customer for a tenant.
   */
  async createCustomer(tenantId: string): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    const tenant = await this.tenantManager.get(tenantId);
    const customer = await this.stripe.createCustomer(tenant.email, tenant.name);

    await this.tenantManager.update(tenantId, {} as any);
    // Store stripeCustomerId directly
    const updated = await this.tenantManager.get(tenantId);
    (updated as any).stripeCustomerId = customer.id;

    return customer.id;
  }

  /**
   * Create a subscription for a tenant.
   */
  async createSubscription(tenantId: string, plan: TenantPlan): Promise<{ subscriptionId: string; status: string }> {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    const tenant = await this.tenantManager.get(tenantId);
    if (!tenant.stripeCustomerId) {
      throw new Error('No Stripe customer ID. Call createCustomer first.');
    }

    const planDef = getPlanDefinition(plan);
    const priceId = `price_${plan}_monthly`;

    const subscription = await this.stripe.createSubscription(tenant.stripeCustomerId, priceId);

    // Update tenant plan
    await this.tenantManager.update(tenantId, { plan });

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
    };
  }

  /**
   * Cancel a tenant's subscription.
   */
  async cancelSubscription(tenantId: string): Promise<void> {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    const tenant = await this.tenantManager.get(tenantId);
    if (!tenant.stripeSubscriptionId) {
      throw new Error('No active subscription');
    }

    await this.stripe.cancelSubscription(tenant.stripeSubscriptionId);
    await this.tenantManager.update(tenantId, { plan: 'free' });
  }

  /**
   * Get billing info for a tenant.
   */
  async getBillingInfo(tenantId: string): Promise<BillingInfo> {
    const tenant = await this.tenantManager.get(tenantId);

    return {
      tenantId,
      plan: tenant.plan,
      stripeCustomerId: tenant.stripeCustomerId,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
    };
  }

  /**
   * Get invoices for a tenant.
   */
  async getInvoices(tenantId: string): Promise<Array<{ id: string; amount: number; status: string; created: string }>> {
    if (!this.stripe) {
      return [];
    }

    const tenant = await this.tenantManager.get(tenantId);
    if (!tenant.stripeCustomerId) {
      return [];
    }

    return this.stripe.getInvoices(tenant.stripeCustomerId);
  }

  /**
   * Handle a Stripe webhook event.
   */
  async handleWebhookEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'customer.subscription.deleted': {
        const customerId = data.customer as string;
        // Find tenant by customer ID and downgrade
        const tenants = await this.tenantManager.list();
        const tenant = tenants.find(t => t.stripeCustomerId === customerId);
        if (tenant) {
          await this.tenantManager.update(tenant.id, { plan: 'free' });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const customerId = data.customer as string;
        const tenants = await this.tenantManager.list();
        const tenant = tenants.find(t => t.stripeCustomerId === customerId);
        if (tenant) {
          await this.tenantManager.suspend(tenant.id, 'Payment failed');
        }
        break;
      }
    }
  }
}
