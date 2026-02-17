# Model Failover Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw `src/agents/model-fallback.ts`, `src/agents/failover-error.ts`

---

## Problem

Auxiora's `ProviderFactory.withFallback()` only works for non-streaming calls. The runtime's `executeWithTools()` calls `provider.stream()` directly — if the provider fails, the whole request dies. No error classification, no retry on alternate providers, no cooldown tracking. At $75/M output tokens for Claude Opus, a single API outage can block the user entirely when a fallback provider is available.

## Solution

Add a 3-layer model failover system inside `packages/providers/src/`:

1. **FailoverError** — typed error with reason classification (billing/rate_limit/auth/timeout/context_overflow/format)
2. **Provider cooldown** — per-provider cooldown tracking with exponential backoff and probe-during-cooldown
3. **Model failover** — `runWithModelFallback()` and `streamWithModelFallback()` that try candidates in order

## Architecture

### Module Location

`packages/providers/src/` — three new files:

| File | Purpose | ~Lines |
|------|---------|--------|
| `failover-error.ts` | Typed error + classification functions | ~120 |
| `provider-cooldown.ts` | Per-provider cooldown tracking + probe logic | ~100 |
| `model-failover.ts` | Failover execution + candidate resolution | ~180 |

### Data Flow

```
Runtime calls streamWithModelFallback(candidates, fn)
  → For each candidate provider:
      → Check cooldown (skip if in cooldown, unless probe-eligible)
      → Execute fn(provider)
      → On success: return result + attempt history
      → On error: coerce to FailoverError
          → context_overflow → rethrow immediately
          → user_abort → rethrow immediately
          → rate_limit → mark cooldown, try next
          → billing/auth/timeout/format → try next
  → If all fail: throw last error with attempt history
```

## FailoverError

### Type

```typescript
type FailoverReason = 'billing' | 'rate_limit' | 'auth' | 'timeout' | 'context_overflow' | 'format' | 'unknown';

class FailoverError extends Error {
  readonly reason: FailoverReason;
  readonly provider: string;
  readonly model: string;
  readonly statusCode?: number;
}
```

### Error Classification (`coerceToFailoverError`)

Maps any provider error to a `FailoverError` using 3 strategies:

1. **Status code**: 402→billing, 429→rate_limit, 401/403→auth, 408→timeout, 400→format
2. **Error code patterns**: `insufficient_quota`, `rate_limit_exceeded`, `context_length_exceeded`, etc.
3. **Message patterns**: Regex fallback for "timeout", "timed out", "context.*exceed", "quota", etc.

### Special Error Detection

- **`isContextOverflow(error)`**: Status 400 + message containing "context", "token limit", or "too long". Rethrow — smaller models won't help.
- **`isUserAbort(error)`**: `error.name === 'AbortError'` excluding timeouts disguised as AbortErrors.
- **`isTimeoutError(error)`**: Name + message regex + cause chain inspection.

### Retryability Table

| Reason | Retry same? | Try next? |
|--------|------------|-----------|
| rate_limit | No (cooldown) | Yes |
| billing | No | Yes |
| auth | No | Yes |
| timeout | No | Yes |
| context_overflow | No | **No** (rethrow) |
| format | No | Yes |
| user_abort | No | **No** (rethrow) |

## Provider Cooldown

### State

Module-level singleton `Map<string, CooldownEntry>` keyed by provider name:

```typescript
interface CooldownEntry {
  provider: string;
  reason: FailoverReason;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastProbeAt: number;
}
```

### Exponential Backoff

Formula: `min(60 * 5^(failures-1), 3600)` seconds.

- 1st failure: 60s
- 2nd: 300s (5 min)
- 3rd: 1500s (25 min)
- 4th+: 3600s (1 hour, capped)

### Probe-During-Cooldown

1. If `cooldownUntil` has passed → remove entry, available
2. If `cooldownUntil` within 2 minutes AND `lastProbeAt` > 30s ago → allow probe
3. Probe succeeds → clear cooldown
4. Probe fails → extend cooldown, update `lastProbeAt`

### API

```typescript
isProviderInCooldown(provider: string): boolean
markProviderCooldown(provider: string, reason: FailoverReason): void
clearProviderCooldown(provider: string): void
shouldProbe(provider: string): boolean
recordProbeResult(provider: string, success: boolean): void
```

## Model Failover

### Types

```typescript
interface FallbackOptions {
  candidates: Array<{ provider: Provider; name: string; model: string }>;
  maxAttempts?: number;  // default: candidates.length
}

interface FallbackResult<T> {
  result: T;
  attempts: AttemptRecord[];
  usedFallback: boolean;
}

interface AttemptRecord {
  provider: string;
  model: string;
  error?: FailoverError;
  durationMs: number;
}
```

### Non-Streaming

```typescript
async function runWithModelFallback<T>(
  options: FallbackOptions,
  fn: (provider: Provider) => Promise<T>
): Promise<FallbackResult<T>>
```

### Streaming

```typescript
async function* streamWithModelFallback(
  options: FallbackOptions,
  fn: (provider: Provider) => AsyncGenerator<StreamChunk>
): AsyncGenerator<StreamChunk>
```

Streaming failover only retries if the error occurs **before any chunks are yielded**. Once chunks are sent, mid-stream failures yield an error chunk (can't merge partial responses from different models).

### Candidate Resolution

`resolveFallbackCandidates()` builds ordered list from:
1. Primary provider (from routing or config)
2. Configured fallback provider
3. All other available providers (sorted by capability)

Deduplication via `Set<"providerName/model">`.

## Integration

### Runtime Changes

In `executeWithTools()`, the streaming call changes:

```typescript
// Before
for await (const chunk of provider.stream(messages, options)) { ... }

// After
const candidates = this.providerFactory.resolveFallbackCandidates(routingResult);
for await (const chunk of streamWithModelFallback(
  { candidates },
  (p) => p.stream(messages, options)
)) { ... }
```

### ProviderFactory Changes

Add `resolveFallbackCandidates()` method to `ProviderFactory` that builds the candidate list from available providers.

### Exports

All new types and functions re-exported from `packages/providers/src/index.ts`.

## Testing Strategy

1. **Unit tests** for `FailoverError` classification (status codes, error codes, messages)
2. **Unit tests** for cooldown tracking (mark, check, expire, probe eligibility)
3. **Unit tests** for `runWithModelFallback` (success, single failure, chain failure, context overflow rethrow, abort rethrow)
4. **Unit tests** for `streamWithModelFallback` (pre-chunk failure retry, mid-stream failure no retry)
5. **Integration tests** with mock providers

## Non-Goals

- No multi-credential rotation per provider (single API key per provider for now)
- No image model failover (can be added later with same pattern)
- No automatic model downgrade based on context size (handled by router)
- No persistence of cooldown state across restarts (ephemeral, in-memory)
