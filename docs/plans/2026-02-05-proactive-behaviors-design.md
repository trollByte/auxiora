# Proactive Behaviors — Design Document

**Date:** 2026-02-05
**Version:** 1.0
**Status:** Approved
**Feature:** Scheduled tasks, conditional monitors, and one-shot reminders

---

## Overview

Proactive behaviors let Auxiora autonomously perform tasks on schedules or by polling conditions, then deliver results to the user. Users create behaviors through natural language in any channel — the AI extracts the intent, confirms, and manages the lifecycle.

This is part of a broader new-capabilities roadmap:
1. **Proactive behaviors** (this document)
2. Browser control (Playwright)
3. Voice mode
4. Webhook listeners

---

## Core Concepts

### Three behavior types

- **Scheduled** — Runs at a cron-like interval. "Every morning at 8am, summarize my GitHub notifications."
- **Monitor** — Polls a condition at an interval, fires only when the condition is met. "Tell me when Bitcoin drops below $60k."
- **One-shot** — Runs once after a delay. "Remind me in 2 hours to call the dentist."

### User interaction model

Behaviors are created, listed, modified, and deleted through natural language conversation. The AI parses intent and maps it to structured tool calls. No CLI commands needed for day-to-day use.

**Example:**
> **User (Discord):** "Check my GitHub notifications every morning at 8am"
> **Auxiora:** "Got it — I'll check your GitHub notifications daily at 8:00 AM and send the summary here. You can say 'list my behaviors' or 'cancel the GitHub check' anytime."

### Delivery

Results default to the channel where the behavior was created. Users can override with natural language: "...and send it to Telegram." A subtle label distinguishes proactive messages from interactive ones.

---

## Architecture

### New package: `packages/behaviors/`

```
packages/behaviors/
├── src/
│   ├── index.ts              # Public API
│   ├── types.ts              # Behavior, Schedule, Monitor types
│   ├── behavior-manager.ts   # CRUD + lifecycle orchestration
│   ├── scheduler.ts          # Cron engine (node-cron)
│   ├── monitor.ts            # Polling engine with condition eval
│   ├── store.ts              # JSON file persistence
│   └── executor.ts           # Runs the behavior's action via AI provider
├── tests/
│   └── behaviors.test.ts
└── package.json
```

### System integration

```
User message ("check GitHub every morning")
    ↓
Session (existing) → sends to AI provider
    ↓
AI provider → detects intent, calls create_behavior tool
    ↓
BehaviorManager → validates, stores, schedules
    ↓
Scheduler/Monitor → fires at the right time
    ↓
Executor → runs the action through AI provider + tools
    ↓
Channel (existing) → delivers result to target channel
```

### Key decisions

- **`node-cron`** for scheduling — lightweight, battle-tested, no external deps
- **Executor reuses existing AI provider + tool system** — behavior execution is a fresh AI conversation with the stored prompt, full tool access
- **JSON file persistence** — `~/.auxiora/behaviors.json`, consistent with Auxiora's no-database design
- **AI does the NLP** — no custom parser; the AI provider maps natural language to structured tool parameters

---

## Data Model

```typescript
interface Behavior {
  id: string;                    // nanoid, e.g. "bh_a3xK9m"
  type: 'scheduled' | 'monitor' | 'one-shot';
  status: 'active' | 'paused' | 'deleted';

  // What to do
  action: string;               // Natural language prompt

  // When to do it
  schedule?: {
    cron: string;               // "0 8 * * *"
    timezone: string;           // "America/New_York"
  };
  polling?: {
    intervalMs: number;         // 60000 (1 min) to 86400000 (24h)
    condition: string;          // Natural language condition
  };
  delay?: {
    fireAt: string;             // ISO timestamp for one-shots
  };

  // Where to deliver
  channel: {
    type: string;               // "discord" | "telegram" | etc.
    id: string;                 // Channel/chat ID
    overridden: boolean;        // Explicitly set by user?
  };

  // Metadata
  createdBy: string;            // Sender ID
  createdAt: string;            // ISO timestamp
  lastRun?: string;             // ISO timestamp
  lastResult?: string;          // Last output (truncated)
  runCount: number;
  failCount: number;
  maxFailures: number;          // Auto-pause after N consecutive failures (default: 3)
}
```

---

## Tools

Four new tools registered in `packages/tools/`:

### `create_behavior`

```typescript
{
  name: 'create_behavior',
  description: 'Create a proactive behavior (scheduled task or monitor)',
  parameters: {
    type: 'scheduled' | 'monitor' | 'one-shot',
    action: string,
    cron?: string,
    timezone?: string,
    intervalMs?: number,
    condition?: string,
    delay?: string,
    channelOverride?: string
  }
}
```

### `list_behaviors`

Lists all behaviors for the current user. Supports filtering by type and status.

### `update_behavior`

Modify an existing behavior: change schedule, pause, resume, update action.

### `delete_behaviors`

Delete one or more behaviors by ID, type, or all.

### Natural language mapping

| User says | Tool call |
|-----------|-----------|
| "list my behaviors" | `list_behaviors` |
| "pause the GitHub check" | `update_behavior { id, status: 'paused' }` |
| "cancel all my monitors" | `delete_behaviors { type: 'monitor' }` |
| "change the GitHub check to 9am" | `update_behavior { id, cron: '0 9 * * *' }` |

---

## Execution Model

### Trigger → Execute → Deliver

1. Scheduler/Monitor fires
2. Executor creates a fresh, isolated AI conversation (no shared chat history)
3. AI processes the action prompt with full tool access (web, bash, files) and vault access
4. AI produces a response
5. Executor delivers via the target channel adapter
6. Store updates: lastRun, lastResult, runCount
7. Audit log entry written

### Failure handling

1. **Transient failure** — retry once after 30 seconds
2. **Repeated failure** — increment failCount, log to audit
3. **Auto-pause** — after 3 consecutive failures, pause and notify user
4. **Execution timeout** — 60-second max per execution

### Concurrency

- Sequential execution queue (one behavior at a time)
- Multiple simultaneous triggers queued in creation order
- Simple and predictable for a single-user system

---

## Guardrails

- **Minimum polling interval**: 60 seconds
- **Max active behaviors per user**: 50 (configurable)
- **Auto-pause on failure**: 3 consecutive failures
- **Execution timeout**: 60 seconds
- **No sensitive data in action prompts**: AI accesses vault at execution time
- **Audit integration**: all CRUD and executions logged

---

## Runtime Integration

### Boot sequence

```typescript
// runtime/src/runtime.ts
const behaviorManager = new BehaviorManager({
  store: new BehaviorStore(paths.behaviorsFile),
  executor: new BehaviorExecutor({ providers, tools, channels }),
  scheduler: new Scheduler(),
  monitor: new MonitorEngine(),
  audit: auditLog,
});

await behaviorManager.start(); // Load saved behaviors, resume schedules
```

### Shutdown

`behaviorManager.stop()` gracefully drains the execution queue and persists state.

### Daemon restart recovery

On restart, `BehaviorManager.start()` reloads all active behaviors from `behaviors.json` and reschedules. Missed one-shots expired during downtime are marked `missed` and the user is notified.

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `node-cron` | Cron expression parsing and scheduling |
| `nanoid` | Behavior ID generation |

---

## Implementation Plan

| Component | Package | Effort |
|-----------|---------|--------|
| Types & data model | `packages/behaviors/` | Small |
| BehaviorStore (JSON persistence) | `packages/behaviors/` | Small |
| Scheduler (node-cron wrapper) | `packages/behaviors/` | Small |
| MonitorEngine (polling + condition eval) | `packages/behaviors/` | Medium |
| BehaviorExecutor (AI execution + delivery) | `packages/behaviors/` | Medium |
| BehaviorManager (orchestration + lifecycle) | `packages/behaviors/` | Medium |
| 4 behavior tools | `packages/tools/` | Small |
| Runtime integration | `packages/runtime/` | Small |
| Tests | `packages/behaviors/tests/` | Medium |
