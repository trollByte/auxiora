import type { TenantQuotas, UsageRecord } from './types.js';
import { QuotaExceededError } from './types.js';
import { getPlanQuotas } from './plans.js';
import type { TenantManager } from './tenant.js';

export interface QuotaEnforcerOptions {
  tenantManager: TenantManager;
}

/**
 * QuotaEnforcer tracks usage against plan limits
 * and throws QuotaExceededError when limits are breached.
 */
export class QuotaEnforcer {
  private usage = new Map<string, Map<string, number>>();
  private tenantManager: TenantManager;

  constructor(options: QuotaEnforcerOptions) {
    this.tenantManager = options.tenantManager;
  }

  /**
   * Check whether a metric increment would exceed the quota.
   * Throws QuotaExceededError if the limit would be breached.
   */
  async check(tenantId: string, metric: keyof TenantQuotas, increment = 1): Promise<void> {
    const tenant = await this.tenantManager.get(tenantId);
    const quotas = getPlanQuotas(tenant.plan);
    const limit = quotas[metric];

    // -1 means unlimited
    if (limit === -1) return;

    const current = this.getUsage(tenantId, metric);
    if (current + increment > limit) {
      throw new QuotaExceededError(metric, limit, current + increment);
    }
  }

  /**
   * Record usage for a metric.
   */
  record(tenantId: string, metric: string, value = 1): UsageRecord {
    let tenantUsage = this.usage.get(tenantId);
    if (!tenantUsage) {
      tenantUsage = new Map();
      this.usage.set(tenantId, tenantUsage);
    }

    const current = tenantUsage.get(metric) ?? 0;
    tenantUsage.set(metric, current + value);

    return {
      tenantId,
      metric,
      value: current + value,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get current usage for a specific metric.
   */
  getUsage(tenantId: string, metric: string): number {
    return this.usage.get(tenantId)?.get(metric) ?? 0;
  }

  /**
   * Get all usage for a tenant.
   */
  getAllUsage(tenantId: string): Record<string, number> {
    const tenantUsage = this.usage.get(tenantId);
    if (!tenantUsage) return {};

    const result: Record<string, number> = {};
    for (const [metric, value] of tenantUsage) {
      result[metric] = value;
    }
    return result;
  }

  /**
   * Reset usage for a tenant (e.g., at billing period start).
   */
  resetUsage(tenantId: string): void {
    this.usage.delete(tenantId);
  }

  /**
   * Get usage as a percentage of the quota limit.
   */
  async getUsagePercentage(tenantId: string, metric: keyof TenantQuotas): Promise<number> {
    const tenant = await this.tenantManager.get(tenantId);
    const quotas = getPlanQuotas(tenant.plan);
    const limit = quotas[metric];

    if (limit === -1) return 0;
    if (limit === 0) return 100;

    const current = this.getUsage(tenantId, metric);
    return Math.round((current / limit) * 100);
  }
}
