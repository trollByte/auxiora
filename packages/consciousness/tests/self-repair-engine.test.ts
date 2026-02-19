import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Anomaly } from '../src/monitor/monitor-types.js';
import type { RepairAction } from '../src/repair/repair-types.js';
import { SelfRepairEngine } from '../src/repair/self-repair-engine.js';
import type { SelfRepairEngineDeps, VaultLike } from '../src/repair/self-repair-engine.js';

function makeVault(): VaultLike {
  const store = new Map<string, string>();
  return {
    add: vi.fn(async (name: string, value: string) => { store.set(name, value); }),
    get: vi.fn((name: string) => store.get(name)),
    has: vi.fn((name: string) => store.has(name)),
    list: vi.fn(() => [...store.keys()]),
    remove: vi.fn(async (name: string) => store.delete(name)),
  };
}

function makeDeps(overrides: Partial<SelfRepairEngineDeps> = {}): SelfRepairEngineDeps {
  return {
    vault: makeVault(),
    onNotify: vi.fn(),
    onApprovalRequest: vi.fn(async () => true),
    actionExecutor: vi.fn(async () => 'ok'),
    ...overrides,
  };
}

function makeAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return {
    subsystem: 'providers',
    severity: 'high',
    description: 'Provider is down',
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('SelfRepairEngine', () => {
  let deps: SelfRepairEngineDeps;
  let engine: SelfRepairEngine;

  beforeEach(() => {
    deps = makeDeps();
    engine = new SelfRepairEngine(deps);
  });

  describe('diagnose', () => {
    it('matches providers + high severity pattern', () => {
      const anomaly = makeAnomaly({ subsystem: 'providers', severity: 'high' });
      const diagnosis = engine.diagnose(anomaly);

      expect(diagnosis.confidence).toBe(0.75);
      expect(diagnosis.rootCause).toContain('Provider subsystem');
      expect(diagnosis.suggestedActions.length).toBeGreaterThan(0);
      expect(diagnosis.suggestedActions[0].tier).toBe('notify');
    });

    it('matches providers + all down pattern (higher priority)', () => {
      const anomaly = makeAnomaly({
        subsystem: 'providers',
        severity: 'high',
        description: 'all down',
      });
      const diagnosis = engine.diagnose(anomaly);

      expect(diagnosis.confidence).toBe(0.9);
      expect(diagnosis.suggestedActions[0].tier).toBe('approve');
    });

    it('matches cache pattern', () => {
      const anomaly = makeAnomaly({ subsystem: 'cache', severity: 'medium' });
      const diagnosis = engine.diagnose(anomaly);

      expect(diagnosis.confidence).toBe(0.85);
      expect(diagnosis.suggestedActions[0].tier).toBe('auto');
    });

    it('matches channels pattern', () => {
      const anomaly = makeAnomaly({ subsystem: 'channels', severity: 'low' });
      const diagnosis = engine.diagnose(anomaly);

      expect(diagnosis.confidence).toBe(0.8);
      expect(diagnosis.suggestedActions[0].tier).toBe('auto');
    });

    it('matches memory + non-low severity pattern', () => {
      const anomaly = makeAnomaly({ subsystem: 'memory', severity: 'medium' });
      const diagnosis = engine.diagnose(anomaly);

      expect(diagnosis.confidence).toBe(0.7);
      expect(diagnosis.suggestedActions[0].tier).toBe('notify');
    });

    it('returns low confidence for unknown anomaly', () => {
      const anomaly = makeAnomaly({ subsystem: 'unknown-subsystem', severity: 'low' });
      const diagnosis = engine.diagnose(anomaly);

      expect(diagnosis.confidence).toBe(0.2);
      expect(diagnosis.suggestedActions).toHaveLength(0);
      expect(diagnosis.rootCause).toContain('Unknown');
    });
  });

  describe('executeAction', () => {
    it('executes auto-tier action immediately and logs result', async () => {
      const anomaly = makeAnomaly({ subsystem: 'cache', severity: 'medium' });
      const diagnosis = engine.diagnose(anomaly);
      const action = diagnosis.suggestedActions[0];

      const log = await engine.executeAction(action, diagnosis.id);

      expect(log.status).toBe('executed');
      expect(log.result).toBe('ok');
      expect(log.tier).toBe('auto');
      expect(deps.actionExecutor).toHaveBeenCalledWith(action.command);
    });

    it('executes notify-tier action and calls onNotify', async () => {
      const anomaly = makeAnomaly({ subsystem: 'providers', severity: 'high' });
      const diagnosis = engine.diagnose(anomaly);
      const action = diagnosis.suggestedActions[0];

      const log = await engine.executeAction(action, diagnosis.id);

      expect(log.status).toBe('executed');
      expect(deps.onNotify).toHaveBeenCalled();
    });

    it('executes approve-tier action after approval', async () => {
      const anomaly = makeAnomaly({
        subsystem: 'providers',
        severity: 'high',
        description: 'all down',
      });
      const diagnosis = engine.diagnose(anomaly);
      const action = diagnosis.suggestedActions[0];

      const log = await engine.executeAction(action, diagnosis.id);

      expect(log.status).toBe('approved');
      expect(deps.onApprovalRequest).toHaveBeenCalled();
      expect(deps.actionExecutor).toHaveBeenCalledWith(action.command);
    });

    it('rejects approve-tier action when approval denied', async () => {
      deps = makeDeps({ onApprovalRequest: vi.fn(async () => false) });
      engine = new SelfRepairEngine(deps);

      const anomaly = makeAnomaly({
        subsystem: 'providers',
        severity: 'high',
        description: 'all down',
      });
      const diagnosis = engine.diagnose(anomaly);
      const action = diagnosis.suggestedActions[0];

      const log = await engine.executeAction(action, diagnosis.id);

      expect(log.status).toBe('rejected');
      expect(deps.actionExecutor).not.toHaveBeenCalled();
    });

    it('catches execution errors and logs as failed', async () => {
      deps = makeDeps({ actionExecutor: vi.fn(async () => { throw new Error('boom'); }) });
      engine = new SelfRepairEngine(deps);

      const anomaly = makeAnomaly({ subsystem: 'cache', severity: 'medium' });
      const diagnosis = engine.diagnose(anomaly);
      const action = diagnosis.suggestedActions[0];

      const log = await engine.executeAction(action, diagnosis.id);

      expect(log.status).toBe('failed');
      expect(log.error).toBe('boom');
    });
  });

  describe('getRepairHistory', () => {
    it('returns all logs', async () => {
      const anomaly = makeAnomaly({ subsystem: 'cache', severity: 'medium' });
      const d1 = engine.diagnose(anomaly);
      const d2 = engine.diagnose(anomaly);

      await engine.executeAction(d1.suggestedActions[0], d1.id);
      await engine.executeAction(d2.suggestedActions[0], d2.id);

      const history = engine.getRepairHistory();
      expect(history).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      const anomaly = makeAnomaly({ subsystem: 'cache', severity: 'medium' });

      for (let i = 0; i < 5; i++) {
        const d = engine.diagnose(anomaly);
        await engine.executeAction(d.suggestedActions[0], d.id);
      }

      const history = engine.getRepairHistory(2);
      expect(history).toHaveLength(2);
    });
  });

  describe('persistence', () => {
    it('persists logs to vault after execution', async () => {
      const anomaly = makeAnomaly({ subsystem: 'cache', severity: 'medium' });
      const diagnosis = engine.diagnose(anomaly);

      await engine.executeAction(diagnosis.suggestedActions[0], diagnosis.id);

      expect(deps.vault.add).toHaveBeenCalledWith(
        'consciousness:repair:log',
        expect.any(String),
      );
    });
  });

  describe('getPendingApprovals', () => {
    it('tracks pending approve-tier actions', () => {
      const anomaly = makeAnomaly({
        subsystem: 'providers',
        severity: 'high',
        description: 'all down',
      });
      const diagnosis = engine.diagnose(anomaly);

      const pending = engine.getPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].action.id).toBe(diagnosis.suggestedActions[0].id);
    });

    it('removes from pending after execution', async () => {
      const anomaly = makeAnomaly({
        subsystem: 'providers',
        severity: 'high',
        description: 'all down',
      });
      const diagnosis = engine.diagnose(anomaly);

      await engine.executeAction(diagnosis.suggestedActions[0], diagnosis.id);

      expect(engine.getPendingApprovals()).toHaveLength(0);
    });
  });
});
