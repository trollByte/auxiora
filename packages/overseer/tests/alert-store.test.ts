import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AlertStore } from '../src/alert-store.js';
import type { OverseerAlert } from '../src/types.js';

function makeAlert(overrides: Partial<OverseerAlert> = {}): OverseerAlert {
  return {
    type: 'loop_detected',
    agentId: 'agent-1',
    message: 'Loop detected',
    severity: 'warning',
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('AlertStore', () => {
  let dir: string;
  let store: AlertStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'alert-store-'));
    store = new AlertStore(join(dir, 'alerts.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores and retrieves alerts', () => {
    store.record(makeAlert({ message: 'first' }));
    store.record(makeAlert({ message: 'second' }));

    const recent = store.getRecent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBeTypeOf('number');
    expect(recent.map((a) => a.message)).toContain('first');
    expect(recent.map((a) => a.message)).toContain('second');
  });

  it('filters by agent', () => {
    store.record(makeAlert({ agentId: 'a1' }));
    store.record(makeAlert({ agentId: 'a2' }));
    store.record(makeAlert({ agentId: 'a1' }));

    const results = store.getByAgent('a1');
    expect(results).toHaveLength(2);
    expect(results.every((a) => a.agentId === 'a1')).toBe(true);
  });

  it('filters by severity', () => {
    store.record(makeAlert({ severity: 'warning' }));
    store.record(makeAlert({ severity: 'critical' }));
    store.record(makeAlert({ severity: 'critical' }));

    const results = store.getBySeverity('critical');
    expect(results).toHaveLength(2);
    expect(results.every((a) => a.severity === 'critical')).toBe(true);
  });

  it('acknowledges alerts', () => {
    store.record(makeAlert());
    store.record(makeAlert());

    const before = store.getUnacknowledged();
    expect(before).toHaveLength(2);

    store.acknowledge(before[0].id);
    store.acknowledge(before[1].id);

    const after = store.getUnacknowledged();
    expect(after).toHaveLength(0);
  });
});
