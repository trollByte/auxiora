# Message Queue System Design

## Problem

When Auxiora is processing a long-running agentic task (multi-file generation, research, etc.) and a new message arrives on the same session, one of two things happens:

1. **Race condition**: Both messages execute concurrently on the same session, interleaving tool outputs and corrupting conversation state.
2. **Timeout + amnesia**: The first task times out, orphaned messages are rolled back, and the original task is forgotten entirely.

Users expect OpenClaw-like behavior: queue the new message, finish the current task, then process the queued message — which naturally sees the completed work in the session history.

## Design

### Architecture

A per-session in-memory mutex with a followup queue, inspired by OpenClaw's queue mode system. When a message arrives while a run is active, it's queued and processed sequentially after the current run finishes.

**Queue modes** (extensible, only `followup` implemented now):
- `followup` — Queue new messages, process one-by-one after current run completes
- `collect` — (future) Batch queued messages into a single prompt
- `steer` — (future) Inject new message into the active run mid-stream

### Data Structures

```typescript
type QueueMode = 'followup' | 'collect' | 'steer';

interface PendingMessage {
  content: string;
  enqueuedAt: number;
  // Webchat
  client?: ClientConnection;
  requestId?: string;
  chatId?: string;
  modelOverride?: string;
  providerOverride?: string;
  // Channel
  inbound?: InboundMessage;
}

interface SessionRunState {
  running: boolean;
  queue: PendingMessage[];
  lastRunStartedAt: number;
}

// On the Auxiora class:
private sessionRunStates = new Map<string, SessionRunState>();
```

### Message Flow

```
Message arrives (handleMessage or handleChannelMessage)
  |
  v
Get or create SessionRunState for sessionId
  |
  v
running === true?
  |--- YES --> Push to queue (cap: 20, drop oldest on overflow)
  |            Send "queued" ack to user
  |            Return early
  |
  |--- NO  --> Set running = true
               Process normally (existing flow, unchanged)
               |
               v
            finally: drainQueue()
               |
               v
            while queue.length > 0:
              shift next message
              process through full pipeline (guardrails, enrichment, executeWithTools)
               |
               v
            Set running = false
```

### Queue Acknowledgment

- **Channels** (Discord, WhatsApp, etc.): Send a short text reply: "Got it — I'll get to that after I finish the current task."
- **Webchat**: Send a `{ type: 'queued' }` websocket event (dashboard can show a subtle indicator)

### Integration Points

All changes in two files:

1. **`packages/runtime/src/index.ts`**:
   - `sessionRunStates` map
   - `acquireSessionRun(sessionId)` — returns `true` if acquired, `false` if already running
   - `releaseSessionRun(sessionId)` — sets running to false
   - `drainSessionQueue(sessionId)` — processes queued messages sequentially
   - Modified `handleMessage()` — gate with run state check
   - Modified `handleChannelMessage()` — same pattern

2. **`packages/config/src/index.ts`**:
   - Add `queue?: { mode?: QueueMode; cap?: number; debounceMs?: number }` to config schema
   - Defaults: `{ mode: 'followup', cap: 20, debounceMs: 0 }`

### Edge Cases

- **Queue overflow**: Drop oldest message when cap (20) hit. Log warning.
- **Timeout during drain**: Existing rollback cleans up. Drain continues to next message.
- **Client disconnected**: Skip queued webchat messages if client no longer connected.
- **Session destroyed**: Discard remaining queue if session no longer exists.
- **Shutdown**: Clear all `sessionRunStates` on `Auxiora.destroy()`.

### What Does NOT Change

- `executeWithTools()` — untouched
- `sanitizeTranscript()` — already handles orphaned tool loops
- Session manager — no schema changes
- Dashboard — no UI for queue settings

### Properties

- **In-memory only** — queues lost on restart (acceptable, matches OpenClaw)
- **Per-session isolation** — different sessions still run concurrently
- **Sequential drain** — one message at a time per session
- **Full pipeline** — drained messages go through guardrails, enrichment, tools (no shortcuts)
- **Extensible** — data structures support future `collect` and `steer` modes
