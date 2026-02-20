# Architect Runtime Integration Design

**Date:** 2026-02-19
**Status:** Approved

## Goal

Wire all 12 identified gaps in The Architect's runtime integration so that the personality engine is fully connected: feedback flows back, conversations reset cleanly, state restores on startup, channels get personality adaptation, and the dashboard controls the live instance.

## Decisions

- **Approach:** Incremental patching (direct changes to Auxiora class and ArchitectBridge)
- **Feedback UX:** Thumbs up/down mapped to rating 5 (helpful) / rating 1 (off_target)
- **Reset trigger:** Auto-reset on new session creation (fresh chatId with no prior messages)
- **Dashboard sync:** Gateway REST routes calling live Architect instance (no vault-watching)

## Gap Summary

| # | Gap | Category |
|---|-----|----------|
| 1 | `recordFeedback()` never called | Signal wiring |
| 2 | `resetConversation()` never called | Lifecycle |
| 3 | `maybeRestore()` discards loaded state | Lifecycle |
| 4 | `recordDecision()`/`updateDecision()` not wired | Signal wiring |
| 5 | `loadPreset()`/`removeTraitOverride()` no routes | Surface expansion |
| 6 | Tool context not fed to awareness collector | Signal wiring |
| 7 | Streaming awareness hooks missing | Signal wiring |
| 8 | Correction recording not exposed via routes | Surface expansion |
| 9 | Conversation export not wired | Surface expansion |
| 10 | Data export/clear not wired | Surface expansion |
| 11 | Channel path missing useArchitect guard | Surface expansion |
| 12 | Dashboard writes raw vault, not live instance | Surface expansion |

## Design

### 1. Lifecycle Hooks (Gaps 2, 3)

**Conversation reset (Gap 2):**
In `handleMessage()` and `handleChannelMessage()`, when a new chatId is first seen (session has no prior messages), call `this.architect.resetConversation()` before `generatePrompt()`. This clears emotional tracker and conversation theme to prevent bleed between chats.

Detection: check `session.messages.length === 0` for fresh sessions, or maintain a `Set<string>` of seen chatIds (like the bridge's existing `restoredChats` pattern).

**State restore (Gap 3):**
Fix `ArchitectBridge.maybeRestore()` in `packages/personality/src/architect-bridge.ts`. After loading the persisted conversation summary from vault, apply the loaded corrections back to the Architect via `architect.loadCorrections()` and restore emotional/theme context. Currently the method reads from vault but discards the result.

### 2. Feedback Recording (Gap 1)

**WebSocket event:**
```
{ type: 'message_feedback', messageId: string, rating: 'up'|'down', note?: string }
```
Maps `up` → `helpful`, `down` → `off_target`. Calls `architect.recordFeedback()` with the detected domain from message metadata, current trait snapshot, and optional note.

**REST route:**
```
POST /api/v1/sessions/:sessionId/messages/:messageId/feedback
Body: { rating: 'up'|'down', note?: string }
```

**Message metadata:** Store `architectDomain` in assistant message metadata during `sessions.addMessage()` so feedback can reference the domain context later.

**Audit:** Emit `personality.feedback` event with sessionId, messageId, rating.

### 3. Decision Tracking (Gap 4)

REST routes on the personality router:
```
POST   /api/v1/personality/decisions        — recordDecision()
PATCH  /api/v1/personality/decisions/:id     — updateDecision()
GET    /api/v1/personality/decisions         — queryDecisions()
GET    /api/v1/personality/decisions/due     — getDueFollowUps()
```

Decisions are user choices surfaced by the LLM during conversations. The runtime does not auto-detect decisions — the LLM suggests recording them via tool use or the user records them manually through the dashboard.

### 4. Channel Path Parity (Gap 11)

In `handleChannelMessage()`:
1. Add the same `useArchitect` config check that `handleMessage()` uses
2. Derive `chatId` from `channelType:channelId` (e.g., `telegram:12345`)
3. Call `applyArchitectEnrichment()` with the channel message content
4. Call `architectBridge.afterPrompt()` with the output
5. Append the enriched prompt fragment to the system prompt

This gives channel users the same personality adaptation as WebSocket clients.

### 5. Dashboard Live Updates (Gaps 5, 12)

Personality management router mounted at `/api/v1/personality`:

```
GET    /preferences              — getPreferences()
PUT    /preferences              — updatePreference() (partial updates)
GET    /traits                   — getTraitMix() + getActiveOverrides()
PUT    /traits/:trait            — setTraitOverride(trait, offset)
DELETE /traits/:trait            — removeTraitOverride(trait)
POST   /presets/:name/apply      — loadPreset(name)
GET    /presets                  — listPresets()
GET    /feedback/insights        — getFeedbackInsights()
GET    /user-model               — getUserModel()
GET    /corrections/stats        — getCorrectionStats()
```

All routes call the live Architect instance, ensuring changes take effect immediately. The Architect's internal persistence layer handles vault writes.

### 6. Tool Context & Streaming (Gaps 6, 7)

**Tool context (Gap 6):**
After `executeWithTools()` completes, extract the list of tools called and feed a summary to `ArchitectAwarenessCollector`. Add a new signal dimension `architect-tools` with tool names and success/failure counts.

**Streaming hooks (Gap 7):**
Add an optional `onStreamChunk` callback to the awareness collector for periodic streaming state snapshots. Low priority — the post-stream scan already captures final state.

### 7. Additional Routes (Gaps 8, 9, 10)

**Correction recording (Gap 8):**
```
POST /api/v1/personality/corrections
Body: { userMessage, detectedDomain, correctedDomain }
```

**Conversation export (Gap 9):**
```
GET /api/v1/sessions/:id/export?format=json|markdown|csv
```
Calls `architect.exportConversationAs()` with the session's messages.

**Data portability (Gap 10):**
```
GET    /api/v1/personality/export    — architect.exportData()
DELETE /api/v1/personality/data      — architect.clearAllData()
```
GDPR-style data portability and deletion endpoints.

## Audit Events

| Event | When |
|-------|------|
| `personality.feedback` | Feedback recorded (sessionId, messageId, rating) |
| `personality.decision.created` | Decision recorded |
| `personality.decision.updated` | Decision status changed |
| `personality.preset.applied` | Preset loaded |
| `personality.trait.override` | Trait weight changed |
| `personality.correction` | Context correction recorded |
| `personality.data.exported` | Data export requested |
| `personality.data.cleared` | All data cleared |
| `personality.reset` | Conversation reset triggered |

## Files Changed

| File | Change |
|------|--------|
| `packages/personality/src/architect-bridge.ts` | Fix `maybeRestore()` to apply loaded state |
| `packages/runtime/src/index.ts` | Add reset on new session, feedback WS handler, tool context feed, channel architect wiring, personality router creation & mounting |
| `packages/runtime/tests/architect-integration.test.ts` | New: integration tests for all 12 gaps |
| `packages/personality/src/architect-awareness-collector.ts` | Add tool context signal dimension |

## What This Does NOT Change

- The Architect engine itself (all gaps are wiring, not logic)
- The guardrails integration (independent pipeline)
- Existing unit tests for Architect modules
- The dashboard UI (routes only — UI changes are a separate task)
