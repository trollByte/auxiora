# Per-Account Streaming Config Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #15 (OpenClaw-inspired enhancement)

---

## Problem

Streaming/coalescing settings are global — all users on the same channel get the same typing delays and chunk sizes. Power users might want faster streaming, while casual users benefit from coalesced messages.

## Solution

Add per-account streaming overrides to `UserIdentity`, resolved at message delivery time. Override the DraftStreamLoop's throttle interval and chunk sizing per user.

## Architecture

### Changes to `packages/social/src/types.ts`

New interface:
```typescript
export interface StreamingOverrides {
  coalescingIdleMs?: number;    // Default: 1000ms
  minChunkChars?: number;       // Default: 800
  maxChunkChars?: number;       // Default: 1200
  typingDelayMs?: number;       // Default: 4000
}
```

Add `streamingOverrides?: StreamingOverrides` to `UserIdentity`.

### Changes to `packages/channels/src/draft-stream-loop.ts`

- Accept optional `StreamingOverrides` in constructor
- Use `coalescingIdleMs` for throttle interval instead of hardcoded 1000ms

### Changes to `packages/runtime/src/index.ts`

- When preparing to send a response, look up user's `streamingOverrides` from `UserManager`
- Pass overrides to the channel send/streaming path

### Changes to `packages/social/src/user-manager.ts`

- Add `updateStreamingOverrides(userId, overrides)` method

## Testing Strategy

1. Default overrides used when none set (~1 test)
2. Per-user overrides applied to DraftStreamLoop (~1 test)
3. Partial overrides merge with defaults (~1 test)
4. User manager stores and retrieves overrides (~1 test)

## Non-Goals

- No dashboard UI for editing streaming overrides (future enhancement)
- No per-channel-type overrides (only per-account)
- No real-time override changes during active stream
