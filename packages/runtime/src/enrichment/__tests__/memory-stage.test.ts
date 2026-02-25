import { describe, it, expect, vi } from 'vitest';
import { MemoryStage } from '../stages/memory-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
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

describe('MemoryStage', () => {
  it('appends memory section to prompt when memories exist', async () => {
    const mockStore = { getAll: vi.fn().mockResolvedValue([{ text: 'mem1' }]) };
    const mockRetriever = { retrieve: vi.fn().mockReturnValue('\n\n[Memories]\n- mem1') };

    const stage = new MemoryStage(mockStore, mockRetriever);
    const result = await stage.enrich(makeCtx(), 'current prompt');

    expect(result.prompt).toContain('[Memories]');
    expect(result.prompt).toContain('current prompt');
    expect(mockRetriever.retrieve).toHaveBeenCalledWith([{ text: 'mem1' }], 'hello');
  });

  it('returns unchanged prompt when no memories found', async () => {
    const mockStore = { getAll: vi.fn().mockResolvedValue([]) };
    const mockRetriever = { retrieve: vi.fn().mockReturnValue(null) };

    const stage = new MemoryStage(mockStore, mockRetriever);
    const result = await stage.enrich(makeCtx(), 'current prompt');

    expect(result.prompt).toBe('current prompt');
  });

  it('is always enabled', () => {
    const stage = new MemoryStage({ getAll: vi.fn() } as any, { retrieve: vi.fn() } as any);
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('has order 100', () => {
    const stage = new MemoryStage({ getAll: vi.fn() } as any, { retrieve: vi.fn() } as any);
    expect(stage.order).toBe(100);
  });
});
