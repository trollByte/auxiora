# Progressive Context Degradation Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #13 (OpenClaw-inspired hardening)

---

## Problem

When conversations exceed the context budget, `getContextMessages()` silently drops oldest messages. Users lose context without knowing why the AI "forgot" earlier discussion. The existing manual `compact()` method is never auto-triggered.

## Solution

Add two degradation tiers that activate automatically during context assembly:

1. **Tier 1 — Omission marker**: Keep first 2 messages (establishes conversation context) + newest messages that fit budget. Insert a `[...N earlier messages omitted...]` marker between them so the AI knows history was trimmed.

2. **Tier 2 — Large message truncation**: When individual messages exceed a threshold (e.g., >2000 tokens), truncate them by keeping head + tail with a `[...truncated N chars...]` marker. This prevents a single huge paste from consuming the entire budget.

Additionally, pass real `maxContextTokens` from provider metadata to `getContextMessages()` instead of relying on hardcoded defaults.

## Architecture

### Module: `packages/sessions/src/context-degradation.ts`

- `degradeContext(allMessages, selectedMessages, budget)` — applies tiers, returns modified message array
- `insertOmissionMarker(allCount, selectedCount)` — creates synthetic marker message for Tier 1
- `truncateLargeMessage(content, maxChars)` — Tier 2: keeps first 40% + last 40% of oversized content with marker

### Changes to `packages/sessions/src/manager.ts`

- `getContextMessages()` calls `degradeContext()` after selecting messages
- Returns messages with omission marker if messages were dropped

### Changes to `packages/runtime/src/index.ts`

- Pass actual `maxContextTokens` from provider metadata to `getContextMessages()` at all 4 call sites

## Testing Strategy

1. Omission marker tests (~3): no marker when all fit, marker with correct count, edge case all dropped
2. Large message truncation tests (~2): no truncation when small, truncated with head+tail
3. Integration tests (~3): full degradeContext flow, combined omission + truncation
4. Provider maxTokens passthrough (~1)

## Non-Goals

- No auto-summarization (future enhancement — requires async provider calls)
- No per-session configuration
- No user notification in channel (AI sees the markers and can mention it naturally)
