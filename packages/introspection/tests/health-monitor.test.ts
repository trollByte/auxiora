import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthMonitorImpl } from '../src/health-monitor.js';
import type { AutoFixActions, IntrospectionSources } from '../src/types.js';

function mockSources(overrides?: Partial<IntrospectionSources>): IntrospectionSources {
  return {
    getTools: () => [],
    getConnectedChannels: () => ['discord'],
    getConfiguredChannels: () => ['discord', 'telegram'],
    getBehaviors: async () => [
      { id: 'b1', type: 'scheduled', status: 'active', action: 'Test', runCount: 10, failCount: 0, maxFailures: 3 },
    ],
    getProviders: () => [{ name: 'anthropic', displayName: 'Anthropic', models: {} }],
    getPrimaryProviderName: () => 'anthropic',
    getFallbackProviderName: () => undefined,
    checkProviderAvailable: async () => true,
    getPlugins: () => [],
    getFeatures: () => ({}),
    getAuditEntries: async () => [],
    getTrustLevel: () => 3,
    ...overrides,
  };
}

describe('HealthMonitorImpl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports healthy when all systems up', async () => {
    const sources = mockSources({
      getConnectedChannels: () => ['discord', 'telegram'],
      getConfiguredChannels: () => ['discord', 'telegram'],
      checkProviderAvailable: async () => true,
    });
    const monitor = new HealthMonitorImpl(sources);
    await monitor.check();

    const state = monitor.getHealthState();
    expect(state.overall).toBe('healthy');
    expect(state.issues).toHaveLength(0);
  });

  it('detects disconnected channels', async () => {
    const sources = mockSources({
      getConnectedChannels: () => [],
      getConfiguredChannels: () => ['discord'],
    });
    const monitor = new HealthMonitorImpl(sources);
    await monitor.check();

    const state = monitor.getHealthState();
    expect(state.overall).toBe('degraded');
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].subsystem).toBe('channels');
    expect(state.issues[0].autoFixable).toBe(true);
  });

  it('detects unavailable providers', async () => {
    const sources = mockSources({
      checkProviderAvailable: async () => false,
      getFallbackProviderName: () => undefined,
    });
    const monitor = new HealthMonitorImpl(sources);
    await monitor.check();

    const state = monitor.getHealthState();
    const providerIssue = state.issues.find((i) => i.subsystem === 'providers');
    expect(providerIssue).toBeDefined();
    expect(providerIssue!.severity).toBe('critical');
  });

  it('detects failing behaviors', async () => {
    const sources = mockSources({
      getConnectedChannels: () => ['discord', 'telegram'],
      getConfiguredChannels: () => ['discord', 'telegram'],
      getBehaviors: async () => [
        { id: 'b1', type: 'scheduled', status: 'active', action: 'Test', runCount: 10, failCount: 3, maxFailures: 3 },
      ],
    });
    const monitor = new HealthMonitorImpl(sources);
    await monitor.check();

    const state = monitor.getHealthState();
    const behaviorIssue = state.issues.find((i) => i.subsystem === 'behaviors');
    expect(behaviorIssue).toBeDefined();
    expect(behaviorIssue!.subsystem).toBe('behaviors');
  });

  it('attempts auto-fix when trust level sufficient', async () => {
    const reconnect = vi.fn().mockResolvedValue(true);
    const sources = mockSources({
      getConnectedChannels: () => [],
      getConfiguredChannels: () => ['discord'],
      getTrustLevel: () => 3,
    });
    const actions: AutoFixActions = { reconnectChannel: reconnect };
    const monitor = new HealthMonitorImpl(sources, actions);
    await monitor.check();

    expect(reconnect).toHaveBeenCalledWith('discord');
  });

  it('skips auto-fix when trust level insufficient', async () => {
    const reconnect = vi.fn().mockResolvedValue(true);
    const sources = mockSources({
      getConnectedChannels: () => [],
      getConfiguredChannels: () => ['discord'],
      getTrustLevel: () => 0,
    });
    const actions: AutoFixActions = { reconnectChannel: reconnect };
    const monitor = new HealthMonitorImpl(sources, actions);
    await monitor.check();

    expect(reconnect).not.toHaveBeenCalled();
  });

  it('fires onChange callback', async () => {
    const sources = mockSources({
      getConnectedChannels: () => ['discord', 'telegram'],
      getConfiguredChannels: () => ['discord', 'telegram'],
    });
    const monitor = new HealthMonitorImpl(sources);
    const cb = vi.fn();
    monitor.onChange(cb);
    await monitor.check();

    expect(cb).toHaveBeenCalledOnce();
  });
});
