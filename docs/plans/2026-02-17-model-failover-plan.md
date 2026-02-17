# Model Failover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic model failover with typed error classification, cooldown tracking with probe-during-cooldown, and streaming-aware fallback across all configured providers.

**Architecture:** Three new files in `packages/providers/src/`: `failover-error.ts` (typed errors), `provider-cooldown.ts` (cooldown + probing), `model-failover.ts` (fallback execution). Integration changes `executeWithTools()` to wrap `provider.stream()` with `streamWithModelFallback()`. `ProviderFactory` gains `resolveFallbackCandidates()`.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest, `node:crypto` for nothing (pure logic), `@auxiora/logger` for logging.

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

**StreamChunk** (`packages/providers/src/types.ts:47-57`):
```typescript
interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'done' | 'error';
  content?: string; toolUse?: ToolUse; error?: string; finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}
```

**ProviderFactory** (`packages/providers/src/factory.ts`): Has `getPrimaryProvider()`, `getFallbackProvider()`, `listAvailable()`, `getProvider(name)`.

**Barrel** (`packages/providers/src/index.ts`): Re-exports all providers, types, factory, thinking-levels, claude-oauth.

**Existing tests**: `packages/providers/tests/` has 4 test files.

**Runtime call site** (`packages/runtime/src/index.ts:2117`): `executeWithTools(sessionId, messages, prompt, provider, onChunk)` — provider is passed in, used at line 2417: `provider.stream(currentMessages, options)`.

**Existing error types** (`packages/errors/src/index.ts:219-257`): `ProviderError` with codes `E3001`-`E3006`.

---

## Task 1: FailoverError — Types and Classification

**Files:**
- Create: `packages/providers/src/failover-error.ts`
- Create: `packages/providers/tests/failover-error.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/failover-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  FailoverError,
  coerceToFailoverError,
  isContextOverflow,
  isUserAbort,
  isTimeoutError,
  type FailoverReason,
} from '../src/failover-error.js';

describe('FailoverError', () => {
  describe('constructor', () => {
    it('should create error with reason, provider, and model', () => {
      const err = new FailoverError('rate_limit', 'anthropic', 'claude-opus-4', 'Rate limited', 429);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(FailoverError);
      expect(err.reason).toBe('rate_limit');
      expect(err.provider).toBe('anthropic');
      expect(err.model).toBe('claude-opus-4');
      expect(err.message).toBe('Rate limited');
      expect(err.statusCode).toBe(429);
      expect(err.name).toBe('FailoverError');
    });

    it('should work without optional statusCode', () => {
      const err = new FailoverError('timeout', 'openai', 'gpt-4o', 'Timed out');
      expect(err.statusCode).toBeUndefined();
    });
  });

  describe('coerceToFailoverError', () => {
    it('should classify 429 as rate_limit', () => {
      const err = Object.assign(new Error('Too many requests'), { status: 429 });
      const result = coerceToFailoverError(err, 'anthropic', 'claude-opus-4');
      expect(result).not.toBeNull();
      expect(result!.reason).toBe('rate_limit');
    });

    it('should classify 402 as billing', () => {
      const err = Object.assign(new Error('Payment required'), { status: 402 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4o');
      expect(result).not.toBeNull();
      expect(result!.reason).toBe('billing');
    });

    it('should classify 401 as auth', () => {
      const err = Object.assign(new Error('Unauthorized'), { status: 401 });
      const result = coerceToFailoverError(err, 'google', 'gemini-2');
      expect(result).not.toBeNull();
      expect(result!.reason).toBe('auth');
    });

    it('should classify 403 as auth', () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      const result = coerceToFailoverError(err, 'anthropic', 'claude-opus-4');
      expect(result).not.toBeNull();
      expect(result!.reason).toBe('auth');
    });

    it('should classify 408 as timeout', () => {
      const err = Object.assign(new Error('Request timeout'), { status: 408 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4o');
      expect(result!.reason).toBe('timeout');
    });

    it('should classify 400 with context message as context_overflow', () => {
      const err = Object.assign(new Error('context_length_exceeded: max 200000 tokens'), { status: 400 });
      const result = coerceToFailoverError(err, 'anthropic', 'claude-opus-4');
      expect(result!.reason).toBe('context_overflow');
    });

    it('should classify 400 without context message as format', () => {
      const err = Object.assign(new Error('Invalid request body'), { status: 400 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4o');
      expect(result!.reason).toBe('format');
    });

    it('should classify by error code when no status', () => {
      const err = Object.assign(new Error('Limit reached'), { code: 'rate_limit_exceeded' });
      const result = coerceToFailoverError(err, 'anthropic', 'claude-opus-4');
      expect(result!.reason).toBe('rate_limit');
    });

    it('should classify by message pattern for quota', () => {
      const err = new Error('Your account has insufficient quota');
      const result = coerceToFailoverError(err, 'openai', 'gpt-4o');
      expect(result!.reason).toBe('billing');
    });

    it('should classify by message pattern for timeout', () => {
      const err = new Error('request timed out after 30000ms');
      const result = coerceToFailoverError(err, 'google', 'gemini-2');
      expect(result!.reason).toBe('timeout');
    });

    it('should classify by message pattern for token limit', () => {
      const err = new Error("This model's maximum context length is 128000 tokens");
      const result = coerceToFailoverError(err, 'openai', 'gpt-4o');
      expect(result!.reason).toBe('context_overflow');
    });

    it('should return null for unrecognizable errors', () => {
      const err = new Error('Something went wrong');
      const result = coerceToFailoverError(err, 'openai', 'gpt-4o');
      expect(result).toBeNull();
    });

    it('should handle non-Error objects', () => {
      const result = coerceToFailoverError('string error', 'openai', 'gpt-4o');
      expect(result).toBeNull();
    });
  });

  describe('isContextOverflow', () => {
    it('should detect context overflow errors', () => {
      const err = new FailoverError('context_overflow', 'anthropic', 'claude-opus-4', 'Too long');
      expect(isContextOverflow(err)).toBe(true);
    });

    it('should return false for non-overflow errors', () => {
      const err = new FailoverError('rate_limit', 'anthropic', 'claude-opus-4', 'Rate limited');
      expect(isContextOverflow(err)).toBe(false);
    });

    it('should detect from plain error with context message', () => {
      const err = new Error('context_length_exceeded');
      expect(isContextOverflow(err)).toBe(true);
    });

    it('should return false for unrelated errors', () => {
      expect(isContextOverflow(new Error('network failure'))).toBe(false);
    });
  });

  describe('isUserAbort', () => {
    it('should detect AbortError', () => {
      const err = new DOMException('Aborted', 'AbortError');
      expect(isUserAbort(err)).toBe(true);
    });

    it('should not treat timeout AbortError as user abort', () => {
      const err = Object.assign(new DOMException('Aborted', 'AbortError'), {
        cause: new Error('timeout'),
      });
      expect(isUserAbort(err)).toBe(false);
    });

    it('should not treat FailoverError as user abort', () => {
      const err = new FailoverError('timeout', 'openai', 'gpt-4o', 'Timed out');
      err.name = 'AbortError'; // someone sets this
      expect(isUserAbort(err)).toBe(false);
    });

    it('should return false for regular errors', () => {
      expect(isUserAbort(new Error('something'))).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('should detect by error name AbortError with timeout cause', () => {
      const err = Object.assign(new DOMException('Aborted', 'AbortError'), {
        cause: new Error('timeout'),
      });
      expect(isTimeoutError(err)).toBe(true);
    });

    it('should detect by message pattern', () => {
      expect(isTimeoutError(new Error('request timed out'))).toBe(true);
      expect(isTimeoutError(new Error('deadline exceeded'))).toBe(true);
      expect(isTimeoutError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return false for non-timeout errors', () => {
      expect(isTimeoutError(new Error('rate limited'))).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/failover-error.test.ts`
Expected: FAIL — module not found

**Step 3: Implement FailoverError**

Create `packages/providers/src/failover-error.ts`:

```typescript
/**
 * Typed failover error with reason classification.
 *
 * Enables smart fallback decisions: context overflow → rethrow (smaller
 * models won't help), rate limit → cooldown + next, etc.
 */

export type FailoverReason =
  | 'billing'
  | 'rate_limit'
  | 'auth'
  | 'timeout'
  | 'context_overflow'
  | 'format'
  | 'unknown';

export class FailoverError extends Error {
  readonly reason: FailoverReason;
  readonly provider: string;
  readonly model: string;
  readonly statusCode?: number;

  constructor(
    reason: FailoverReason,
    provider: string,
    model: string,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = 'FailoverError';
    this.reason = reason;
    this.provider = provider;
    this.model = model;
    this.statusCode = statusCode;
  }
}

// ── Context overflow patterns ────────────────────────────────────────

const CONTEXT_OVERFLOW_PATTERNS = [
  /context.{0,20}(length|limit|exceed|overflow)/i,
  /token.{0,20}(limit|exceed|maximum)/i,
  /maximum.{0,20}context/i,
  /too.{0,10}(long|many tokens)/i,
  /input.{0,10}too.{0,10}(long|large)/i,
];

const CONTEXT_OVERFLOW_CODES = new Set([
  'context_length_exceeded',
  'context_too_long',
  'max_tokens_exceeded',
  'string_above_max_length',
]);

// ── Timeout patterns ─────────────────────────────────────────────────

const TIMEOUT_PATTERNS = [
  /time[d\s_-]*out/i,
  /deadline.{0,10}exceeded/i,
  /ETIMEDOUT/,
  /ESOCKETTIMEDOUT/,
  /request.{0,10}aborted/i,
];

// ── Billing patterns ─────────────────────────────────────────────────

const BILLING_PATTERNS = [
  /insufficient.{0,10}(quota|funds|credits|balance)/i,
  /billing/i,
  /payment.{0,10}required/i,
  /account.{0,20}(suspended|deactivated)/i,
];

const BILLING_CODES = new Set([
  'insufficient_quota',
  'billing_not_active',
  'account_deactivated',
]);

// ── Rate limit patterns ──────────────────────────────────────────────

const RATE_LIMIT_CODES = new Set([
  'rate_limit_exceeded',
  'rate_limited',
  'too_many_requests',
  'overloaded',
]);

// ── Detection helpers ────────────────────────────────────────────────

function getStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.status === 'number') return obj.status;
    if (typeof obj.statusCode === 'number') return obj.statusCode;
  }
  return undefined;
}

function getCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.code === 'string') return obj.code;
    if (typeof obj.error_code === 'string') return obj.error_code;
  }
  return undefined;
}

function getMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function isContextOverflowMessage(message: string, code?: string): boolean {
  if (code && CONTEXT_OVERFLOW_CODES.has(code)) return true;
  return matchesAny(message, CONTEXT_OVERFLOW_PATTERNS);
}

// ── Public API ───────────────────────────────────────────────────────

export function coerceToFailoverError(
  err: unknown,
  provider: string,
  model: string,
): FailoverError | null {
  const status = getStatus(err);
  const code = getCode(err);
  const message = getMessage(err);

  // 1. Status code mapping
  if (status === 429) {
    return new FailoverError('rate_limit', provider, model, message, status);
  }
  if (status === 402) {
    return new FailoverError('billing', provider, model, message, status);
  }
  if (status === 401 || status === 403) {
    return new FailoverError('auth', provider, model, message, status);
  }
  if (status === 408) {
    return new FailoverError('timeout', provider, model, message, status);
  }
  if (status === 400) {
    if (isContextOverflowMessage(message, code)) {
      return new FailoverError('context_overflow', provider, model, message, status);
    }
    return new FailoverError('format', provider, model, message, status);
  }

  // 2. Error code patterns (no status)
  if (code && RATE_LIMIT_CODES.has(code)) {
    return new FailoverError('rate_limit', provider, model, message, status);
  }
  if (code && BILLING_CODES.has(code)) {
    return new FailoverError('billing', provider, model, message, status);
  }
  if (code && CONTEXT_OVERFLOW_CODES.has(code)) {
    return new FailoverError('context_overflow', provider, model, message, status);
  }

  // 3. Message pattern fallback
  if (matchesAny(message, BILLING_PATTERNS)) {
    return new FailoverError('billing', provider, model, message, status);
  }
  if (matchesAny(message, TIMEOUT_PATTERNS)) {
    return new FailoverError('timeout', provider, model, message, status);
  }
  if (isContextOverflowMessage(message, code)) {
    return new FailoverError('context_overflow', provider, model, message, status);
  }

  return null;
}

export function isContextOverflow(err: unknown): boolean {
  if (err instanceof FailoverError) return err.reason === 'context_overflow';
  return isContextOverflowMessage(getMessage(err), getCode(err));
}

export function isUserAbort(err: unknown): boolean {
  if (err instanceof FailoverError) return false;
  if (!(err instanceof Error)) return false;
  if (err.name !== 'AbortError') return false;
  // Exclude timeouts disguised as AbortErrors
  if (isTimeoutError(err)) return false;
  return true;
}

export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Check cause chain for timeout
  if (err.name === 'AbortError') {
    const cause = (err as any).cause;
    if (cause instanceof Error && matchesAny(cause.message, TIMEOUT_PATTERNS)) return true;
    if (typeof cause === 'string' && matchesAny(cause, TIMEOUT_PATTERNS)) return true;
  }
  return matchesAny(err.message, TIMEOUT_PATTERNS);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/failover-error.test.ts`
Expected: PASS (all 22 tests)

**Step 5: Commit**

```bash
git add packages/providers/src/failover-error.ts packages/providers/tests/failover-error.test.ts
git commit -m "feat(providers): add FailoverError with typed reason classification"
```

---

## Task 2: Provider Cooldown Tracking

**Files:**
- Create: `packages/providers/src/provider-cooldown.ts`
- Create: `packages/providers/tests/provider-cooldown.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/provider-cooldown.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isProviderInCooldown,
  markProviderCooldown,
  clearProviderCooldown,
  shouldProbe,
  recordProbeResult,
  resetAllCooldowns,
} from '../src/provider-cooldown.js';

describe('Provider Cooldown', () => {
  beforeEach(() => {
    resetAllCooldowns();
    vi.restoreAllMocks();
  });

  describe('markProviderCooldown & isProviderInCooldown', () => {
    it('should mark provider as in cooldown', () => {
      expect(isProviderInCooldown('anthropic')).toBe(false);
      markProviderCooldown('anthropic', 'rate_limit');
      expect(isProviderInCooldown('anthropic')).toBe(true);
    });

    it('should auto-expire cooldown after duration', () => {
      vi.useFakeTimers();
      markProviderCooldown('anthropic', 'rate_limit');
      expect(isProviderInCooldown('anthropic')).toBe(true);

      // First failure = 60s cooldown
      vi.advanceTimersByTime(61_000);
      expect(isProviderInCooldown('anthropic')).toBe(false);

      vi.useRealTimers();
    });

    it('should apply exponential backoff on consecutive failures', () => {
      vi.useFakeTimers();

      // 1st failure: 60s
      markProviderCooldown('anthropic', 'rate_limit');
      vi.advanceTimersByTime(59_000);
      expect(isProviderInCooldown('anthropic')).toBe(true);
      vi.advanceTimersByTime(2_000); // now at 61s
      expect(isProviderInCooldown('anthropic')).toBe(false);

      // 2nd failure: 300s (5 min)
      markProviderCooldown('anthropic', 'rate_limit');
      vi.advanceTimersByTime(299_000);
      expect(isProviderInCooldown('anthropic')).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProviderInCooldown('anthropic')).toBe(false);

      // 3rd failure: 1500s (25 min)
      markProviderCooldown('anthropic', 'rate_limit');
      vi.advanceTimersByTime(1499_000);
      expect(isProviderInCooldown('anthropic')).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProviderInCooldown('anthropic')).toBe(false);

      // 4th failure: capped at 3600s (1 hour)
      markProviderCooldown('anthropic', 'rate_limit');
      vi.advanceTimersByTime(3599_000);
      expect(isProviderInCooldown('anthropic')).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProviderInCooldown('anthropic')).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('clearProviderCooldown', () => {
    it('should clear cooldown and reset failure count', () => {
      markProviderCooldown('openai', 'rate_limit');
      expect(isProviderInCooldown('openai')).toBe(true);
      clearProviderCooldown('openai');
      expect(isProviderInCooldown('openai')).toBe(false);
    });

    it('should be safe to clear non-existent provider', () => {
      expect(() => clearProviderCooldown('nonexistent')).not.toThrow();
    });
  });

  describe('shouldProbe', () => {
    it('should return false when not in cooldown', () => {
      expect(shouldProbe('anthropic')).toBe(false);
    });

    it('should return true when cooldown expiry is within 2 minutes', () => {
      vi.useFakeTimers();
      markProviderCooldown('anthropic', 'rate_limit'); // 60s cooldown

      // At t=0, expiry is 60s away — within 2min window
      expect(shouldProbe('anthropic')).toBe(true);

      vi.useRealTimers();
    });

    it('should throttle probes to once per 30 seconds', () => {
      vi.useFakeTimers();
      markProviderCooldown('anthropic', 'rate_limit');

      expect(shouldProbe('anthropic')).toBe(true);
      // Simulate probe happened (recordProbeResult updates lastProbeAt)
      recordProbeResult('anthropic', false);

      // Within 30s — should not probe again
      vi.advanceTimersByTime(15_000);
      expect(shouldProbe('anthropic')).toBe(false);

      // After 30s — can probe again
      vi.advanceTimersByTime(16_000);
      expect(shouldProbe('anthropic')).toBe(true);

      vi.useRealTimers();
    });

    it('should not probe when cooldown expiry is far away', () => {
      vi.useFakeTimers();
      // Force a long cooldown (3rd failure = 1500s)
      markProviderCooldown('anthropic', 'rate_limit');
      clearProviderCooldown('anthropic');
      markProviderCooldown('anthropic', 'rate_limit');
      clearProviderCooldown('anthropic');
      markProviderCooldown('anthropic', 'rate_limit');
      // Now 3rd consecutive failure — but cleared in between resets count
      // Let's just mark 3 times without clearing
      resetAllCooldowns();
      markProviderCooldown('anthropic', 'rate_limit'); // 60s
      markProviderCooldown('anthropic', 'rate_limit'); // 300s
      markProviderCooldown('anthropic', 'rate_limit'); // 1500s

      // Cooldown is 1500s away — well beyond 2min window
      expect(shouldProbe('anthropic')).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('recordProbeResult', () => {
    it('should clear cooldown on success', () => {
      markProviderCooldown('anthropic', 'rate_limit');
      expect(isProviderInCooldown('anthropic')).toBe(true);
      recordProbeResult('anthropic', true);
      expect(isProviderInCooldown('anthropic')).toBe(false);
    });

    it('should extend cooldown on failure', () => {
      vi.useFakeTimers();
      markProviderCooldown('anthropic', 'rate_limit'); // 60s
      recordProbeResult('anthropic', false); // extends as 2nd failure → 300s

      vi.advanceTimersByTime(61_000);
      // Would have expired at 60s if not extended
      expect(isProviderInCooldown('anthropic')).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('resetAllCooldowns', () => {
    it('should clear all cooldowns', () => {
      markProviderCooldown('anthropic', 'rate_limit');
      markProviderCooldown('openai', 'billing');
      resetAllCooldowns();
      expect(isProviderInCooldown('anthropic')).toBe(false);
      expect(isProviderInCooldown('openai')).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/provider-cooldown.test.ts`
Expected: FAIL — module not found

**Step 3: Implement provider cooldown**

Create `packages/providers/src/provider-cooldown.ts`:

```typescript
/**
 * Per-provider cooldown tracking with exponential backoff and probe-during-cooldown.
 *
 * Module-level singleton — lives for the process lifetime.
 * Not persisted across restarts.
 */

import type { FailoverReason } from './failover-error.js';

interface CooldownEntry {
  provider: string;
  reason: FailoverReason;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastProbeAt: number;
}

const cooldowns = new Map<string, CooldownEntry>();

// Exponential backoff: min(60 * 5^(failures-1), 3600) seconds
const BASE_COOLDOWN_S = 60;
const BACKOFF_MULTIPLIER = 5;
const MAX_COOLDOWN_S = 3600;
const PROBE_THROTTLE_MS = 30_000;
const PROBE_WINDOW_MS = 120_000; // probe when expiry within 2 minutes

function computeCooldownMs(consecutiveFailures: number): number {
  const seconds = Math.min(
    BASE_COOLDOWN_S * Math.pow(BACKOFF_MULTIPLIER, consecutiveFailures - 1),
    MAX_COOLDOWN_S,
  );
  return seconds * 1000;
}

export function isProviderInCooldown(provider: string): boolean {
  const entry = cooldowns.get(provider);
  if (!entry) return false;
  if (Date.now() >= entry.cooldownUntil) {
    cooldowns.delete(provider);
    return false;
  }
  return true;
}

export function markProviderCooldown(provider: string, reason: FailoverReason): void {
  const existing = cooldowns.get(provider);
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  const duration = computeCooldownMs(failures);
  cooldowns.set(provider, {
    provider,
    reason,
    cooldownUntil: Date.now() + duration,
    consecutiveFailures: failures,
    lastProbeAt: 0,
  });
}

export function clearProviderCooldown(provider: string): void {
  cooldowns.delete(provider);
}

export function shouldProbe(provider: string): boolean {
  const entry = cooldowns.get(provider);
  if (!entry) return false; // not in cooldown — no need to probe

  const now = Date.now();
  const timeUntilExpiry = entry.cooldownUntil - now;

  // Only probe when expiry is within 2 minutes
  if (timeUntilExpiry > PROBE_WINDOW_MS) return false;

  // Throttle: once per 30 seconds
  if (now - entry.lastProbeAt < PROBE_THROTTLE_MS) return false;

  return true;
}

export function recordProbeResult(provider: string, success: boolean): void {
  if (success) {
    cooldowns.delete(provider);
    return;
  }
  const entry = cooldowns.get(provider);
  if (!entry) return;

  // Extend cooldown as another failure
  const failures = entry.consecutiveFailures + 1;
  const duration = computeCooldownMs(failures);
  entry.consecutiveFailures = failures;
  entry.cooldownUntil = Date.now() + duration;
  entry.lastProbeAt = Date.now();
}

/** Reset all cooldowns. Primarily for testing. */
export function resetAllCooldowns(): void {
  cooldowns.clear();
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/provider-cooldown.test.ts`
Expected: PASS (all 11 tests)

**Step 5: Commit**

```bash
git add packages/providers/src/provider-cooldown.ts packages/providers/tests/provider-cooldown.test.ts
git commit -m "feat(providers): add per-provider cooldown tracking with exponential backoff"
```

---

## Task 3: Model Failover — Core Functions

**Files:**
- Create: `packages/providers/src/model-failover.ts`
- Create: `packages/providers/tests/model-failover.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/model-failover.test.ts`:

```typescript
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
      // Put anthropic in cooldown
      const { markProviderCooldown } = await import('../src/provider-cooldown.js');
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
      const { markProviderCooldown } = await import('../src/provider-cooldown.js');
      markProviderCooldown('anthropic', 'rate_limit');
      const p1 = mockProvider('anthropic');

      // Manually clear to simulate probe success
      const { clearProviderCooldown } = await import('../src/provider-cooldown.js');
      clearProviderCooldown('anthropic');

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

    function makeStreamFn(chunks: StreamChunk[]): () => AsyncGenerator<StreamChunk> {
      return async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      };
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/model-failover.test.ts`
Expected: FAIL — module not found

**Step 3: Implement model failover**

Create `packages/providers/src/model-failover.ts`:

```typescript
/**
 * Model failover — execute with automatic fallback through candidate chain.
 *
 * Works for both complete() (Promise) and stream() (AsyncGenerator).
 * Streaming failover only retries pre-chunk errors; mid-stream failures
 * yield an error chunk (can't merge partial responses from different models).
 */

import { getLogger } from '@auxiora/logger';
import {
  FailoverError,
  coerceToFailoverError,
  isContextOverflow,
  isUserAbort,
} from './failover-error.js';
import {
  isProviderInCooldown,
  markProviderCooldown,
  clearProviderCooldown,
  shouldProbe,
  recordProbeResult,
} from './provider-cooldown.js';
import type { Provider, StreamChunk } from './types.js';

const logger = getLogger('failover');

// ── Types ────────────────────────────────────────────────────────────

export interface FallbackCandidate {
  provider: Provider;
  name: string;
  model: string;
}

export interface FallbackOptions {
  candidates: FallbackCandidate[];
  maxAttempts?: number;
}

export interface AttemptRecord {
  provider: string;
  model: string;
  error?: FailoverError;
  durationMs: number;
}

export interface FallbackResult<T> {
  result: T;
  attempts: AttemptRecord[];
  usedFallback: boolean;
}

// ── Non-Streaming Failover ───────────────────────────────────────────

export async function runWithModelFallback<T>(
  options: FallbackOptions,
  fn: (provider: Provider) => Promise<T>,
): Promise<FallbackResult<T>> {
  const { candidates, maxAttempts = candidates.length } = options;
  const attempts: AttemptRecord[] = [];
  let lastError: Error | undefined;

  for (let i = 0; i < Math.min(maxAttempts, candidates.length); i++) {
    const { provider, name, model } = candidates[i]!;

    // Skip providers in cooldown (unless probe-eligible)
    if (isProviderInCooldown(name) && !shouldProbe(name)) {
      logger.info('Skipping provider in cooldown', { provider: name });
      continue;
    }

    const start = Date.now();
    try {
      const result = await fn(provider);
      clearProviderCooldown(name);

      if (isProviderInCooldown(name)) {
        recordProbeResult(name, true);
      }

      attempts.push({ provider: name, model, durationMs: Date.now() - start });
      return { result, attempts, usedFallback: i > 0 };
    } catch (err) {
      const duration = Date.now() - start;

      // User abort — rethrow immediately
      if (isUserAbort(err)) throw err;

      // Context overflow — rethrow (smaller models won't help)
      if (isContextOverflow(err)) throw err;

      // Coerce to FailoverError for classification
      const failoverErr =
        err instanceof FailoverError
          ? err
          : coerceToFailoverError(err, name, model) ??
            new FailoverError('unknown', name, model, err instanceof Error ? err.message : String(err));

      attempts.push({ provider: name, model, error: failoverErr, durationMs: duration });

      // Mark cooldown for rate limits
      if (failoverErr.reason === 'rate_limit') {
        markProviderCooldown(name, failoverErr.reason);
      }

      // Record probe failure if we were probing
      if (shouldProbe(name)) {
        recordProbeResult(name, false);
      }

      lastError = failoverErr;
      logger.warn('Provider failed, trying next', {
        provider: name,
        model,
        reason: failoverErr.reason,
        attempt: i + 1,
      });
    }
  }

  throw lastError ?? new Error('No candidates available');
}

// ── Streaming Failover ───────────────────────────────────────────────

export async function* streamWithModelFallback(
  options: FallbackOptions,
  fn: (provider: Provider) => AsyncGenerator<StreamChunk, void, unknown>,
): AsyncGenerator<StreamChunk, void, unknown> {
  const { candidates, maxAttempts = candidates.length } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < Math.min(maxAttempts, candidates.length); i++) {
    const { provider, name, model } = candidates[i]!;

    // Skip providers in cooldown (unless probe-eligible)
    if (isProviderInCooldown(name) && !shouldProbe(name)) {
      logger.info('Skipping provider in cooldown (stream)', { provider: name });
      continue;
    }

    let chunksYielded = false;

    try {
      const stream = fn(provider);
      for await (const chunk of stream) {
        chunksYielded = true;
        yield chunk;
      }

      // Stream completed successfully
      clearProviderCooldown(name);
      return;
    } catch (err) {
      // User abort — rethrow immediately
      if (isUserAbort(err)) throw err;

      // Context overflow — rethrow (smaller models won't help)
      if (isContextOverflow(err)) throw err;

      // Mid-stream error — can't retry (chunks already sent to client)
      if (chunksYielded) {
        const failoverErr = coerceToFailoverError(err, name, model);
        if (failoverErr?.reason === 'rate_limit') {
          markProviderCooldown(name, failoverErr.reason);
        }
        yield {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        return;
      }

      // Pre-chunk error — can retry on next provider
      const failoverErr =
        err instanceof FailoverError
          ? err
          : coerceToFailoverError(err, name, model) ??
            new FailoverError('unknown', name, model, err instanceof Error ? err.message : String(err));

      if (failoverErr.reason === 'rate_limit') {
        markProviderCooldown(name, failoverErr.reason);
      }

      lastError = failoverErr;
      logger.warn('Provider stream failed, trying next', {
        provider: name,
        model,
        reason: failoverErr.reason,
        attempt: i + 1,
      });
    }
  }

  throw lastError ?? new Error('No candidates available for streaming');
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/model-failover.test.ts`
Expected: PASS (all 12 tests)

**Step 5: Commit**

```bash
git add packages/providers/src/model-failover.ts packages/providers/tests/model-failover.test.ts
git commit -m "feat(providers): add model failover with streaming support and cooldown"
```

---

## Task 4: ProviderFactory — resolveFallbackCandidates & Barrel Exports

**Files:**
- Modify: `packages/providers/src/factory.ts:98-142`
- Modify: `packages/providers/src/index.ts`
- Create: `packages/providers/tests/factory-candidates.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/factory-candidates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../src/factory.js';
import type { FallbackCandidate } from '../src/model-failover.js';

describe('ProviderFactory — resolveFallbackCandidates', () => {
  it('should return primary first, then fallback, then others', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      fallback: 'openai',
      config: {
        anthropic: { apiKey: 'sk-test-1' },
        openai: { apiKey: 'sk-test-2' },
        google: { apiKey: 'test-3' },
      },
    });

    const candidates = factory.resolveFallbackCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates[0]!.name).toBe('anthropic');
    expect(candidates[1]!.name).toBe('openai');
    // google should be in the list somewhere after
    expect(candidates.some((c) => c.name === 'google')).toBe(true);
  });

  it('should return only primary when no other providers configured', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      config: {
        anthropic: { apiKey: 'sk-test' },
      },
    });

    const candidates = factory.resolveFallbackCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.name).toBe('anthropic');
  });

  it('should deduplicate when fallback equals primary', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      fallback: 'anthropic',
      config: {
        anthropic: { apiKey: 'sk-test' },
      },
    });

    const candidates = factory.resolveFallbackCandidates();
    expect(candidates).toHaveLength(1);
  });

  it('should accept model override', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      config: {
        anthropic: { apiKey: 'sk-test' },
      },
    });

    const candidates = factory.resolveFallbackCandidates('claude-sonnet-4-5-20250929');
    expect(candidates[0]!.model).toBe('claude-sonnet-4-5-20250929');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/factory-candidates.test.ts`
Expected: FAIL — `resolveFallbackCandidates` not found

**Step 3: Add resolveFallbackCandidates to ProviderFactory**

In `packages/providers/src/factory.ts`, add this method after `listAvailable()` (after line 141):

```typescript
  resolveFallbackCandidates(modelOverride?: string): Array<{
    provider: Provider;
    name: string;
    model: string;
  }> {
    const seen = new Set<string>();
    const candidates: Array<{ provider: Provider; name: string; model: string }> = [];

    const add = (name: string) => {
      if (seen.has(name)) return;
      const provider = this.providers.get(name);
      if (!provider) return;
      seen.add(name);
      candidates.push({
        provider,
        name,
        model: modelOverride ?? provider.defaultModel,
      });
    };

    // 1. Primary first
    add(this.primary);

    // 2. Configured fallback
    if (this.fallback) add(this.fallback);

    // 3. All remaining available providers
    for (const name of this.providers.keys()) {
      add(name);
    }

    return candidates;
  }
```

Also add the import for `FallbackCandidate` type at the top of `factory.ts`:

```typescript
import type { FallbackCandidate } from './model-failover.js';
```

Wait — actually `resolveFallbackCandidates` returns an inline type matching `FallbackCandidate`, but importing from model-failover would create a circular concern. Keep the inline return type — it structurally matches `FallbackCandidate`.

**Step 4: Update barrel exports**

In `packages/providers/src/index.ts`, add these lines after the existing exports:

```typescript
export {
  FailoverError,
  coerceToFailoverError,
  isContextOverflow,
  isUserAbort,
  isTimeoutError,
  type FailoverReason,
} from './failover-error.js';
export {
  isProviderInCooldown,
  markProviderCooldown,
  clearProviderCooldown,
  shouldProbe,
  recordProbeResult,
  resetAllCooldowns,
} from './provider-cooldown.js';
export {
  runWithModelFallback,
  streamWithModelFallback,
  type FallbackCandidate,
  type FallbackOptions,
  type FallbackResult,
  type AttemptRecord,
} from './model-failover.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/factory-candidates.test.ts`
Expected: PASS (all 4 tests)

**Step 6: Run all provider tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/`
Expected: PASS (all existing tests still pass)

**Step 7: Commit**

```bash
git add packages/providers/src/factory.ts packages/providers/src/index.ts packages/providers/tests/factory-candidates.test.ts
git commit -m "feat(providers): add resolveFallbackCandidates and barrel exports for failover"
```

---

## Task 5: Runtime Integration — Wire Failover into executeWithTools

**Files:**
- Modify: `packages/runtime/src/index.ts:68,2394-2417`

**Step 1: Add import**

At `packages/runtime/src/index.ts`, near line 68 (after existing provider imports), add:

```typescript
import { streamWithModelFallback } from '@auxiora/providers';
```

Note: The runtime already imports from `@auxiora/providers` at line 3.

**Step 2: Change executeWithTools to accept ProviderFactory instead of single Provider**

The method signature at line 2394 currently takes `provider: import('@auxiora/providers').Provider`. We need to change the streaming call at line 2417 to use `streamWithModelFallback`.

**Option A (minimal change):** Keep the method signature but add a new parameter for candidates. Add to the `options` parameter:

At line 2394-2400, change the method signature:

```typescript
  private async executeWithTools(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    enrichedPrompt: string,
    provider: import('@auxiora/providers').Provider,
    onChunk: (type: string, data: any) => void,
    options?: {
      maxToolRounds?: number;
      tools?: Array<{ name: string; description: string; input_schema: any }>;
      fallbackCandidates?: Array<{ provider: import('@auxiora/providers').Provider; name: string; model: string }>;
    }
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
```

**Step 3: Replace the streaming call**

At line 2417, replace:
```typescript
      for await (const chunk of provider.stream(currentMessages as any, {
        systemPrompt: enrichedPrompt,
        tools: tools.length > 0 ? tools : undefined,
        passThroughAllTools: true,
      })) {
```

With:
```typescript
      const streamOptions = {
        systemPrompt: enrichedPrompt,
        tools: tools.length > 0 ? tools : undefined,
        passThroughAllTools: true,
      };

      const candidates = options?.fallbackCandidates ?? [
        { provider, name: provider.name, model: provider.defaultModel },
      ];

      for await (const chunk of streamWithModelFallback(
        { candidates },
        (p) => p.stream(currentMessages as any, streamOptions),
      )) {
```

**Step 4: Update call sites**

At line 2116, where `executeWithTools` is called, add the fallback candidates:

```typescript
      const fallbackCandidates = this.providers.resolveFallbackCandidates();
      const { response: fullResponse, usage } = await this.executeWithTools(
        session.id,
        chatMessages,
        enrichedPrompt,
        provider,
        (type, data) => { ... },
        { fallbackCandidates },
      );
```

Do the same for the other call sites at ~line 2672 (voice) and ~line 2914 (channels). Search for all `executeWithTools(` calls and add `fallbackCandidates` to the options.

**Step 5: Run all runtime tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/`
Expected: PASS (all 80 tests)

**Step 6: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire model failover into executeWithTools streaming"
```

---

## Task 6: Integration Tests

**Files:**
- Modify: `packages/providers/tests/model-failover.test.ts`

**Step 1: Add integration test scenarios**

Append to `packages/providers/tests/model-failover.test.ts`:

```typescript
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

    // First call: anthropic fails
    await runWithModelFallback(
      { candidates: [candidate(p1), candidate(p2)] },
      async (provider) => {
        if (provider.name === 'anthropic') {
          throw Object.assign(new Error('Rate limited'), { status: 429 });
        }
        return 'ok';
      },
    );

    // Second call: anthropic should be skipped (in cooldown)
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
```

**Step 2: Run all tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/providers/tests/model-failover.test.ts`
Expected: PASS (all 16 tests)

**Step 3: Run full project test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all 2,859+ tests)

**Step 4: Commit**

```bash
git add packages/providers/tests/model-failover.test.ts
git commit -m "test(providers): add integration tests for model failover scenarios"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | FailoverError | `failover-error.test.ts` | 22 |
| 2 | Provider Cooldown | `provider-cooldown.test.ts` | 11 |
| 3 | Model Failover | `model-failover.test.ts` | 12 |
| 4 | Factory + Exports | `factory-candidates.test.ts` | 4 |
| 5 | Runtime Integration | (existing tests) | 0 |
| 6 | Integration Tests | `model-failover.test.ts` (appended) | 4 |
| **Total** | | | **53** |
