import type { ActionAuditTrail } from './audit-trail.js';
import type { ActionAudit } from './types.js';

export interface RollbackResult {
  success: boolean;
  auditId: string;
  error?: string;
}

export class RollbackManager {
  private auditTrail: ActionAuditTrail;

  constructor(auditTrail: ActionAuditTrail) {
    this.auditTrail = auditTrail;
  }

  canRollback(auditId: string): boolean {
    const entry = this.auditTrail.getById(auditId);
    if (!entry) return false;
    return entry.rollbackAvailable && entry.outcome !== 'rolled_back';
  }

  async rollback(auditId: string): Promise<RollbackResult> {
    const entry = this.auditTrail.getById(auditId);
    if (!entry) {
      return { success: false, auditId, error: 'Audit entry not found' };
    }

    if (entry.outcome === 'rolled_back') {
      return { success: false, auditId, error: 'Action already rolled back' };
    }

    if (!entry.rollbackAvailable) {
      return { success: false, auditId, error: 'Rollback not available for this action' };
    }

    await this.auditTrail.markRolledBack(auditId);
    return { success: true, auditId };
  }

  getHistory(): ActionAudit[] {
    return this.auditTrail.query({ outcome: 'rolled_back' });
  }
}
