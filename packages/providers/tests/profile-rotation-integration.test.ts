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
    complete: vi.fn().mockResolvedValue({ content: 'ok', usage: { inputTokens: 10, outputTokens: 20 } }),
    stream: vi.fn(),
    setActiveKey: vi.fn(),
  };
}

describe('Profile Rotation — Integration', () => {
  beforeEach(() => {
    resetAllProfileCooldowns();
  });

  it('full rotation: key-A rate-limited, key-B succeeds, key-A in cooldown', async () => {
    const underlying = mockProvider('anthropic');
    (underlying.complete as any)
      .mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 }))
      .mockResolvedValue({ content: 'success', usage: { inputTokens: 10, outputTokens: 20 } });

    const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);
    const result = await rotator.complete([], {});

    expect(result.content).toBe('success');
    expect(isProfileInCooldown('anthropic', 0)).toBe(true);
    expect(isProfileInCooldown('anthropic', 1)).toBe(false);
  });

  it('cooldown persists: second call skips cooled key', async () => {
    const underlying = mockProvider('anthropic');
    const keysUsed: string[] = [];
    (underlying.setActiveKey as any).mockImplementation((key: string) => keysUsed.push(key));
    (underlying.complete as any)
      .mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 }))
      .mockResolvedValue({ content: 'ok', usage: { inputTokens: 10, outputTokens: 20 } });

    const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);

    // First call: tries key-A (fails), then key-B (succeeds)
    await rotator.complete([], {});
    keysUsed.length = 0;

    // Second call: key-A in cooldown, goes straight to key-B
    await rotator.complete([], {});
    expect(keysUsed).toEqual(['key-B']);
  });

  it('billing cooldown: key stays in cooldown for extended period', async () => {
    vi.useFakeTimers();
    const underlying = mockProvider('anthropic');
    (underlying.complete as any)
      .mockRejectedValueOnce(Object.assign(new Error('Billing'), { status: 402 }))
      .mockResolvedValue({ content: 'ok', usage: { inputTokens: 10, outputTokens: 20 } });

    const rotator = new ProfileRotator(underlying, ['key-A', 'key-B']);
    await rotator.complete([], {});

    // After 1 hour, key-A still in cooldown (billing = 5h)
    vi.advanceTimersByTime(3600_000);
    expect(isProfileInCooldown('anthropic', 0)).toBe(true);

    // After 5 hours + 1s, key-A exits cooldown
    vi.advanceTimersByTime(14401_000);
    expect(isProfileInCooldown('anthropic', 0)).toBe(false);

    vi.useRealTimers();
  });

  it('streaming rotation: pre-chunk failure rotates key', async () => {
    const underlying = mockProvider('anthropic');
    let streamCall = 0;
    (underlying.stream as any).mockImplementation(() => {
      streamCall++;
      if (streamCall === 1) {
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
    expect(isProfileInCooldown('anthropic', 0)).toBe(true);
  });
});
