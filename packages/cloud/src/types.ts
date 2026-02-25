/** Tenant plan tiers */
export type TenantPlan = 'free' | 'pro' | 'team' | 'enterprise';

/** Tenant status */
export type TenantStatus = 'active' | 'suspended' | 'pending' | 'deleted';

/** A cloud tenant */
export interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: TenantPlan;
  status: TenantStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  dataDir: string;
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
  suspendReason?: string;
}

/** Quota limits for a given plan */
export interface TenantQuotas {
  maxMessages: number;
  maxSessions: number;
  maxStorageMb: number;
  maxPlugins: number;
  maxBehaviors: number;
  maxChannels: number;
  maxAgents: number;
}

/** A single usage record */
export interface UsageRecord {
  tenantId: string;
  metric: string;
  value: number;
  timestamp: string;
}

/** Billing information */
export interface BillingInfo {
  tenantId: string;
  plan: TenantPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  paymentMethodLast4?: string;
  paymentMethodBrand?: string;
}

/** Cloud-specific configuration */
export interface CloudConfig {
  enabled: boolean;
  baseDataDir: string;
  jwtSecret: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  domain: string;
}

/** Plan definition with pricing */
export interface PlanDefinition {
  plan: TenantPlan;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  quotas: TenantQuotas;
  features: string[];
}

/** Stripe SDK interface for dependency injection */
export interface StripeClient {
  createCustomer(email: string, name: string): Promise<{ id: string }>;
  createSubscription(customerId: string, priceId: string): Promise<{ id: string; status: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getInvoices(customerId: string): Promise<Array<{
    id: string;
    amount: number;
    status: string;
    created: string;
  }>>;
  createPaymentIntent(customerId: string, amount: number): Promise<{ clientSecret: string }>;
}

/** Quota exceeded error */
export class QuotaExceededError extends Error {
  constructor(
    public readonly metric: string,
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(`Quota exceeded for ${metric}: ${current}/${limit}`);
    this.name = 'QuotaExceededError';
  }
}

/** Tenant not found error */
export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

/** Tenant suspended error */
export class TenantSuspendedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant is suspended: ${tenantId}`);
    this.name = 'TenantSuspendedError';
  }
}
