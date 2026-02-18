import { describe, it, expect, vi } from 'vitest';

/**
 * Tests the runtime-state-based feature flag logic.
 * We recreate the getFeatures closure with mocked runtime fields.
 */

interface RuntimeFields {
  behaviors?: unknown;
  browserManager?: unknown;
  voiceManager?: unknown;
  webhookManager?: unknown;
  pluginLoader?: { listPlugins: () => unknown[] };
  memoryStore?: unknown;
  researchEngine?: unknown;
}

function createGetFeatures(fields: RuntimeFields) {
  return () => ({
    behaviors: !!fields.behaviors,
    browser: !!fields.browserManager,
    voice: !!fields.voiceManager,
    webhooks: !!fields.webhookManager,
    plugins: !!(fields.pluginLoader && fields.pluginLoader.listPlugins().length > 0),
    memory: !!fields.memoryStore,
    research: !!fields.researchEngine,
  });
}

describe('getFeatures (runtime-state based)', () => {
  it('reports all features as false when nothing is initialized', () => {
    const getFeatures = createGetFeatures({});
    const features = getFeatures();

    expect(features.behaviors).toBe(false);
    expect(features.browser).toBe(false);
    expect(features.voice).toBe(false);
    expect(features.webhooks).toBe(false);
    expect(features.plugins).toBe(false);
    expect(features.memory).toBe(false);
    expect(features.research).toBe(false);
  });

  it('reports voice as true when voiceManager is initialized', () => {
    const getFeatures = createGetFeatures({
      voiceManager: { /* mock VoiceManager */ },
    });
    expect(getFeatures().voice).toBe(true);
  });

  it('reports webhooks as true when webhookManager is initialized', () => {
    const getFeatures = createGetFeatures({
      webhookManager: { /* mock WebhookManager */ },
    });
    expect(getFeatures().webhooks).toBe(true);
  });

  it('reports plugins as false when pluginLoader has no plugins', () => {
    const getFeatures = createGetFeatures({
      pluginLoader: { listPlugins: () => [] },
    });
    expect(getFeatures().plugins).toBe(false);
  });

  it('reports plugins as true when pluginLoader has loaded plugins', () => {
    const getFeatures = createGetFeatures({
      pluginLoader: { listPlugins: () => [{ name: 'weather' }] },
    });
    expect(getFeatures().plugins).toBe(true);
  });

  it('reports research as true when researchEngine is initialized', () => {
    const getFeatures = createGetFeatures({
      researchEngine: { /* mock ResearchEngine */ },
    });
    expect(getFeatures().research).toBe(true);
  });

  it('reports all features as true when everything is initialized', () => {
    const getFeatures = createGetFeatures({
      behaviors: {},
      browserManager: {},
      voiceManager: {},
      webhookManager: {},
      pluginLoader: { listPlugins: () => [{ name: 'test' }] },
      memoryStore: {},
      researchEngine: {},
    });
    const features = getFeatures();

    expect(features.behaviors).toBe(true);
    expect(features.browser).toBe(true);
    expect(features.voice).toBe(true);
    expect(features.webhooks).toBe(true);
    expect(features.plugins).toBe(true);
    expect(features.memory).toBe(true);
    expect(features.research).toBe(true);
  });
});
