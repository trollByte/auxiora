import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileRotator } from '../src/profile-rotator.js';
import { resetAllProfileCooldowns, isProfileInCooldown } from '../src/profile-cooldown.js';
import type { Provider, ProviderMetadata, StreamChunk } from '../src/types.js';

interface RotatableProvider extends Provider {
  setActiveKey(key: string): void;
}

function mockProvider(name: string): RotatableProvider {
  return {
    name,
    defaultModel: 'test-model',
    metadata: { name, displayName: name, models: {}, isAvailable: async () => true } as ProviderMetadata,
    complete: vi.fn().mockResolvedValue({ content: 'response', usage: { inputTokens: 10, outputTokens: 20 } }),
    stream: vi.fn(),
    setActiveKey: vi.fn(),
  };
}

describe('ProfileRotator', () => {
  beforeEach(() => {
    resetAllProfileCooldowns();
  });

  describe('single key', () => {
    it('should delegate complete() to underlying provider', async () => {
      const underlying = mockProvider('anthropic');
      const rotator = new ProfileRotator(underlying, ['key-1']);

      const result = await rotator.complete([], {});
      expect(underlying.setActiveKey).toHaveBeenCalledWith('key-1');
      expect(underlying.complete).toHaveBeenCalled();
      expect(result.content).toBe('response');
    });
  });

  describe('round-robin selection', () => {
    it('should rotate keys by lastUsed', async () => {
      const underlying = mockProvider('anthropic');
      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B', 'key-C']);

      // First call uses key-A (oldest lastUsed = 0)
      await rotator.complete([], {});
      expect(underlying.setActiveKey).toHaveBeenLastCalledWith('key-A');

      // Second call uses key-B (key-A was just used)
      await rotator.complete([], {});
      expect(underlying.setActiveKey).toHaveBeenLastCalledWith('key-B');

      // Third call uses key-C
      await rotator.complete([], {});
      expect(underlying.setActiveKey).toHaveBeenLastCalledWith('key-C');

      // Fourth wraps around to key-A
      await rotator.complete([], {});
      expect(underlying.setActiveKey).toHaveBeenLastCalledWith('key-A');
    });
  });

  describe('cooldown skip', () => {
    it('should skip keys in cooldown', async () => {
      const underlying = mockProvider('anthropic');
      (underlying.complete as any)
        .mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 }))
        .mockResolvedValue({ content: 'ok', usage: { inputTokens: 10, outputTokens: 20 } });

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);

      // First call: key-A fails -> rotates to key-B within same call
      const result = await rotator.complete([], {});
      expect(result.content).toBe('ok');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);

      // Second call: key-A in cooldown, goes straight to key-B
      await rotator.complete([], {});
      expect(underlying.setActiveKey).toHaveBeenLastCalledWith('key-B');
    });
  });

  describe('all keys exhausted', () => {
    it('should throw when all keys fail', async () => {
      const underlying = mockProvider('anthropic');
      (underlying.complete as any).mockRejectedValue(
        Object.assign(new Error('Rate limited'), { status: 429 }),
      );

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);

      await expect(rotator.complete([], {})).rejects.toThrow('Rate limited');
    });
  });

  describe('context overflow rethrow', () => {
    it('should rethrow context_overflow without trying other keys', async () => {
      const underlying = mockProvider('anthropic');
      (underlying.complete as any).mockRejectedValue(
        Object.assign(new Error('context_length_exceeded'), { status: 400 }),
      );

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);

      await expect(rotator.complete([], {})).rejects.toThrow('context_length_exceeded');
      // Should have only tried once (no rotation for context overflow)
      expect(underlying.setActiveKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('user abort rethrow', () => {
    it('should rethrow user abort without trying other keys', async () => {
      const underlying = mockProvider('anthropic');
      (underlying.complete as any).mockRejectedValue(
        new DOMException('Aborted', 'AbortError'),
      );

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);

      await expect(rotator.complete([], {})).rejects.toThrow();
      expect(underlying.setActiveKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('constructor validation', () => {
    it('should throw on empty key array', () => {
      const underlying = mockProvider('anthropic');
      expect(() => new ProfileRotator(underlying, [])).toThrow('ProfileRotator requires at least one API key');
    });
  });

  describe('billing cooldown', () => {
    it('should mark billing errors with long cooldown', async () => {
      const underlying = mockProvider('anthropic');
      (underlying.complete as any)
        .mockRejectedValueOnce(Object.assign(new Error('Insufficient funds'), { status: 402 }))
        .mockResolvedValue({ content: 'ok', usage: { inputTokens: 10, outputTokens: 20 } });

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);
      await rotator.complete([], {});

      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
    });
  });

  describe('streaming', () => {
    it('should delegate stream() to underlying provider', async () => {
      const underlying = mockProvider('anthropic');
      const expectedChunks: StreamChunk[] = [
        { type: 'text', content: 'Hello' },
        { type: 'done', finishReason: 'end_turn' },
      ];
      (underlying.stream as any).mockReturnValue(
        (async function* () { for (const c of expectedChunks) yield c; })(),
      );

      const rotator = new ProfileRotator(underlying, ['key-1']);
      const chunks: StreamChunk[] = [];
      for await (const chunk of rotator.stream([], {})) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(underlying.setActiveKey).toHaveBeenCalledWith('key-1');
    });

    it('should retry on pre-chunk streaming error', async () => {
      const underlying = mockProvider('anthropic');
      let callCount = 0;
      (underlying.stream as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return (async function* (): AsyncGenerator<StreamChunk> {
            throw Object.assign(new Error('Rate limited'), { status: 429 });
          })();
        }
        return (async function* () {
          yield { type: 'text' as const, content: 'From key-B' };
          yield { type: 'done' as const, finishReason: 'end_turn' };
        })();
      });

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);
      const chunks: StreamChunk[] = [];
      for await (const chunk of rotator.stream([], {})) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.content === 'From key-B')).toBe(true);
      expect(callCount).toBe(2);
    });

    it('should NOT retry on mid-stream error', async () => {
      const underlying = mockProvider('anthropic');
      (underlying.stream as any).mockReturnValue(
        (async function* (): AsyncGenerator<StreamChunk> {
          yield { type: 'text', content: 'partial' };
          throw Object.assign(new Error('Connection reset'), { status: 429 });
        })(),
      );

      const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);
      const chunks: StreamChunk[] = [];
      for await (const chunk of rotator.stream([], {})) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.content === 'partial')).toBe(true);
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
    });
  });

  describe('Provider interface compliance', () => {
    it('should expose name, defaultModel, metadata from underlying', () => {
      const underlying = mockProvider('anthropic');
      const rotator = new ProfileRotator(underlying, ['key-1']);

      expect(rotator.name).toBe('anthropic');
      expect(rotator.defaultModel).toBe('test-model');
      expect(rotator.metadata).toBe(underlying.metadata);
    });
  });
});
