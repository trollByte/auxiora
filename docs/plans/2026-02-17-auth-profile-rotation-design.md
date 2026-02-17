# Auth Profile Rotation Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw `src/agents/auth-profiles/` (~10 files)

---

## Problem

Auxiora supports only one API key per provider. If that key hits a rate limit, billing exhaustion, or auth failure, the entire provider becomes unavailable until the issue resolves. Users with multiple API keys (personal + work, multiple accounts for rate-limit distribution) have no way to use them. At $75/M output tokens for Claude Opus, a single rate-limited key blocks the user entirely when another key is available.

## Solution

Add a `ProfileRotator` class that wraps providers with multiple API keys, rotating through them with round-robin selection and per-key cooldown tracking. The rotator implements the `Provider` interface, so it's transparent to callers. Cross-provider failover (Anthropic -> OpenAI) is already handled by `model-failover.ts`; this adds within-provider key rotation.

## Architecture

### Module Location

`packages/providers/src/` — two new files, two modified:

| File | Purpose | ~Lines |
|------|---------|--------|
| `profile-rotator.ts` (new) | ProfileRotator class implementing Provider | ~180 |
| `profile-cooldown.ts` (new) | Per-profile cooldown with billing backoff | ~80 |
| `factory.ts` (modify) | Wrap providers with ProfileRotator when multiple keys | ~20 |
| `types.ts` (modify) | Add `apiKeys?: string[]` to provider configs | ~10 |

### Data Flow

```
Runtime calls provider.stream(messages, options)
  → ProfileRotator.stream() intercepts
    → Select best key: filter cooldown, sort by lastUsed, pick oldest
    → Inject key via provider.setActiveKey(selectedKey)
    → Delegate to underlying provider.stream()
    → On success: update lastUsed, clear cooldown
    → On error: classify via coerceToFailoverError
        → context_overflow/user_abort → rethrow immediately
        → rate_limit → mark key cooldown (standard backoff), try next key
        → billing → mark key cooldown (long backoff), try next key
        → auth/timeout/format → mark key cooldown (standard), try next key
    → If all keys exhausted: throw last error (model-failover tries next provider)
```

## ProfileRotator

### Class

```typescript
class ProfileRotator implements Provider {
  readonly name: string;
  readonly defaultModel: string;
  readonly metadata: ProviderMetadata;

  constructor(
    private underlying: Provider & { setActiveKey(key: string): void },
    private keys: string[],
  )
}
```

### Key Selection (round-robin)

Per-key in-memory state:

```typescript
interface KeyProfile {
  index: number;
  lastUsed: number;
  consecutiveFailures: number;
  cooldownUntil: number;
  lastProbeAt: number;
}
```

Selection algorithm:
1. Filter out keys in cooldown (unless probe-eligible)
2. Sort remaining by `lastUsed` ascending (oldest first)
3. Pick first available key
4. If no keys available, throw `FailoverError('rate_limit', ...)`

### Retry Within Provider

On `complete()` or `stream()`:
1. Select best key
2. Call `underlying.setActiveKey(key)`, then `underlying.stream()`
3. On success: update `lastUsed`, clear cooldown
4. On error: classify, mark cooldown, try next key
5. All keys exhausted: throw last error

Streaming retry follows the same rule as `streamWithModelFallback`: only retry pre-chunk errors. Once chunks are yielded, mid-stream failures yield an error chunk.

## Per-Profile Cooldown

### Standard Backoff (rate_limit, auth, timeout, format, unknown)

Formula: `min(60 * 5^(failures-1), 3600)` seconds.

- 1st failure: 60s
- 2nd: 300s (5 min)
- 3rd: 1500s (25 min)
- 4th+: 3600s (1 hour, capped)

### Billing Backoff (402 / insufficient_quota)

Formula: `min(18000 * 3^(failures-1), 86400)` seconds.

- 1st failure: 18000s (5 hours)
- 2nd: 54000s (15 hours)
- 3rd+: 86400s (24 hours, capped)

### Probe-During-Cooldown

Same mechanism as provider-level: 2-minute window before expiry, 30s throttle between probes.

### API

```typescript
isProfileInCooldown(provider: string, keyIndex: number): boolean
markProfileCooldown(provider: string, keyIndex: number, reason: FailoverReason): void
clearProfileCooldown(provider: string, keyIndex: number): void
shouldProbeProfile(provider: string, keyIndex: number): boolean
recordProfileProbeResult(provider: string, keyIndex: number, success: boolean): void
resetAllProfileCooldowns(): void  // for tests
```

State is ephemeral (in-memory Map), not persisted across restarts.

## Config Changes

### ProviderConfig

Add optional `apiKeys` array alongside existing `apiKey`:

```typescript
anthropic?: {
  apiKey?: string;       // single key (backward compat)
  apiKeys?: string[];    // multiple keys for rotation
  oauthToken?: string;
  // ... rest unchanged
};
```

Same pattern for `openai`, `google`, `groq`, `deepseek`, `cohere`, `xai`.

Resolution priority: `apiKeys` > `apiKey` > OAuth/CLI credentials.
If only `apiKey` is set, treated as `[apiKey]` (single-element array, no rotation overhead).

### Factory Changes

When initializing a provider:
- If resolved keys array has length > 1: wrap with `ProfileRotator`
- If length = 1 or OAuth: return provider directly (zero overhead)

### Provider Changes

Add `setActiveKey(key: string): void` to providers that use API keys. This updates the internal key used for requests. Providers that don't support multi-key (Ollama, OpenAI-compatible) ignore it.

## Integration

### Interaction with Model Failover

```
streamWithModelFallback (cross-provider)
  → candidates: [ProfileRotator<anthropic>, OpenAIProvider, GoogleProvider]
    → ProfileRotator<anthropic>.stream() (within-provider rotation)
      → tries key 0, fails (429) → cooldown, try key 1
      → tries key 1, fails (402) → billing cooldown, all keys exhausted
      → throws FailoverError
    → streamWithModelFallback catches, tries OpenAIProvider
      → succeeds
```

Two layers of resilience: within-provider key rotation + cross-provider failover.

### Runtime

No changes needed. `ProfileRotator` implements `Provider`.

## Testing Strategy

1. **Unit tests** for `profile-cooldown.ts` (standard backoff, billing backoff, probe eligibility)
2. **Unit tests** for `ProfileRotator` (round-robin selection, cooldown skip, key exhaustion, streaming retry, billing backoff)
3. **Unit tests** for `setActiveKey` on AnthropicProvider and OpenAIProvider
4. **Integration tests** with factory wrapping (single key = no wrapper, multiple keys = ProfileRotator)

## Non-Goals

- No persistence of rotation/cooldown state across restarts (ephemeral)
- No OAuth token rotation (single OAuth token per provider, existing refresh handles expiry)
- No UI for managing multiple keys (config-only for now)
- No cross-provider key sharing (each provider's keys are independent)
