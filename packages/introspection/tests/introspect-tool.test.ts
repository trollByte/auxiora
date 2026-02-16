import { describe, expect, it } from 'vitest';
import { createIntrospectTool } from '../src/introspect-tool.js';
import type { CapabilityCatalog, HealthState } from '../src/types.js';

const catalog: CapabilityCatalog = {
  tools: [{ name: 'bash', description: 'Run commands', parameterCount: 1 }],
  channels: [{ type: 'discord', connected: true, hasDefault: true }],
  behaviors: [{ id: 'b1', type: 'scheduled', status: 'active', action: 'Daily report', runCount: 10, failCount: 0, maxFailures: 3, health: 'healthy' }],
  providers: [{ name: 'anthropic', displayName: 'Anthropic', available: true, isPrimary: true, isFallback: false, models: ['claude-sonnet'] }],
  plugins: [{ name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorCount: 0 }],
  features: { behaviors: true },
  updatedAt: '2026-02-15T12:00:00Z',
};

const health: HealthState = {
  overall: 'healthy',
  subsystems: [{ name: 'channels', status: 'healthy', lastCheck: '2026-02-15T12:00:00Z' }],
  issues: [],
  lastCheck: '2026-02-15T12:00:00Z',
};

const sources = {
  getAuditEntries: async () => [
    { timestamp: '2026-02-15T11:50:00Z', event: 'channel.error', details: { channelType: 'discord', error: 'Send failed' } },
    { timestamp: '2026-02-15T11:55:00Z', event: 'channel.error', details: { channelType: 'discord', error: 'Send failed' } },
    { timestamp: '2026-02-15T11:58:00Z', event: 'behavior.failed', details: { error: 'Timeout' } },
  ],
  getFeatures: () => ({ behaviors: true, browser: true, voice: false }),
};

function makeTool() {
  return createIntrospectTool(() => catalog, () => health, sources);
}

describe('createIntrospectTool', () => {
  it('returns capabilities', async () => {
    const tool = makeTool();
    const result = await tool.execute({ query: 'capabilities' });
    expect(result).toContain('bash');
    expect(result).toContain('discord');
    expect(result).toContain('Anthropic');
  });

  it('returns health', async () => {
    const tool = makeTool();
    const result = await tool.execute({ query: 'health' });
    expect(result).toContain('healthy');
  });

  it('returns errors with aggregation', async () => {
    const tool = makeTool();
    const result = await tool.execute({ query: 'errors', timeRange: '24h' });
    expect(result).toContain('channel.error');
    expect(result).toContain('2');
  });

  it('returns config/features', async () => {
    const tool = makeTool();
    const result = await tool.execute({ query: 'config' });
    expect(result).toContain('behaviors');
    expect(result).toContain('true');
  });

  it('returns specific subsystem', async () => {
    const tool = makeTool();
    const result = await tool.execute({ query: 'channels' });
    expect(result).toContain('discord');
    expect(result).toContain('connected');
  });
});
