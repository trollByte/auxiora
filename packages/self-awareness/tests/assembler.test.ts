import { describe, it, expect, vi } from 'vitest';
import { SelfAwarenessAssembler } from '../src/assembler.js';
import type { SignalCollector, CollectionContext, AwarenessSignal } from '../src/types.js';

function makeContext(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    chatId: 'chat-1',
    currentMessage: 'hello',
    recentMessages: [],
    ...overrides,
  };
}

function makeCollector(
  name: string,
  signals: AwarenessSignal[],
  opts?: { enabled?: boolean; delay?: number; throws?: boolean },
): SignalCollector {
  return {
    name,
    enabled: opts?.enabled ?? true,
    async collect() {
      if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
      if (opts?.throws) throw new Error('collector failed');
      return signals;
    },
  };
}

function sig(dimension: string, priority: number, text: string): AwarenessSignal {
  return { dimension, priority, text, data: {} };
}

describe('SelfAwarenessAssembler', () => {
  it('combines signals from multiple collectors', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('a', [sig('a', 0.5, 'Signal A')]),
      makeCollector('b', [sig('b', 0.7, 'Signal B')]),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Signal A');
    expect(result).toContain('Signal B');
  });

  it('sorts signals by priority (highest first)', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('low', [sig('low', 0.2, 'Low priority')]),
      makeCollector('high', [sig('high', 0.9, 'High priority')]),
    ]);
    const result = await assembler.assemble(makeContext());
    const highIdx = result.indexOf('High priority');
    const lowIdx = result.indexOf('Low priority');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('respects token budget by dropping low-priority signals', async () => {
    const longText = 'X'.repeat(2000);
    const assembler = new SelfAwarenessAssembler(
      [
        makeCollector('big', [sig('big', 0.3, longText)]),
        makeCollector('small', [sig('small', 0.9, 'Important')]),
      ],
      { tokenBudget: 100 },
    );
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Important');
    expect(result).not.toContain(longText);
  });

  it('skips disabled collectors', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('on', [sig('on', 0.5, 'Enabled')]),
      makeCollector('off', [sig('off', 0.5, 'Disabled')], { enabled: false }),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Enabled');
    expect(result).not.toContain('Disabled');
  });

  it('gracefully handles collector failures', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('good', [sig('good', 0.5, 'Works')]),
      makeCollector('bad', [], { throws: true }),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Works');
  });

  it('times out slow collectors', async () => {
    const assembler = new SelfAwarenessAssembler(
      [
        makeCollector('fast', [sig('fast', 0.5, 'Quick')]),
        makeCollector('slow', [sig('slow', 0.9, 'Took too long')], { delay: 500 }),
      ],
      { collectorTimeoutMs: 100 },
    );
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Quick');
    expect(result).not.toContain('Took too long');
  });

  it('returns empty string when no collectors are enabled', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('off', [sig('off', 0.5, 'Nope')], { enabled: false }),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toBe('');
  });

  it('returns empty string with no collectors', async () => {
    const assembler = new SelfAwarenessAssembler([]);
    const result = await assembler.assemble(makeContext());
    expect(result).toBe('');
  });

  it('runs afterResponse on all collectors with the hook', async () => {
    const afterSpy = vi.fn().mockResolvedValue(undefined);
    const collector: SignalCollector = {
      name: 'tracked',
      enabled: true,
      async collect() { return []; },
      afterResponse: afterSpy,
    };
    const assembler = new SelfAwarenessAssembler([collector]);
    await assembler.afterResponse({
      ...makeContext(),
      response: 'hello',
      responseTime: 100,
      tokensUsed: { input: 10, output: 20 },
    });
    expect(afterSpy).toHaveBeenCalledOnce();
  });

  it('afterResponse does not throw if a collector fails', async () => {
    const collector: SignalCollector = {
      name: 'broken',
      enabled: true,
      async collect() { return []; },
      async afterResponse() { throw new Error('boom'); },
    };
    const assembler = new SelfAwarenessAssembler([collector]);
    await expect(
      assembler.afterResponse({
        ...makeContext(),
        response: 'hi',
        responseTime: 50,
        tokensUsed: { input: 5, output: 10 },
      }),
    ).resolves.not.toThrow();
  });
});
