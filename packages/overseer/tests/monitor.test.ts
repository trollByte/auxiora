import { describe, expect, it, vi } from 'vitest';

import { OverseerMonitor } from '../src/monitor.js';
import type { AgentSnapshot, OverseerConfig } from '../src/types.js';

const baseConfig: OverseerConfig = {
  loopThreshold: 3,
  stallTimeoutMs: 10_000,
  maxTokenBudget: 50_000,
  checkIntervalMs: 5_000,
};

function makeSnapshot(overrides: Partial<AgentSnapshot> = {}): AgentSnapshot {
  const now = Date.now();
  return {
    agentId: 'agent-1',
    toolCalls: [],
    tokenUsage: 1_000,
    lastActivityAt: now,
    startedAt: now - 5_000,
    ...overrides,
  };
}

describe('OverseerMonitor', () => {
  it('detects tool call looping (3 same tool = loop with threshold 3)', () => {
    const monitor = new OverseerMonitor(baseConfig);
    const now = Date.now();
    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'search', timestamp: now - 3000 },
        { tool: 'search', timestamp: now - 2000 },
        { tool: 'search', timestamp: now - 1000 },
      ],
    });

    const alerts = monitor.analyze(snapshot);

    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const loopAlert = alerts.find(
      (a) => a.type === 'loop_detected' && a.message.includes('search'),
    );
    expect(loopAlert).toBeDefined();
    expect(loopAlert!.severity).toBe('warning');
    expect(loopAlert!.agentId).toBe('agent-1');
  });

  it('detects stalling agent (15s idle with 10s threshold)', () => {
    const monitor = new OverseerMonitor(baseConfig);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const snapshot = makeSnapshot({
      lastActivityAt: now - 15_000,
    });

    const alerts = monitor.analyze(snapshot);

    vi.restoreAllMocks();

    const stallAlert = alerts.find((a) => a.type === 'stall_detected');
    expect(stallAlert).toBeDefined();
    expect(stallAlert!.severity).toBe('critical');
    expect(stallAlert!.message).toContain('15s');
  });

  it('detects token budget exceeded (60k with 50k threshold)', () => {
    const monitor = new OverseerMonitor(baseConfig);
    const snapshot = makeSnapshot({
      tokenUsage: 60_000,
    });

    const alerts = monitor.analyze(snapshot);

    const budgetAlert = alerts.find((a) => a.type === 'budget_exceeded');
    expect(budgetAlert).toBeDefined();
    expect(budgetAlert!.severity).toBe('critical');
    expect(budgetAlert!.message).toContain('60000');
    expect(budgetAlert!.message).toContain('50000');
  });

  it('returns empty for healthy agent', () => {
    const monitor = new OverseerMonitor(baseConfig);
    const now = Date.now();
    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'search', timestamp: now - 2000 },
        { tool: 'read', timestamp: now - 1000 },
      ],
      tokenUsage: 5_000,
      lastActivityAt: now,
    });

    const alerts = monitor.analyze(snapshot);

    expect(alerts).toEqual([]);
  });

  it('detects repeated consecutive tool pattern (search,read,search,read,search,read)', () => {
    const monitor = new OverseerMonitor(baseConfig);
    const now = Date.now();
    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'search', timestamp: now - 6000 },
        { tool: 'read', timestamp: now - 5000 },
        { tool: 'search', timestamp: now - 4000 },
        { tool: 'read', timestamp: now - 3000 },
        { tool: 'search', timestamp: now - 2000 },
        { tool: 'read', timestamp: now - 1000 },
      ],
    });

    const alerts = monitor.analyze(snapshot);

    const patternAlert = alerts.find(
      (a) => a.type === 'loop_detected' && a.message.includes('pattern'),
    );
    expect(patternAlert).toBeDefined();
    expect(patternAlert!.message).toContain('search');
    expect(patternAlert!.message).toContain('read');
  });
});
