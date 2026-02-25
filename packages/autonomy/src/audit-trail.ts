import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { paths } from '@auxiora/core';
import type { ActionAudit, TrustDomain, TrustLevel } from './types.js';

export interface AuditQueryFilters {
  domain?: TrustDomain;
  outcome?: ActionAudit['outcome'];
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
}

export class ActionAuditTrail {
  private entries: ActionAudit[] = [];
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(paths.data(), 'trust-audit.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.entries = JSON.parse(raw) as ActionAudit[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  async record(entry: Omit<ActionAudit, 'id' | 'timestamp'>): Promise<ActionAudit> {
    const audit: ActionAudit = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    };
    this.entries.push(audit);
    await this.save();
    return audit;
  }

  query(filters: AuditQueryFilters = {}): ActionAudit[] {
    let result = [...this.entries];

    if (filters.domain) {
      result = result.filter((e) => e.domain === filters.domain);
    }
    if (filters.outcome) {
      result = result.filter((e) => e.outcome === filters.outcome);
    }
    if (filters.fromTimestamp !== undefined) {
      result = result.filter((e) => e.timestamp >= filters.fromTimestamp!);
    }
    if (filters.toTimestamp !== undefined) {
      result = result.filter((e) => e.timestamp <= filters.toTimestamp!);
    }

    // Sort newest first
    result.sort((a, b) => b.timestamp - a.timestamp);

    if (filters.limit !== undefined && filters.limit > 0) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }

  getById(id: string): ActionAudit | undefined {
    return this.entries.find((e) => e.id === id);
  }

  async markRolledBack(id: string): Promise<boolean> {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return false;
    entry.outcome = 'rolled_back';
    entry.rollbackAvailable = false;
    await this.save();
    return true;
  }

  getAll(): ActionAudit[] {
    return [...this.entries];
  }
}
