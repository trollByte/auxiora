# Inbound Message Deduplication Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw inbound-dedupe.ts patterns

---

## Problem

Webhook-based channel adapters (Telegram, WhatsApp, Teams, Twilio, GoogleChat, BlueBubbles, Zalo) have no deduplication. When a platform retries a webhook delivery (common on timeout or 5xx), Auxiora processes the same message twice, adds it to the session twice, and sends two replies.

## Solution

Add a TTL-based in-memory dedup cache in the channel manager. Every inbound message is checked against a composite key (`channelType|channelId|messageId`) before forwarding to the runtime. Duplicates are silently dropped with a debug log.

## Architecture

### Module Location

`packages/channels/src/` — one new file, one modified:

| File | Purpose | ~Lines |
|------|---------|--------|
| `inbound-dedup.ts` (new) | TTL dedup cache with `isDuplicate()` | ~40 |
| `manager.ts` (modify) | Add dedup check before forwarding | ~5 |

### Dedup Cache

A single `isDuplicate(channelType, channelId, messageId): boolean` function that:

1. **Builds composite key**: `${channelType}|${channelId}|${messageId}`.
2. **Skips dedup for missing IDs**: If `messageId` is falsy, returns `false` (always process).
3. **Checks Map**: If key exists and not expired, returns `true` (duplicate).
4. **Inserts on first sight**: Adds key with current timestamp, returns `false`.
5. **Lazy cleanup**: On each check, removes entries older than `ttlMs`.
6. **Max size eviction**: When map exceeds `maxSize`, deletes oldest entries.

### Configuration

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `ttlMs` | 20 minutes | Covers the longest webhook retry windows (most platforms retry within 1-5 minutes) |
| `maxSize` | 5000 | At ~100 bytes/entry, ~500KB max memory. Handles high-traffic bots. |

### Integration Point

In `ChannelManager.connectAll()`, the `onMessage` callback wraps each adapter's message handler:

```
Adapter emits message
  → isDuplicate(channelType, channelId, messageId)?
    → yes: drop + debug log
    → no: forward to runtime via messageHandler(inbound)
```

### Data Flow

```
Platform webhook → Adapter.handleWebhook()
  → adapter.onMessage(inbound)
    → isDuplicate() check ← NEW
    → messageHandler(inbound)
      → runtime.handleChannelMessage()
```

## Testing Strategy

1. **Unit tests** for `inbound-dedup.ts` (~10): first-pass, duplicate-blocked, TTL expiry, max-size eviction, different-channel-same-id, empty-id bypass, reset
2. **Existing tests**: channel tests should pass unchanged (dedup is additive)

## Non-Goals

- No response caching or replay for duplicates
- No per-channel TTL tuning (single global TTL is sufficient)
- No persistence across restarts (webhook retries are short-lived)
- No dedup for WebSocket/polling-based adapters (they have their own mechanisms)
