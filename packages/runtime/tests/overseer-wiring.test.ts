import { describe, it, expect } from 'vitest';
import { OverseerMonitor } from '@auxiora/overseer';
import type { AgentSnapshot, OverseerConfig } from '@auxiora/overseer';

describe('Overseer Integration', () => {
  const config: OverseerConfig = {
    loopThreshold: 3,
    stallTimeoutMs: 5_000,
    maxTokenBudget: 10_000,
    checkIntervalMs: 1_000,
  };

  it('overseer alerts map to health issue shape', () => {
    const monitor = new OverseerMonitor(config);
    const snapshot: AgentSnapshot = {
      agentId: 'agent-1',
      toolCalls: [
        { tool: 'search', timestamp: 1 },
        { tool: 'search', timestamp: 2 },
        { tool: 'search', timestamp: 3 },
      ],
      tokenUsage: 15_000,
      lastActivityAt: Date.now() - 10_000,
      startedAt: Date.now() - 20_000,
    };

    const alerts = monitor.analyze(snapshot);
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    for (const alert of alerts) {
      const healthIssue = {
        id: `overseer-${alert.agentId}-${alert.type}`,
        subsystem: 'overseer',
        severity: alert.severity,
        description: alert.message,
        detectedAt: new Date(alert.detectedAt).toISOString(),
        suggestedFix: `Investigate agent ${alert.agentId}: ${alert.type}`,
        autoFixable: alert.type === 'stall_detected',
        trustLevelRequired: 3,
      };
      expect(healthIssue.id).toBeDefined();
      expect(healthIssue.subsystem).toBe('overseer');
    }
  });

  it('healthy agents produce no alerts', () => {
    const monitor = new OverseerMonitor(config);
    const snapshot: AgentSnapshot = {
      agentId: 'agent-2',
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'write', timestamp: 2 },
      ],
      tokenUsage: 500,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 1000,
    };
    expect(monitor.analyze(snapshot)).toHaveLength(0);
  });
});
