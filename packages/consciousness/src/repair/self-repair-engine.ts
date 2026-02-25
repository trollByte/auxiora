import type { Anomaly } from '../monitor/monitor-types.js';
import type { Diagnosis, RepairAction, RepairLog } from './repair-types.js';
import { BUILT_IN_PATTERNS } from './repair-actions.js';
import { randomUUID } from 'node:crypto';

export interface VaultLike {
  add(name: string, value: string): Promise<void>;
  get(name: string): string | undefined;
  has(name: string): boolean;
  list(): string[];
  remove(name: string): Promise<boolean>;
}

export interface SelfRepairEngineDeps {
  vault: VaultLike;
  onNotify: (diagnosis: Diagnosis | null, action: RepairAction) => void;
  onApprovalRequest: (diagnosis: Diagnosis | null, action: RepairAction) => Promise<boolean>;
  actionExecutor: (command: string) => Promise<string>;
}

const REPAIR_LOG_KEY = 'consciousness:repair:log';

export class SelfRepairEngine {
  private readonly deps: SelfRepairEngineDeps;
  private logs: RepairLog[] = [];
  private pendingApprovals: Map<string, { diagnosis: Diagnosis | null; action: RepairAction }> = new Map();

  constructor(deps: SelfRepairEngineDeps) {
    this.deps = deps;
    this.loadLogs();
  }

  private loadLogs(): void {
    const raw = this.deps.vault.get(REPAIR_LOG_KEY);
    if (raw) {
      try {
        this.logs = JSON.parse(raw) as RepairLog[];
      } catch {
        this.logs = [];
      }
    }
  }

  private async persistLogs(): Promise<void> {
    await this.deps.vault.add(REPAIR_LOG_KEY, JSON.stringify(this.logs));
  }

  diagnose(anomaly: Anomaly): Diagnosis {
    for (const pattern of BUILT_IN_PATTERNS) {
      if (pattern.match(anomaly)) {
        const actions = pattern.actions();
        const diagnosis: Diagnosis = {
          id: randomUUID(),
          timestamp: Date.now(),
          anomaly,
          rootCause: pattern.rootCause,
          confidence: pattern.confidence,
          suggestedActions: actions,
        };

        for (const action of actions) {
          if (action.tier === 'approve') {
            this.pendingApprovals.set(action.id, { diagnosis, action });
          }
        }

        return diagnosis;
      }
    }

    return {
      id: randomUUID(),
      timestamp: Date.now(),
      anomaly,
      rootCause: 'Unknown anomaly — no matching repair pattern',
      confidence: 0.2,
      suggestedActions: [],
    };
  }

  async executeAction(action: RepairAction, diagnosisId: string): Promise<RepairLog> {
    const diagnosis = this.findDiagnosisForAction(action.id);

    if (action.tier === 'approve') {
      const approved = await this.deps.onApprovalRequest(diagnosis, action);
      if (!approved) {
        const log: RepairLog = {
          actionId: action.id,
          diagnosisId,
          tier: action.tier,
          status: 'rejected',
          executedAt: Date.now(),
        };
        this.logs.push(log);
        this.pendingApprovals.delete(action.id);
        await this.persistLogs();
        return log;
      }
    }

    try {
      const result = await this.deps.actionExecutor(action.command);

      const status = action.tier === 'approve' ? 'approved' : 'executed';
      const log: RepairLog = {
        actionId: action.id,
        diagnosisId,
        tier: action.tier,
        status,
        executedAt: Date.now(),
        result,
      };

      this.logs.push(log);
      this.pendingApprovals.delete(action.id);
      await this.persistLogs();

      if (action.tier === 'notify') {
        this.deps.onNotify(diagnosis, action);
      }

      return log;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const log: RepairLog = {
        actionId: action.id,
        diagnosisId,
        tier: action.tier,
        status: 'failed',
        executedAt: Date.now(),
        error: errorMessage,
      };

      this.logs.push(log);
      this.pendingApprovals.delete(action.id);
      await this.persistLogs();
      return log;
    }
  }

  getRepairHistory(limit?: number): RepairLog[] {
    if (limit !== undefined) {
      return this.logs.slice(-limit);
    }
    return [...this.logs];
  }

  getPendingApprovals(): Array<{ diagnosis: Diagnosis | null; action: RepairAction }> {
    return [...this.pendingApprovals.values()];
  }

  private findDiagnosisForAction(actionId: string): Diagnosis | null {
    const entry = this.pendingApprovals.get(actionId);
    return entry?.diagnosis ?? null;
  }
}
