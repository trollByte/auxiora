import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getWorkspacePath } from '@auxiora/core';
import type { CostRecord, CostSummary } from './types.js';

interface CostLimits {
  dailyBudget?: number;
  monthlyBudget?: number;
  perMessageMax?: number;
  warnAt: number;
}

export class CostTracker {
  private records: CostRecord[] = [];
  private storePath: string;
  private loaded = false;

  constructor(
    private costLimits: CostLimits,
    storePath?: string,
  ) {
    this.storePath = storePath ?? path.join(getWorkspacePath(), 'cost-history.json');
  }

  record(record: CostRecord): void {
    this.records.push(record);
    // Fire-and-forget persist
    this.persist().catch(() => {});
  }

  getSummary(): CostSummary {
    const today = this.getTodaySpend();
    const thisMonth = this.getMonthSpend();

    const activeBudget = this.costLimits.dailyBudget ?? this.costLimits.monthlyBudget;
    const activeSpend = this.costLimits.dailyBudget ? today : thisMonth;

    const budgetRemaining = activeBudget !== undefined ? Math.max(0, activeBudget - activeSpend) : undefined;
    const isOverBudget = activeBudget !== undefined ? activeSpend >= activeBudget : false;
    const warningThresholdReached = activeBudget !== undefined
      ? activeSpend >= activeBudget * this.costLimits.warnAt
      : false;

    return {
      today,
      thisMonth,
      budgetRemaining,
      isOverBudget,
      warningThresholdReached,
    };
  }

  canAfford(estimatedCost: number): boolean {
    if (this.costLimits.perMessageMax !== undefined && estimatedCost > this.costLimits.perMessageMax) {
      return false;
    }

    const summary = this.getSummary();
    if (summary.isOverBudget) {
      return false;
    }

    if (summary.budgetRemaining !== undefined && estimatedCost > summary.budgetRemaining) {
      return false;
    }

    return true;
  }

  getTodaySpend(): number {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTs = startOfDay.getTime();

    return this.records
      .filter((r) => r.timestamp >= startTs)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  getMonthSpend(): number {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startTs = startOfMonth.getTime();

    return this.records
      .filter((r) => r.timestamp >= startTs)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  getByProvider(): Map<string, number> {
    const result = new Map<string, number>();
    for (const record of this.records) {
      result.set(record.provider, (result.get(record.provider) ?? 0) + record.cost);
    }
    return result;
  }

  getByModel(): Map<string, number> {
    const result = new Map<string, number>();
    for (const record of this.records) {
      result.set(record.model, (result.get(record.model) ?? 0) + record.cost);
    }
    return result;
  }

  reset(): void {
    this.records = [];
    this.persist().catch(() => {});
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const content = await fs.readFile(this.storePath, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        this.records = data;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Non-critical — start with empty records
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.storePath, JSON.stringify(this.records, null, 2), 'utf-8');
    } catch {
      // Non-critical — cost data is ephemeral
    }
  }
}
