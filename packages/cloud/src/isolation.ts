import type { Tenant, CloudConfig } from './types.js';
import { TenantNotFoundError, TenantSuspendedError } from './types.js';
import type { TenantManager } from './tenant.js';

export interface TenantContext {
  tenantId: string;
  tenant: Tenant;
}

export interface IsolationOptions {
  tenantManager: TenantManager;
  config: CloudConfig;
}

/**
 * TenantIsolation provides middleware-like extraction of tenant context
 * from JWT tokens and scoping of all operations to the tenant's data.
 */
export class TenantIsolation {
  private tenantManager: TenantManager;

  constructor(options: IsolationOptions) {
    this.tenantManager = options.tenantManager;
  }

  /**
   * Extract tenant context from a JWT payload.
   * Validates the tenant exists and is active.
   */
  async extractTenant(jwtPayload: { tenantId?: string; sub?: string }): Promise<TenantContext> {
    const tenantId = jwtPayload.tenantId || jwtPayload.sub;
    if (!tenantId) {
      throw new TenantNotFoundError('unknown');
    }

    const tenant = await this.tenantManager.get(tenantId);

    if (tenant.status === 'suspended') {
      throw new TenantSuspendedError(tenantId);
    }

    if (tenant.status === 'deleted') {
      throw new TenantNotFoundError(tenantId);
    }

    return { tenantId, tenant };
  }

  /**
   * Scope a file path to the tenant's data directory.
   * Prevents path traversal outside the tenant's sandbox.
   */
  scopePath(tenant: Tenant, relativePath: string): string {
    const resolved = new URL(relativePath, `file://${tenant.dataDir}/`).pathname;

    if (!resolved.startsWith(tenant.dataDir)) {
      throw new Error('Path traversal attempt detected');
    }

    return resolved;
  }

  /**
   * Validate that a tenant can access a given resource.
   */
  validateAccess(context: TenantContext, resourceTenantId: string): boolean {
    return context.tenantId === resourceTenantId;
  }
}
