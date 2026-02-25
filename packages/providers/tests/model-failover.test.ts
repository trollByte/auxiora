import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runWithModelFallback,
  streamWithModelFallback,
  type FallbackCandidate,
  type AttemptRecord,
} from '../src/model-failover.js';
import { FailoverError } from '../src/failover-error.js';
import { resetAllCooldowns, isProviderInCooldown } from '../src/provider-cooldown.js';
import type { Provider, StreamChunk } from '../src/types.js';

// Helper: create a mock provider
function mockProvider(name: string, model = 'test-model'): Provider {
  return {
    name,
    defaultModel: model,
    metadata: { name, displayName: name, models: {}, isAvailable: async () => true },
    complete: vi.fn(),
    stream: vi.fn(),
  };
}

function candidate(provider: Provider, model?: string): FallbackCandidate {
  return { provider, name: provider.name, model: model ?? provider.defaultModel };
}

describe('Model Failover', () => {
  beforeEach(() => {
    resetAllCooldowns();
  });

  describe('runWithModelFallback', () => {
    it('should succeed on first candidate', async () => {
      const p1 = mockProvider('anthropic');
      const result = await runWithModelFallback(
        { candidates: [candidate(p1)] },
        async () => 'success',
      );
      expect(result.result).toBe('success');
      expect(result.usedFallback).toBe(false);
      expect(result.attempts).toHaveLength(1);
    });

    it('should fall back to second candidate on error', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      let callCount = 0;
      const result = await runWithModelFallback(
        { candidates: [candidate(p1), candidate(p2)] },
        async (provider) => {
          callCount++;
          if (provider.name === 'anthropic') {
            throw Object.assign(new Error('Rate limited'), { status: 429 });
          }
          return 'fallback success';
        },
      );
      expect(result.result).toBe('fallback success');
      expect(result.usedFallback).toBe(true);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]!.error?.reason).toBe('rate_limit');
      expect(callCount).toBe(2);
    });

    it('should rethrow context_overflow without trying fallbacks', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      let callCount = 0;
      await expect(
        runWithModelFallback(
          { candidates: [candidate(p1), candidate(p2)] },
          async () => {
            callCount++;
            throw Object.assign(new Error('context_length_exceeded'), { status: 400 });
          },
        ),
      ).rejects.toThrow('context_length_exceeded');
      expect(callCount).toBe(1);
    });

    it('should rethrow user abort without trying fallbacks', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      await expect(
        runWithModelFallback(
          { candidates: [candidate(p1), candidate(p2)] },
          async () => {
            throw new DOMException('Aborted', 'AbortError');
          },
        ),
      ).rejects.toThrow();
    });

    it('should throw last error when all candidates fail', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      await expect(
        runWithModelFallback(
          { candidates: [candidate(p1), candidate(p2)] },
          async () => {
            throw Object.assign(new Error('Failed'), { status: 429 });
          },
        ),
      ).rejects.toThrow(FailoverError);
    });

    it('should skip providers in cooldown', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      // Put anthropic in cooldown with 2 consecutive failures so backoff
      // exceeds the 2-minute probe window (300s > 120s), making it NOT probe-eligible
      const { markProviderCooldown } = await import('../src/provider-cooldown.js');
      markProviderCooldown('anthropic', 'rate_limit');
      markProviderCooldown('anthropic', 'rate_limit');

      let calledProvider = '';
      const result = await runWithModelFallback(
        { candidates: [candidate(p1), candidate(p2)] },
        async (provider) => {
          calledProvider = provider.name;
          return 'success';
        },
      );
      expect(calledProvider).toBe('openai');
      expect(result.usedFallback).toBe(true);
    });

    it('should mark provider in cooldown after rate_limit error', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      await runWithModelFallback(
        { candidates: [candidate(p1), candidate(p2)] },
        async (provider) => {
          if (provider.name === 'anthropic') {
            throw Object.assign(new Error('Rate limited'), { status: 429 });
          }
          return 'ok';
        },
      );
      expect(isProviderInCooldown('anthropic')).toBe(true);
    });

    it('should clear cooldown on success', async () => {
      // Mark anthropic with a single failure (60s cooldown) — this is within the
      // 2-minute probe window, so shouldProbe returns true and the provider
      // will be attempted rather than skipped
      const { markProviderCooldown } = await import('../src/provider-cooldown.js');
      markProviderCooldown('anthropic', 'rate_limit');
      expect(isProviderInCooldown('anthropic')).toBe(true);

      const p1 = mockProvider('anthropic');
      const result = await runWithModelFallback(
        { candidates: [candidate(p1)] },
        async () => 'success',
      );
      expect(result.result).toBe('success');
      expect(isProviderInCooldown('anthropic')).toBe(false);
    });

    it('should handle unrecognizable errors by trying next candidate', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      const result = await runWithModelFallback(
        { candidates: [candidate(p1), candidate(p2)] },
        async (provider) => {
          if (provider.name === 'anthropic') {
            throw new Error('Something unknown went wrong');
          }
          return 'recovered';
        },
      );
      expect(result.result).toBe('recovered');
      expect(result.usedFallback).toBe(true);
    });
  });

  describe('streamWithModelFallback', () => {
    async function collectChunks(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
      const chunks: StreamChunk[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }
      return chunks;
    }

    it('should stream from first candidate on success', async () => {
      const p1 = mockProvider('anthropic');
      const expectedChunks: StreamChunk[] = [
        { type: 'text', content: 'Hello' },
        { type: 'done', finishReason: 'end_turn' },
      ];
      const chunks = await collectChunks(
        streamWithModelFallback(
          { candidates: [candidate(p1)] },
          () => (async function* () { for (const c of expectedChunks) yield c; })(),
        ),
      );
      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.content).toBe('Hello');
    });

    it('should fallback on pre-chunk error', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      let callCount = 0;
      const chunks = await collectChunks(
        streamWithModelFallback(
          { candidates: [candidate(p1), candidate(p2)] },
          (provider) => {
            callCount++;
            if (provider.name === 'anthropic') {
              // Error before any chunks
              return (async function* (): AsyncGenerator<StreamChunk> {
                throw Object.assign(new Error('Rate limited'), { status: 429 });
              })();
            }
            return (async function* () {
              yield { type: 'text' as const, content: 'From OpenAI' };
              yield { type: 'done' as const, finishReason: 'end_turn' };
            })();
          },
        ),
      );
      expect(callCount).toBe(2);
      expect(chunks.some((c) => c.content === 'From OpenAI')).toBe(true);
    });

    it('should NOT fallback on mid-stream error (chunks already yielded)', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      let p2Called = false;
      const chunks = await collectChunks(
        streamWithModelFallback(
          { candidates: [candidate(p1), candidate(p2)] },
          (provider) => {
            if (provider.name === 'openai') p2Called = true;
            return (async function* (): AsyncGenerator<StreamChunk> {
              yield { type: 'text', content: 'partial' };
              throw Object.assign(new Error('Connection reset'), { status: 429 });
            })();
          },
        ),
      );
      // Should have yielded partial text + error chunk
      expect(chunks.some((c) => c.content === 'partial')).toBe(true);
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(p2Called).toBe(false);
    });

    it('should rethrow context_overflow without trying fallbacks', async () => {
      const p1 = mockProvider('anthropic');
      const p2 = mockProvider('openai');
      const gen = streamWithModelFallback(
        { candidates: [candidate(p1), candidate(p2)] },
        () =>
          (async function* (): AsyncGenerator<StreamChunk> {
            throw Object.assign(new Error('context_length_exceeded'), { status: 400 });
          })(),
      );
      await expect(collectChunks(gen)).rejects.toThrow('context_length_exceeded');
    });
  });
});

describe('Model Failover — Integration Scenarios', () => {
  beforeEach(() => {
    resetAllCooldowns();
  });

  it('full chain: primary rate-limited, fallback succeeds', async () => {
    const p1 = mockProvider('anthropic');
    const p2 = mockProvider('openai');
    const p3 = mockProvider('google');

    const result = await runWithModelFallback(
      { candidates: [candidate(p1), candidate(p2), candidate(p3)] },
      async (provider) => {
        if (provider.name === 'anthropic') {
          throw Object.assign(new Error('Rate limited'), { status: 429 });
        }
        return `success from ${provider.name}`;
      },
    );

    expect(result.result).toBe('success from openai');
    expect(result.usedFallback).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(isProviderInCooldown('anthropic')).toBe(true);
    expect(isProviderInCooldown('openai')).toBe(false);
  });

  it('all providers fail, throws last error with all attempts', async () => {
    const p1 = mockProvider('anthropic');
    const p2 = mockProvider('openai');

    try {
      await runWithModelFallback(
        { candidates: [candidate(p1), candidate(p2)] },
        async (provider) => {
          throw Object.assign(new Error(`${provider.name} failed`), { status: 429 });
        },
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FailoverError);
      expect((err as FailoverError).provider).toBe('openai');
    }
  });

  it('streaming: primary fails pre-chunk, fallback streams successfully', async () => {
    const p1 = mockProvider('anthropic');
    const p2 = mockProvider('openai');

    const chunks: StreamChunk[] = [];
    for await (const chunk of streamWithModelFallback(
      { candidates: [candidate(p1), candidate(p2)] },
      (provider) => {
        if (provider.name === 'anthropic') {
          return (async function* (): AsyncGenerator<StreamChunk> {
            throw Object.assign(new Error('Service unavailable'), { status: 429 });
          })();
        }
        return (async function* () {
          yield { type: 'text' as const, content: 'Hello from fallback' };
          yield { type: 'done' as const, finishReason: 'end_turn' };
        })();
      },
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.content).toBe('Hello from fallback');
    expect(isProviderInCooldown('anthropic')).toBe(true);
  });

  it('cooldown persists across calls', async () => {
    const p1 = mockProvider('anthropic');
    const p2 = mockProvider('openai');

    // Mark anthropic with 2 consecutive failures so backoff (300s) exceeds the
    // 2-minute probe window — this ensures the provider is truly skipped rather
    // than probe-attempted.
    const { markProviderCooldown } = await import('../src/provider-cooldown.js');
    markProviderCooldown('anthropic', 'rate_limit');
    markProviderCooldown('anthropic', 'rate_limit');

    // First call: anthropic is in cooldown, openai succeeds
    await runWithModelFallback(
      { candidates: [candidate(p1), candidate(p2)] },
      async (provider) => {
        if (provider.name === 'anthropic') {
          throw Object.assign(new Error('Rate limited'), { status: 429 });
        }
        return 'ok';
      },
    );

    // Second call: anthropic should still be skipped (in cooldown)
    let anthropicCalled = false;
    await runWithModelFallback(
      { candidates: [candidate(p1), candidate(p2)] },
      async (provider) => {
        if (provider.name === 'anthropic') anthropicCalled = true;
        return 'ok';
      },
    );

    expect(anthropicCalled).toBe(false);
  });
});
