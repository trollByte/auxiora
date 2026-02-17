# Transcript Repair (Session Sanitizer) Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw session-transcript-repair.ts patterns

---

## Problem

When `executeWithTools()` is interrupted (crash, timeout, process kill), the session is left with orphaned messages: a trailing `[Tool Results]` user message with no assistant response, or a dangling assistant tool announcement with no following tool results. These broken transcripts cause degraded responses when the session is resumed — the model sees incomplete tool interactions and gets confused.

## Solution

Add a pure `sanitizeTranscript(messages)` function that runs as a pre-flight step before messages are sent to the API. It detects and drops broken message patterns from the end of the transcript. No mutation of the session store — the repair is applied in-memory only.

## Architecture

### Module Location

| File | Purpose | ~Lines |
|------|---------|--------|
| `packages/sessions/src/sanitize-transcript.ts` (new) | Pure sanitization function | ~50 |
| `packages/runtime/src/index.ts` (modify) | Call sanitizer before API calls | ~5 |

### Repair Patterns

1. **Trailing orphan `[Tool Results]`** — A `user` message starting with `[Tool Results]` at the end of the transcript with no following `assistant` response. **Fix**: Drop it.

2. **Dangling tool announcement** — An `assistant` message at the end of the transcript containing tool-use language (e.g. "I'll use X"). **Fix**: Drop it.

3. **Consecutive same-role messages** — Two `user` or two `assistant` messages in a row. **Fix**: Merge them (join with `\n\n`).

4. **Empty content** — Messages with empty or whitespace-only content. **Fix**: Drop them.

### Integration Point

In `handleMessage()`, `handleChannelMessage()`, and `handleVoiceMessage()` — after `getContextMessages()` returns, sanitize before building `chatMessages` for the API call.

### Data Flow

```
getContextMessages(sessionId)
  → sanitizeTranscript(messages)
    → drop empty messages
    → drop trailing orphan [Tool Results]
    → drop trailing dangling tool announcement
    → merge consecutive same-role messages
  → map to { role, content } for API
```

## Testing Strategy

1. **Unit tests** for `sanitizeTranscript` (~8): each repair pattern, combined patterns, no-op on clean transcript, empty input
2. **Existing tests**: all should pass (sanitizer is additive, only applied at call sites)

## Non-Goals

- No mutation of the session store (repair is in-memory only)
- No structured tool_use/tool_result block handling (Auxiora uses flat strings)
- No crash prevention/rollback (separate concern)
- No repair of messages mid-transcript (only trailing broken patterns)
