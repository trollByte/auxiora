# Draft Streaming (Edit-in-Place) Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw DraftStreamLoop and TelegramDraftStream patterns

---

## Problem

Channel adapters (Telegram, Discord, Slack) receive the complete AI response only after generation finishes. Users see a typing indicator for 5-30 seconds, then a wall of text. Meanwhile, webchat users see progressive streaming. This creates an inferior experience on the most common messaging platforms.

## Solution

Add a throttled edit-in-place streaming system: send an initial message, then edit it progressively as LLM chunks arrive. A channel-agnostic `DraftStreamLoop` handles throttling and in-flight tracking. Platform-specific `editMessage()` methods on adapters perform the actual edits.

## Architecture

### Module Location

| File | Purpose | ~Lines |
|------|---------|--------|
| `packages/channels/src/draft-stream-loop.ts` (new) | Channel-agnostic throttled send/edit loop | ~80 |
| `packages/channels/src/types.ts` (modify) | Add optional `editMessage` to `ChannelAdapter` | ~3 |
| `packages/channels/src/adapters/telegram.ts` (modify) | Implement `editMessage` via grammY | ~10 |
| `packages/channels/src/adapters/discord.ts` (modify) | Implement `editMessage` via discord.js | ~10 |
| `packages/channels/src/adapters/slack.ts` (modify) | Implement `editMessage` via Slack Bolt | ~10 |
| `packages/runtime/src/index.ts` (modify) | Replace no-op `onChunk` with draft streaming | ~30 |

### DraftStreamLoop

A channel-agnostic throttled loop (~80 lines):

- **Constructor**: `(sendOrEdit: (text: string) => Promise<boolean>, throttleMs?: number)`
- **`update(text)`**: Sets pending text. Flushes immediately if throttle allows, otherwise schedules timer.
- **`flush()`**: Forces delivery. Waits for in-flight, loops until buffer drained.
- **`stop()`**: Cancels timer, clears pending text.
- Single `inFlightPromise` slot — one API call at a time.
- Timer delay: `max(0, throttleMs - (now - lastSentAt))`.

### Adapter editMessage

Optional method on `ChannelAdapter`:

```typescript
editMessage?(channelId: string, messageId: string, message: OutboundMessage): Promise<SendResult>;
```

| Adapter | API | Max chars |
|---------|-----|-----------|
| Telegram | `bot.api.editMessageText(chatId, messageId, text)` | 4096 |
| Discord | `channel.messages.edit(messageId, content)` | 2000 |
| Slack | `client.chat.update({ channel, ts, text })` | 4000 |

### Runtime Integration

In `handleChannelMessage()`, replace the no-op `onChunk` callback:

1. On first `text` chunk: send initial message via `channels.send()` → store `messageId`.
2. Accumulate chunks into full text. Call `draftLoop.update(fullText)`.
3. `sendOrEdit` callback calls `adapter.editMessage(channelId, messageId, { content: text })`.
4. On completion: `draftLoop.flush()` to send final text.
5. **Char limit**: If accumulated text exceeds platform max, stop editing. Final `send()` handles chunking.
6. **Fallback**: If adapter lacks `editMessage`, use current behavior (no streaming, send once at end).

### Data Flow

```
LLM stream chunk
  → onChunk('text', delta)
    → accumulate into fullText
    → draftLoop.update(fullText)
      → [throttle check]
      → sendOrEdit(fullText)
        → [first time]: channels.send() → store messageId
        → [subsequent]: adapter.editMessage(channelId, messageId, text)
  → executeWithTools returns
    → draftLoop.flush() (final edit)
    → save assistant message to session
```

### Platform Constraints

| Platform | Max chars | Throttle | Notes |
|----------|-----------|----------|-------|
| Telegram | 4096 | 1000ms | MarkdownV2 parsing may add overhead |
| Discord | 2000 | 1000ms | Embeds have different limits |
| Slack | 4000 | 1000ms | `chat.update` requires bot token scope |

## Testing Strategy

1. **Unit tests** for `DraftStreamLoop` (~10): throttle, flush, stop, in-flight queueing, back-pressure
2. **Unit tests** for each adapter's `editMessage` (~3 per adapter, 9 total)
3. **Integration test** for runtime draft streaming flow (~4)
4. **Existing tests**: all should pass (fallback behavior unchanged)

## Non-Goals

- No human-like delays (edit-in-place already feels natural)
- No block coalescing (single message edit, not multi-message blocks)
- No minInitialChars debounce (send first chunk immediately)
- No adapters without edit support (WhatsApp, Teams, Matrix, etc. keep current behavior)
