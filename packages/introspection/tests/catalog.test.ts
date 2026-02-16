import { describe, expect, it, vi } from 'vitest';
import { CapabilityCatalogImpl, classifyBehaviorHealth } from '../src/catalog.js';
import type { IntrospectionSources } from '../src/types.js';

function mockSources(overrides?: Partial<IntrospectionSources>): IntrospectionSources {
  return {
    getTools: () => [
      { name: 'bash', description: 'Run shell commands', parameters: [{ name: 'command', type: 'string' }] },
      { name: 'web_browser', description: 'Browse the web', parameters: [] },
    ],
    getConnectedChannels: () => ['discord', 'webchat'],
    getConfiguredChannels: () => ['discord', 'telegram', 'webchat'],
    getDefaultChannelId: () => 'channel-123',
    getBehaviors: async () => [
      { id: 'b1', type: 'scheduled', status: 'active', action: 'Daily report', runCount: 10, failCount: 0, maxFailures: 3, lastRun: '2026-02-15T10:00:00Z' },
      { id: 'b2', type: 'monitor', status: 'paused', action: 'Watch prices', runCount: 5, failCount: 3, maxFailures: 3 },
    ],
    getProviders: () => [
      { name: 'anthropic', displayName: 'Anthropic', models: { 'claude-sonnet': {} } },
      { name: 'openai', displayName: 'OpenAI', models: { 'gpt-4': {} } },
    ],
    getPrimaryProviderName: () => 'anthropic',
    getFallbackProviderName: () => 'openai',
    getPlugins: () => [
      { name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorNames: [] },
    ],
    getFeatures: () => ({ behaviors: true, browser: true, voice: false }),
    getAuditEntries: async () => [],
    ...overrides,
  };
}

describe('CapabilityCatalog', () => {
  it('builds catalog from sources', async () => {
    const sources = mockSources();
    const catalog = new CapabilityCatalogImpl(sources);
    await catalog.rebuild();

    const snap = catalog.getCatalog();

    // Tools
    expect(snap.tools).toHaveLength(2);
    expect(snap.tools[0]).toEqual({ name: 'bash', description: 'Run shell commands', parameterCount: 1 });
    expect(snap.tools[1]).toEqual({ name: 'web_browser', description: 'Browse the web', parameterCount: 0 });

    // Channels — 3 unique types (discord, webchat, telegram)
    expect(snap.channels).toHaveLength(3);
    const discord = snap.channels.find((c) => c.type === 'discord');
    expect(discord?.connected).toBe(true);
    expect(discord?.hasDefault).toBe(true);
    const telegram = snap.channels.find((c) => c.type === 'telegram');
    expect(telegram?.connected).toBe(false);

    // Behaviors
    expect(snap.behaviors).toHaveLength(2);
    expect(snap.behaviors[0]!.health).toBe('healthy');
    expect(snap.behaviors[1]!.health).toBe('paused');

    // Providers
    expect(snap.providers).toHaveLength(2);
    const anthropic = snap.providers.find((p) => p.name === 'anthropic');
    expect(anthropic?.isPrimary).toBe(true);
    expect(anthropic?.isFallback).toBe(false);
    const openai = snap.providers.find((p) => p.name === 'openai');
    expect(openai?.isPrimary).toBe(false);
    expect(openai?.isFallback).toBe(true);
    expect(openai?.models).toEqual(['gpt-4']);

    // Plugins
    expect(snap.plugins).toHaveLength(1);
    expect(snap.plugins[0]).toEqual({ name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorCount: 0 });

    // Features
    expect(snap.features).toEqual({ behaviors: true, browser: true, voice: false });
  });

  it('classifies behavior health correctly', () => {
    // healthy: 0 fails out of 3
    expect(classifyBehaviorHealth({ status: 'active', failCount: 0, maxFailures: 3 })).toBe('healthy');

    // warning: 2 fails out of 3 (ceil(3/2) = 2)
    expect(classifyBehaviorHealth({ status: 'active', failCount: 2, maxFailures: 3 })).toBe('warning');

    // failing: 3 fails out of 3
    expect(classifyBehaviorHealth({ status: 'active', failCount: 3, maxFailures: 3 })).toBe('failing');

    // paused
    expect(classifyBehaviorHealth({ status: 'paused', failCount: 0, maxFailures: 3 })).toBe('paused');
  });

  it('handles partial rebuild for channels', async () => {
    let channelList = ['discord'];
    const sources = mockSources({
      getConnectedChannels: () => channelList,
      getConfiguredChannels: () => channelList,
    });

    const catalog = new CapabilityCatalogImpl(sources);
    await catalog.rebuild();

    expect(catalog.getCatalog().channels).toHaveLength(1);
    expect(catalog.getCatalog().tools).toHaveLength(2);

    // Update channels source and do partial rebuild
    channelList = ['discord', 'telegram', 'webchat'];
    await catalog.rebuildSection('channels');

    expect(catalog.getCatalog().channels).toHaveLength(3);
    // Tools should remain unchanged
    expect(catalog.getCatalog().tools).toHaveLength(2);
  });

  it('fires onChange callback on rebuild', async () => {
    const sources = mockSources();
    const catalog = new CapabilityCatalogImpl(sources);
    const cb = vi.fn();
    catalog.onChange(cb);

    await catalog.rebuild();

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ tools: expect.any(Array) }));
  });
});
