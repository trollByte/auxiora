import { describe, it, expect } from 'vitest';
import { TelemetryStage } from '../stages/telemetry-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides?: Partial<EnrichmentContext>): EnrichmentContext {
  return {
    basePrompt: 'You are Auxiora.',
    userMessage: 'hello',
    history: [],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: {} as any,
    ...overrides,
  };
}

describe('TelemetryStage', () => {
  it('has order 50 (before all other stages)', () => {
    const stage = new TelemetryStage(() => []);
    expect(stage.order).toBe(50);
    expect(stage.name).toBe('telemetry');
  });

  it('appends nothing when no flagged tools', async () => {
    const stage = new TelemetryStage(() => []);
    const result = await stage.enrich(makeCtx(), 'base prompt');
    expect(result.prompt).toBe('base prompt');
  });

  it('appends warning section when a tool is flagged', async () => {
    const flagged = [
      { tool: 'provider.complete', totalCalls: 20, successRate: 0.4, lastError: 'rate limited' },
    ];
    const stage = new TelemetryStage(() => flagged);
    // Must call enabled() first to cache stats
    stage.enabled(makeCtx());
    const result = await stage.enrich(makeCtx(), 'base prompt');
    expect(result.prompt).toContain('[Operational Telemetry]');
    expect(result.prompt).toContain('provider.complete');
    expect(result.prompt).toContain('40%');
    expect(result.prompt).toContain('rate limited');
  });

  it('includes metadata with flagged tool names', async () => {
    const flagged = [
      { tool: 'memory.search', totalCalls: 10, successRate: 0.3, lastError: 'timeout' },
    ];
    const stage = new TelemetryStage(() => flagged);
    stage.enabled(makeCtx());
    const result = await stage.enrich(makeCtx(), 'base');
    expect(result.metadata?.flaggedTools).toContain('memory.search');
  });

  it('is disabled when getter returns empty array', () => {
    const stage = new TelemetryStage(() => []);
    expect(stage.enabled(makeCtx())).toBe(false);
  });

  it('is enabled when there are flagged tools', () => {
    const stage = new TelemetryStage(() => [
      { tool: 'x', totalCalls: 10, successRate: 0.3, lastError: '' },
    ]);
    expect(stage.enabled(makeCtx())).toBe(true);
  });
});
