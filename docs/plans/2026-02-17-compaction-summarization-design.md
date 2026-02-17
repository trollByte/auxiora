# Compaction Summarization Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #14 (OpenClaw-inspired enhancement)

---

## Problem

When conversations grow large, `getContextMessages()` drops oldest messages with only an omission marker. The AI loses important context about earlier discussion (decisions, user preferences, established facts).

## Solution

Auto-trigger AI-powered summarization when context usage exceeds a threshold. The session manager calls a summarizer function (injected from runtime) to condense dropped messages into a summary, then calls the existing `compact()` method.

## Architecture

### Module: `packages/sessions/src/compaction-summarizer.ts`

- `summarizeMessages(messages, summarizeFn)` — progressive fallback:
  1. Try summarizing all dropped messages in one call
  2. If too large (>50K chars), chunk into groups and summarize each, then merge
  3. If all calls fail, return size-only description: `"[N messages from TIME_A to TIME_B — summarization failed]"`
- `SummarizeFn` type: `(prompt: string) => Promise<string>` — injected by runtime

### Changes to `packages/sessions/src/manager.ts`

- `setSummarizer(fn: SummarizeFn)` — inject summarize function after providers init
- In `getContextMessages()`: after message selection, if >40% of messages were dropped AND summarizer available AND compaction enabled, fire-and-forget async compaction
- Debounce: 5-minute cooldown per session

### Changes to `packages/runtime/src/index.ts`

- After `initializeProviders()`, call `this.sessions.setSummarizer()` with a function that uses the primary provider's `complete()` method

## Key Decisions

- **Fire-and-forget**: Current response uses degraded context (omission marker), next response gets summary
- **Threshold**: Trigger when >40% of messages were dropped
- **Debounce**: Once per session per 5 minutes
- **Progressive fallback**: Never crashes — worst case returns size-only description
- **Provider decoupling**: Sessions package doesn't depend on providers; runtime injects the summarize function

## Testing Strategy

1. Summarizer called when threshold exceeded (~2 tests)
2. Summarizer not called when all messages fit (~1 test)
3. Progressive fallback: chunk when too large (~1 test)
4. Progressive fallback: size-only on total failure (~1 test)
5. Debounce prevents rapid re-summarization (~1 test)

## Non-Goals

- No user-facing compaction controls (future enhancement)
- No per-session summarization configuration
- No streaming summarization (batch only)
