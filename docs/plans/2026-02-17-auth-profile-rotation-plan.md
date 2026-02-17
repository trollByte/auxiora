# Auth Profile Rotation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add within-provider API key rotation with round-robin selection and per-key cooldown tracking (standard + billing backoff).

**Architecture:** A `ProfileRotator` class wraps providers that have multiple API keys, implementing the `Provider` interface transparently. Per-key cooldown in `profile-cooldown.ts` uses the same exponential backoff pattern as provider-cooldown but adds billing-specific longer backoff. The `ProviderFactory` auto-wraps providers when `apiKeys.length > 1`.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest, `@auxiora/logger` for logging.

---

## Codebase Context

**Provider interface** (`packages/providers/src/types.ts:102-111`):
```typescript
interface Provider {
  name: string;
  readonly defaultModel: string;
  metadata: ProviderMetadata;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: ChatMessage[], options?: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;
}
```

**ProviderConfig** (`packages/providers/src/types.ts:113-173`): Each provider has a single `apiKey: string`. We're adding optional `apiKeys?: string[]` alongside.

**AnthropicProvider** (`packages/providers/src/anthropic.ts:197-236`): Constructor creates `Anthropic` client with `apiKey` or OAuth token. The client is stored as `private client: Anthropic` (line 179). To change keys, we need to recreate the client.

**OpenAIProvider** (`packages/providers/src/openai.ts:108-114`): Constructor creates `OpenAI` client with `apiKey`. Stored as `private client: OpenAI` (line 104).

**ProviderFactory** (`packages/providers/src/factory.ts:25-142`): Initializes providers from config, stores in `Map<string, Provider>`.

**Existing failover** (`packages/providers/src/`): `failover-error.ts` (error classification), `provider-cooldown.ts` (exponential backoff), `model-failover.ts` (cross-provider failover). All barrel-exported from `index.ts`.

---

## Task 1: Per-Profile Cooldown

**Files:**
- Create: `packages/providers/src/profile-cooldown.ts`
- Create: `packages/providers/tests/profile-cooldown.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/profile-cooldown.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isProfileInCooldown,
  markProfileCooldown,
  clearProfileCooldown,
  shouldProbeProfile,
  recordProfileProbeResult,
  resetAllProfileCooldowns,
} from '../src/profile-cooldown.js';

describe('Profile Cooldown', () => {
  beforeEach(() => {
    resetAllProfileCooldowns();
    vi.restoreAllMocks();
  });

  describe('markProfileCooldown & isProfileInCooldown', () => {
    it('should mark profile as in cooldown', () => {
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
    });

    it('should track profiles independently', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      expect(isProfileInCooldown('anthropic', 1)).toBe(false);
    });

    it('should auto-expire standard cooldown after duration', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);

      // First failure = 60s cooldown
      vi.advanceTimersByTime(61_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
      vi.useRealTimers();
    });

    it('should apply exponential backoff on consecutive failures', () => {
      vi.useFakeTimers();

      // 1st: 60s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(61_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 2nd: 300s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(301_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 3rd: 1500s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(1501_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 4th: capped at 3600s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(3599_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('billing backoff', () => {
    it('should apply longer cooldown for billing errors', () => {
      vi.useFakeTimers();

      // 1st billing failure: 5 hours (18000s)
      markProfileCooldown('anthropic', 0, 'billing');
      vi.advanceTimersByTime(17999_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 2nd billing failure: 15 hours (54000s)
      markProfileCooldown('anthropic', 0, 'billing');
      vi.advanceTimersByTime(53999_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 3rd: capped at 24 hours (86400s)
      markProfileCooldown('anthropic', 0, 'billing');
      vi.advanceTimersByTime(86399_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('clearProfileCooldown', () => {
    it('should clear cooldown and reset failure count', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      clearProfileCooldown('anthropic', 0);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
    });

    it('should be safe to clear non-existent profile', () => {
      expect(() => clearProfileCooldown('nonexistent', 99)).not.toThrow();
    });
  });

  describe('shouldProbeProfile', () => {
    it('should return false when not in cooldown', () => {
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);
    });

    it('should return true when cooldown expiry is within 2 minutes', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit'); // 60s cooldown
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);
      vi.useRealTimers();
    });

    it('should throttle probes to once per 30 seconds', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);

      recordProfileProbeResult('anthropic', 0, false);

      vi.advanceTimersByTime(15_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);

      vi.advanceTimersByTime(16_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);
      vi.useRealTimers();
    });

    it('should not probe when cooldown expiry is far away', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'billing'); // 5 hours
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('recordProfileProbeResult', () => {
    it('should clear cooldown on success', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      recordProfileProbeResult('anthropic', 0, true);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
    });

    it('should extend cooldown on failure', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit'); // 60s
      recordProfileProbeResult('anthropic', 0, false); // extends as 2nd failure -> 300s

      vi.advanceTimersByTime(61_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('resetAllProfileCooldowns', () => {
    it('should clear all profile cooldowns', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      markProfileCooldown('openai', 1, 'billing');
      resetAllProfileCooldowns();
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
      expect(isProfileInCooldown('openai', 1)).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/profile-cooldown.test.ts`
Expected: FAIL — module not found

**Step 3: Implement profile cooldown**

Create `packages/providers/src/profile-cooldown.ts`:

```typescript
/**
 * Per-profile cooldown tracking with exponential backoff.
 *
 * Extends the same pattern as provider-cooldown.ts but keyed by
 * provider:keyIndex and with special billing backoff.
 */

import type { FailoverReason } from './failover-error.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileCooldownEntry {
  provider: string;
  keyIndex: number;
  reason: FailoverReason;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastProbeAt: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level state                                                 */
/* ------------------------------------------------------------------ */

const cooldowns: Map<string, ProfileCooldownEntry> = new Map();

function profileKey(provider: string, keyIndex: number): string {
  return `${provider}:${keyIndex}`;
}

/* ------------------------------------------------------------------ */
/*  Backoff formulas                                                   */
/* ------------------------------------------------------------------ */

/** Standard backoff: min(60 * 5^(failures-1), 3600) seconds. */
function standardBackoffMs(failures: number): number {
  return Math.min(60 * Math.pow(5, failures - 1), 3600) * 1000;
}

/** Billing backoff: min(18000 * 3^(failures-1), 86400) seconds. */
function billingBackoffMs(failures: number): number {
  return Math.min(18000 * Math.pow(3, failures - 1), 86400) * 1000;
}

function computeCooldownMs(failures: number, reason: FailoverReason): number {
  return reason === 'billing' ? billingBackoffMs(failures) : standardBackoffMs(failures);
}

/** Two-minute probe window threshold in milliseconds. */
const PROBE_WINDOW_MS = 2 * 60 * 1000;

/** Minimum interval between probes in milliseconds. */
const PROBE_THROTTLE_MS = 30 * 1000;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function isProfileInCooldown(provider: string, keyIndex: number): boolean {
  const entry = cooldowns.get(profileKey(provider, keyIndex));
  if (!entry) return false;
  if (Date.now() >= entry.cooldownUntil) return false;
  return true;
}

export function markProfileCooldown(
  provider: string,
  keyIndex: number,
  reason: FailoverReason,
): void {
  const key = profileKey(provider, keyIndex);
  const existing = cooldowns.get(key);
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  const durationMs = computeCooldownMs(failures, reason);

  cooldowns.set(key, {
    provider,
    keyIndex,
    reason,
    cooldownUntil: Date.now() + durationMs,
    consecutiveFailures: failures,
    lastProbeAt: existing?.lastProbeAt ?? 0,
  });
}

export function clearProfileCooldown(provider: string, keyIndex: number): void {
  cooldowns.delete(profileKey(provider, keyIndex));
}

export function shouldProbeProfile(provider: string, keyIndex: number): boolean {
  const entry = cooldowns.get(profileKey(provider, keyIndex));
  if (!entry) return false;

  const now = Date.now();
  if (now >= entry.cooldownUntil) return false;

  const remaining = entry.cooldownUntil - now;
  if (remaining > PROBE_WINDOW_MS) return false;
  if (now - entry.lastProbeAt < PROBE_THROTTLE_MS) return false;

  return true;
}

export function recordProfileProbeResult(
  provider: string,
  keyIndex: number,
  success: boolean,
): void {
  if (success) {
    cooldowns.delete(profileKey(provider, keyIndex));
    return;
  }

  const key = profileKey(provider, keyIndex);
  const entry = cooldowns.get(key);
  if (!entry) return;

  const failures = entry.consecutiveFailures + 1;
  const durationMs = computeCooldownMs(failures, entry.reason);

  cooldowns.set(key, {
    ...entry,
    cooldownUntil: Date.now() + durationMs,
    consecutiveFailures: failures,
    lastProbeAt: Date.now(),
  });
}

/** Clear all profile cooldowns. Primarily for testing. */
export function resetAllProfileCooldowns(): void {
  cooldowns.clear();
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/profile-cooldown.test.ts`
Expected: PASS (all 14 tests)

**Step 5: Commit**

```bash
git add packages/providers/src/profile-cooldown.ts packages/providers/tests/profile-cooldown.test.ts
git commit -m "feat(providers): add per-profile cooldown with billing backoff"
```

---

## Task 2: Provider setActiveKey Support

**Files:**
- Modify: `packages/providers/src/anthropic.ts:197-236`
- Modify: `packages/providers/src/openai.ts:108-114`
- Modify: `packages/providers/src/google.ts` (constructor)
- Modify: `packages/providers/src/groq.ts` (constructor)
- Modify: `packages/providers/src/deepseek.ts` (constructor)
- Modify: `packages/providers/src/cohere.ts` (constructor)
- Modify: `packages/providers/src/xai.ts` (constructor)
- Create: `packages/providers/tests/set-active-key.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/set-active-key.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../src/anthropic.js';
import { OpenAIProvider } from '../src/openai.js';

describe('setActiveKey', () => {
  it('should exist on AnthropicProvider', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-test-key-1' });
    expect(typeof provider.setActiveKey).toBe('function');
  });

  it('should exist on OpenAIProvider', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test-key-1' });
    expect(typeof provider.setActiveKey).toBe('function');
  });

  it('should not throw when setting a new key on AnthropicProvider', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-test-key-1' });
    expect(() => provider.setActiveKey('sk-test-key-2')).not.toThrow();
  });

  it('should not throw when setting a new key on OpenAIProvider', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test-key-1' });
    expect(() => provider.setActiveKey('sk-test-key-2')).not.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/set-active-key.test.ts`
Expected: FAIL — `setActiveKey` is not a function

**Step 3: Add setActiveKey to providers**

In `packages/providers/src/anthropic.ts`, add this method to `AnthropicProvider` class (after the constructor, around line 236):

```typescript
  /**
   * Switch the active API key. Recreates the Anthropic client.
   * Used by ProfileRotator for key rotation.
   */
  setActiveKey(apiKey: string): void {
    this.authMode = 'api-key';
    this.client = new Anthropic({ apiKey });
  }
```

In `packages/providers/src/openai.ts`, add this method to `OpenAIProvider` class (after the constructor, around line 115):

```typescript
  /**
   * Switch the active API key. Recreates the OpenAI client.
   * Used by ProfileRotator for key rotation.
   */
  setActiveKey(apiKey: string): void {
    this.client = new OpenAI({
      apiKey,
      baseURL: this.client.baseURL,
    });
  }
```

For the remaining providers (`google.ts`, `groq.ts`, `deepseek.ts`, `cohere.ts`, `xai.ts`), add a similar `setActiveKey` method. Each recreates its SDK client with the new key. The pattern is the same — check each provider's constructor to see how the client is created, then add a method that recreates it with only the API key changed.

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/set-active-key.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add packages/providers/src/anthropic.ts packages/providers/src/openai.ts packages/providers/src/google.ts packages/providers/src/groq.ts packages/providers/src/deepseek.ts packages/providers/src/cohere.ts packages/providers/src/xai.ts packages/providers/tests/set-active-key.test.ts
git commit -m "feat(providers): add setActiveKey for API key rotation support"
```

---

## Task 3: ProviderConfig — apiKeys Array

**Files:**
- Modify: `packages/providers/src/types.ts:113-173`

**Step 1: Add apiKeys to ProviderConfig**

In `packages/providers/src/types.ts`, add `apiKeys?: string[]` to each provider config that has `apiKey`. Place it right after the existing `apiKey` field:

```typescript
export interface ProviderConfig {
  anthropic?: {
    apiKey?: string;
    apiKeys?: string[];  // Multiple keys for rotation
    oauthToken?: string;
    model?: string;
    maxTokens?: number;
    useCliCredentials?: boolean;
    onTokenRefresh?: () => Promise<string | null>;
    tokenExpiresAt?: number;
  };
  openai?: {
    apiKey?: string;      // Make optional (was required)
    apiKeys?: string[];   // Multiple keys for rotation
    model?: string;
    maxTokens?: number;
  };
  google?: {
    apiKey?: string;      // Make optional
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  // ... same pattern for groq, deepseek, cohere, xai
  // ollama and openaiCompatible don't need apiKeys (no multi-key use case)
  groq?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  replicate?: {
    apiToken?: string;
    apiTokens?: string[];
    model?: string;
    pollInterval?: number;
  };
  deepseek?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  cohere?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
  xai?: {
    apiKey?: string;
    apiKeys?: string[];
    model?: string;
    maxTokens?: number;
  };
}
```

Note: `apiKey` becomes optional on providers that now support `apiKeys`. At least one of `apiKey` or `apiKeys` must be provided. The factory handles resolution.

**Step 2: Run existing tests to verify nothing breaks**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/`
Expected: PASS (all existing tests still pass — we only added optional fields)

**Step 3: Commit**

```bash
git add packages/providers/src/types.ts
git commit -m "feat(providers): add apiKeys array to ProviderConfig for key rotation"
```

---

## Task 4: ProfileRotator

**Files:**
- Create: `packages/providers/src/profile-rotator.ts`
- Create: `packages/providers/tests/profile-rotator.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/profile-rotator.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/profile-rotator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ProfileRotator**

Create `packages/providers/src/profile-rotator.ts`:

```typescript
/**
 * ProfileRotator — wraps a Provider with multiple API keys for
 * within-provider key rotation.
 *
 * Implements Provider interface transparently. On each call:
 * 1. Selects the best key (round-robin by lastUsed, skip cooldown)
 * 2. Injects the key via setActiveKey()
 * 3. Delegates to the underlying provider
 * 4. On error: classifies, marks key cooldown, tries next key
 */

import { getLogger } from '@auxiora/logger';
import {
  coerceToFailoverError,
  FailoverError,
  isContextOverflow,
  isUserAbort,
} from './failover-error.js';
import {
  isProfileInCooldown,
  markProfileCooldown,
  clearProfileCooldown,
  shouldProbeProfile,
  recordProfileProbeResult,
} from './profile-cooldown.js';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const logger = getLogger('profile-rotator');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Provider that supports hot-swapping API keys. */
export interface RotatableProvider extends Provider {
  setActiveKey(key: string): void;
}

interface KeyState {
  index: number;
  key: string;
  lastUsed: number;
}

/* ------------------------------------------------------------------ */
/*  ProfileRotator                                                     */
/* ------------------------------------------------------------------ */

export class ProfileRotator implements Provider {
  readonly name: string;
  readonly defaultModel: string;
  readonly metadata: ProviderMetadata;

  private keys: KeyState[];

  constructor(
    private readonly underlying: RotatableProvider,
    apiKeys: string[],
  ) {
    if (apiKeys.length === 0) {
      throw new Error('ProfileRotator requires at least one API key');
    }
    this.name = underlying.name;
    this.defaultModel = underlying.defaultModel;
    this.metadata = underlying.metadata;
    this.keys = apiKeys.map((key, index) => ({ index, key, lastUsed: 0 }));
  }

  /**
   * Select the best available key: skip cooldown, sort by lastUsed (oldest first).
   * Returns null if all keys are in cooldown and not probe-eligible.
   */
  private selectKey(): KeyState | null {
    const available = this.keys
      .filter((k) => !isProfileInCooldown(this.name, k.index) || shouldProbeProfile(this.name, k.index))
      .sort((a, b) => a.lastUsed - b.lastUsed);

    return available[0] ?? null;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    let lastError: Error | undefined;
    const tried = new Set<number>();

    while (tried.size < this.keys.length) {
      const selected = this.selectKey();
      if (!selected || tried.has(selected.index)) break;
      tried.add(selected.index);

      this.underlying.setActiveKey(selected.key);
      selected.lastUsed = Date.now();

      try {
        const result = await this.underlying.complete(messages, options);
        clearProfileCooldown(this.name, selected.index);
        return result;
      } catch (err) {
        if (isUserAbort(err)) throw err;
        if (isContextOverflow(err)) throw err;

        const failoverErr = coerceToFailoverError(err, this.name, this.underlying.defaultModel);
        if (failoverErr) {
          markProfileCooldown(this.name, selected.index, failoverErr.reason);
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('Key failed, trying next', {
          provider: this.name,
          keyIndex: selected.index,
          reason: failoverErr?.reason ?? 'unknown',
        });
      }
    }

    throw lastError ?? new FailoverError('rate_limit', this.name, this.defaultModel, 'All keys exhausted');
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    let lastError: Error | undefined;
    const tried = new Set<number>();

    while (tried.size < this.keys.length) {
      const selected = this.selectKey();
      if (!selected || tried.has(selected.index)) break;
      tried.add(selected.index);

      this.underlying.setActiveKey(selected.key);
      selected.lastUsed = Date.now();

      let chunksYielded = false;

      try {
        const stream = this.underlying.stream(messages, options);
        for await (const chunk of stream) {
          chunksYielded = true;
          yield chunk;
        }
        clearProfileCooldown(this.name, selected.index);
        return;
      } catch (err) {
        if (isUserAbort(err)) throw err;
        if (isContextOverflow(err)) throw err;

        const failoverErr = coerceToFailoverError(err, this.name, this.underlying.defaultModel);
        if (failoverErr) {
          markProfileCooldown(this.name, selected.index, failoverErr.reason);
        }

        // Mid-stream: can't retry, yield error chunk
        if (chunksYielded) {
          yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
          return;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('Key stream failed, trying next', {
          provider: this.name,
          keyIndex: selected.index,
          reason: failoverErr?.reason ?? 'unknown',
        });
      }
    }

    throw lastError ?? new FailoverError('rate_limit', this.name, this.defaultModel, 'All keys exhausted (stream)');
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/profile-rotator.test.ts`
Expected: PASS (all 12 tests)

**Step 5: Commit**

```bash
git add packages/providers/src/profile-rotator.ts packages/providers/tests/profile-rotator.test.ts
git commit -m "feat(providers): add ProfileRotator for within-provider key rotation"
```

---

## Task 5: Factory Integration & Barrel Exports

**Files:**
- Modify: `packages/providers/src/factory.ts:30-96`
- Modify: `packages/providers/src/index.ts`
- Create: `packages/providers/tests/factory-rotation.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/factory-rotation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../src/factory.js';
import { ProfileRotator } from '../src/profile-rotator.js';

describe('ProviderFactory — key rotation wrapping', () => {
  it('should wrap provider with ProfileRotator when multiple keys', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKeys: ['key-1', 'key-2'] },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider).toBeInstanceOf(ProfileRotator);
  });

  it('should NOT wrap provider with single key', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKey: 'single-key' },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider).not.toBeInstanceOf(ProfileRotator);
  });

  it('should handle apiKey backward compat (treat as single-element array)', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKey: 'my-key' },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider.name).toBe('openai');
  });

  it('should prioritize apiKeys over apiKey', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKey: 'ignored', apiKeys: ['key-1', 'key-2'] },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider).toBeInstanceOf(ProfileRotator);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/factory-rotation.test.ts`
Expected: FAIL — ProfileRotator not used in factory

**Step 3: Update factory to wrap providers**

In `packages/providers/src/factory.ts`, add the import at the top:

```typescript
import { ProfileRotator } from './profile-rotator.js';
```

Then update each provider initialization block. For example, the OpenAI block (currently lines 45-47):

```typescript
// Before:
if (options.config.openai?.apiKey) {
  this.providers.set('openai', new OpenAIProvider(options.config.openai));
}

// After:
const openaiConfig = options.config.openai;
if (openaiConfig) {
  const keys = openaiConfig.apiKeys ?? (openaiConfig.apiKey ? [openaiConfig.apiKey] : []);
  if (keys.length > 0) {
    const provider = new OpenAIProvider({ ...openaiConfig, apiKey: keys[0]! });
    this.providers.set('openai', keys.length > 1
      ? new ProfileRotator(provider, keys)
      : provider
    );
  }
}
```

Apply the same pattern to Google, Groq, DeepSeek, Cohere, XAI. For Anthropic, the logic is slightly different because it has OAuth/CLI fallback — only wrap when there are multiple API keys (not OAuth).

For barrel exports, add to `packages/providers/src/index.ts`:

```typescript
export { ProfileRotator, type RotatableProvider } from './profile-rotator.js';
export {
  isProfileInCooldown,
  markProfileCooldown,
  clearProfileCooldown,
  shouldProbeProfile,
  recordProfileProbeResult,
  resetAllProfileCooldowns,
} from './profile-cooldown.js';
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/factory-rotation.test.ts`
Expected: PASS (all 4 tests)

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/`
Expected: PASS (all provider tests)

**Step 5: Commit**

```bash
git add packages/providers/src/factory.ts packages/providers/src/index.ts packages/providers/tests/factory-rotation.test.ts
git commit -m "feat(providers): wire ProfileRotator into factory with barrel exports"
```

---

## Task 6: Integration Tests

**Files:**
- Create: `packages/providers/tests/profile-rotation-integration.test.ts`

**Step 1: Write integration tests**

Create `packages/providers/tests/profile-rotation-integration.test.ts`:

```typescript
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
```

**Step 2: Run all tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/profile-rotation-integration.test.ts`
Expected: PASS (all 4 tests)

**Step 3: Run full project test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all 2,918+ tests)

**Step 4: Commit**

```bash
git add packages/providers/tests/profile-rotation-integration.test.ts
git commit -m "test(providers): add integration tests for auth profile rotation"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | Profile Cooldown | `profile-cooldown.test.ts` | 14 |
| 2 | setActiveKey | `set-active-key.test.ts` | 4 |
| 3 | ProviderConfig | (existing tests) | 0 |
| 4 | ProfileRotator | `profile-rotator.test.ts` | 12 |
| 5 | Factory + Exports | `factory-rotation.test.ts` | 4 |
| 6 | Integration Tests | `profile-rotation-integration.test.ts` | 4 |
| **Total** | | | **38** |
