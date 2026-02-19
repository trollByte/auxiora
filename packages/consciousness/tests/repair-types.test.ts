import { describe, it, expect } from 'vitest';
import type {
  Diagnosis,
  RepairAction,
  RepairLog,
} from '../src/repair/repair-types.js';

describe('RepairTypes', () => {
  it('Diagnosis satisfies shape', () => {
    const diagnosis: Diagnosis = {
      id: 'diag-1',
      timestamp: Date.now(),
      anomaly: { subsystem: 'providers', severity: 'high', description: 'Down', detectedAt: Date.now() },
      rootCause: 'Provider API key expired',
      confidence: 0.85,
      suggestedActions: [],
    };
    expect(diagnosis.confidence).toBe(0.85);
  });

  it('RepairAction satisfies shape', () => {
    const action: RepairAction = {
      id: 'action-1',
      tier: 'notify',
      description: 'Disable degraded provider',
      command: 'disableProvider',
      rollback: 'enableProvider',
      estimatedImpact: 'Provider will be unavailable until re-enabled',
    };
    expect(action.tier).toBe('notify');
  });

  it('RepairLog satisfies shape', () => {
    const log: RepairLog = {
      actionId: 'action-1',
      diagnosisId: 'diag-1',
      tier: 'auto',
      status: 'executed',
      executedAt: Date.now(),
      result: 'Cache cleared successfully',
    };
    expect(log.status).toBe('executed');
  });
});
