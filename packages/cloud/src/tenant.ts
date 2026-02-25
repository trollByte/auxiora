import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { Tenant, TenantPlan, CloudConfig } from './types.js';
import { TenantNotFoundError } from './types.js';
import { getPlanQuotas } from './plans.js';

export interface TenantManagerOptions {
  config: CloudConfig;
}

export class TenantManager {
  private tenants = new Map<string, Tenant>();
  private config: CloudConfig;

  constructor(options: TenantManagerOptions) {
    this.config = options.config;
  }

  async create(email: string, name: string, plan: TenantPlan = 'free'): Promise<Tenant> {
    const id = `tenant-${crypto.randomUUID()}`;
    const dataDir = path.join(this.config.baseDataDir, id);

    await fs.mkdir(dataDir, { recursive: true });

    const tenant: Tenant = {
      id,
      name,
      email,
      plan,
      status: 'active',
      dataDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tenants.set(id, tenant);
    await this.persistTenant(tenant);
    return tenant;
  }

  async get(id: string): Promise<Tenant> {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new TenantNotFoundError(id);
    }
    return tenant;
  }

  async getByEmail(email: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.email === email) {
        return tenant;
      }
    }
    return null;
  }

  async update(id: string, updates: Partial<Pick<Tenant, 'name' | 'email' | 'plan'>>): Promise<Tenant> {
    const tenant = await this.get(id);

    if (updates.name !== undefined) tenant.name = updates.name;
    if (updates.email !== undefined) tenant.email = updates.email;
    if (updates.plan !== undefined) tenant.plan = updates.plan;
    tenant.updatedAt = new Date().toISOString();

    this.tenants.set(id, tenant);
    await this.persistTenant(tenant);
    return tenant;
  }

  async suspend(id: string, reason: string): Promise<Tenant> {
    const tenant = await this.get(id);
    tenant.status = 'suspended';
    tenant.suspendedAt = new Date().toISOString();
    tenant.suspendReason = reason;
    tenant.updatedAt = new Date().toISOString();

    this.tenants.set(id, tenant);
    await this.persistTenant(tenant);
    return tenant;
  }

  async reactivate(id: string): Promise<Tenant> {
    const tenant = await this.get(id);
    tenant.status = 'active';
    tenant.suspendedAt = undefined;
    tenant.suspendReason = undefined;
    tenant.updatedAt = new Date().toISOString();

    this.tenants.set(id, tenant);
    await this.persistTenant(tenant);
    return tenant;
  }

  async delete(id: string): Promise<boolean> {
    const tenant = this.tenants.get(id);
    if (!tenant) return false;

    tenant.status = 'deleted';
    tenant.updatedAt = new Date().toISOString();
    this.tenants.set(id, tenant);
    await this.persistTenant(tenant);
    return true;
  }

  async list(): Promise<Tenant[]> {
    return Array.from(this.tenants.values()).filter(t => t.status !== 'deleted');
  }

  getQuotas(plan: TenantPlan) {
    return getPlanQuotas(plan);
  }

  private async persistTenant(tenant: Tenant): Promise<void> {
    const tenantFile = path.join(tenant.dataDir, 'tenant.json');
    await fs.mkdir(path.dirname(tenantFile), { recursive: true });
    await fs.writeFile(tenantFile, JSON.stringify(tenant, null, 2), 'utf-8');
  }

  async loadFromDisk(): Promise<void> {
    try {
      const entries = await fs.readdir(this.config.baseDataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('tenant-')) {
          const tenantFile = path.join(this.config.baseDataDir, entry.name, 'tenant.json');
          try {
            const content = await fs.readFile(tenantFile, 'utf-8');
            const tenant = JSON.parse(content) as Tenant;
            this.tenants.set(tenant.id, tenant);
          } catch {
            // Skip corrupt tenant files
          }
        }
      }
    } catch {
      // Base data dir doesn't exist yet
    }
  }
}
