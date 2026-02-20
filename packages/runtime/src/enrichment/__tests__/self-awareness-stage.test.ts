import { describe, it, expect, vi } from 'vitest';
import { SelfAwarenessStage } from '../stages/self-awareness-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
    userMessage: 'tell me about yourself',
    history: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: { agent: { personality: 'the-architect' } } as any,
    ...overrides,
  };
}

function makeMockAssembler(returnValue: string | null = 'You tend to prefer concise answers.') {
  return {
    assemble: vi.fn().mockResolvedValue(returnValue),
  };
}

describe('SelfAwarenessStage', () => {
  it('appends awareness fragment to prompt', async () => {
    const assembler = makeMockAssembler('You tend to prefer concise answers.');
    const stage = new SelfAwarenessStage(assembler);
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toContain('current prompt');
    expect(result.prompt).toContain('[Dynamic Self-Awareness]');
    expect(result.prompt).toContain('You tend to prefer concise answers.');
    expect(assembler.assemble).toHaveBeenCalledWith({
      userId: 'u1',
      sessionId: 's1',
      chatId: 'c1',
      currentMessage: 'tell me about yourself',
      recentMessages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    });
  });

  it('returns unchanged prompt when assembler returns null', async () => {
    const assembler = makeMockAssembler(null);
    const stage = new SelfAwarenessStage(assembler);
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toBe('current prompt');
  });

  it('returns unchanged prompt when assembler returns empty string', async () => {
    const assembler = makeMockAssembler('');
    const stage = new SelfAwarenessStage(assembler);
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toBe('current prompt');
  });

  it('is always enabled', () => {
    const assembler = makeMockAssembler();
    const stage = new SelfAwarenessStage(assembler);
    const ctx = makeCtx();

    expect(stage.enabled(ctx)).toBe(true);
  });

  it('has order 400', () => {
    const assembler = makeMockAssembler();
    const stage = new SelfAwarenessStage(assembler);

    expect(stage.order).toBe(400);
  });
});
