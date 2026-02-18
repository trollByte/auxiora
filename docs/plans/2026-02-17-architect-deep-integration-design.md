# Architect Deep Integration Design

**Date:** 2026-02-17
**Status:** Approved

## Context

The Architect personality engine is already wired into per-message enrichment at `packages/runtime/src/index.ts:2102` via `applyArchitectEnrichment()`. Four gaps remain:

1. Conversation state is lost on restart
2. Self-awareness collectors lack Architect context
3. SOUL.md doesn't influence trait mixing
4. Escalation alerts are computed but discarded

## Approach: Architect Bridge Module

Create `packages/personality/src/architect-bridge.ts` — a single cohesive module encapsulating all four integrations. The runtime needs ~20 lines of glue code. Each piece is independently testable.

---

## 1. Conversation State Persistence

- Add `serialize(): ConversationState` and `static restore(state: ConversationState)` to `ConversationContext`
- `ConversationState` is JSON-serializable: `{ theme, dominantDomain, domainStreak, history }` (last 50 detection records, ~2KB)
- Bridge calls `serialize()` after each `generatePrompt()`, writes to vault keyed by `architect:chat:{chatId}`
- On chat resume, `restore()` hydrates `ConversationContext` before the first message

### Files
- Modify: `src/personalities/the-architect/conversation-context.ts` — add serialize/restore
- Modify: `packages/personality/src/architect-bridge.ts` — persist/load logic
- Modify: `packages/runtime/src/index.ts` — pass chatId to bridge, call restore on chat resume

## 2. Self-Awareness Bridging

- New `ArchitectAwarenessCollector` implementing `SignalCollector` from `packages/self-awareness/src/types.ts`
- Holds reference to latest `PromptOutput`, updated after each `generatePrompt()`
- `collect()` produces 1-3 signals:
  - **Domain signal** (priority 0.6): detected domain + confidence — only when not `general`
  - **Emotional trajectory signal** (priority 0.8): trajectory state — only when not `stable`
  - **Escalation signal** (priority 1.0): `escalationAlert` text verbatim — only when present
- Registered alongside existing 7 collectors in `loadPersonality()` when Architect is active

### Files
- Create: `packages/personality/src/architect-awareness-collector.ts`
- Modify: `packages/runtime/src/index.ts` — register collector when Architect active

## 3. SOUL.md Domain Biasing

- `parseSoulBiases(soulContent: string): Record<ContextDomain, number>` in the bridge module
- Scans SOUL.md for domain-indicative keywords (same 17 keyword sets as context detector)
- Produces weight offsets in [-0.15, +0.15] range — subtle biases, not overrides
- Passed to Architect as initial custom weights at `loadPersonality()` via `architect.setCustomWeights(biases)`
- Runs once at startup (SOUL.md is static), not per-message
- No biases if SOUL.md absent or has no domain keywords

### Files
- Create: `packages/personality/src/soul-bias-parser.ts`
- Modify: `packages/runtime/src/index.ts` — parse SOUL.md content and pass biases at init

## 4. Escalation Alert Wiring

- Bridge exposes `onEscalation: (alert: string, context: TaskContext) => void` callback
- After each `generatePrompt()`, bridge checks `output.escalationAlert` and fires callback if present
- Runtime wires to:
  1. Structured log: `logger.warn('Escalation detected', { alert, domain, emotion, trajectory })`
  2. Include `escalationAlert` in `architectMeta` sent to UI (already partially in place)
- No automated mode switching — observability only

### Files
- Modify: `packages/personality/src/architect-bridge.ts` — escalation callback
- Modify: `packages/runtime/src/index.ts` — wire callback to logger + response metadata

---

## Testing Strategy

- Unit tests for `ConversationContext.serialize()`/`restore()` round-trip
- Unit tests for `ArchitectAwarenessCollector.collect()` with various Architect outputs
- Unit tests for `parseSoulBiases()` with domain-rich and domain-neutral SOUL.md content
- Unit tests for escalation callback invocation
- Integration test for bridge persist/load cycle with mock vault

## Non-Goals

- Automated escalation responses (mode switching, notifications) — future work
- UI indicators for escalation — future work (dashboard already receives architectMeta)
- Per-message SOUL.md re-parsing — SOUL.md is static, parse once at startup
