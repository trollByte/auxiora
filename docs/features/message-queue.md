# Message Queue

> Per-session message queuing that prevents race conditions during long-running tasks.

## Overview

When Auxiora is in the middle of a long-running agentic task (multi-file generation, research, tool loops) and a new message arrives on the same session, the message queue ensures it is processed sequentially rather than causing a race condition. The new message is held until the current task finishes, then processed through the full pipeline -- guardrails, enrichment, and tool execution -- with the completed work already visible in the session history.

This matches the behavior users expect: send a follow-up message, and the assistant gets to it as soon as it finishes the current task.

## How It Works

```
Message arrives
  |
  v
Is the session already processing a message?
  |
  |-- YES --> Queue the message, send acknowledgment, return
  |
  |-- NO  --> Lock the session, process normally
                |
                v
              When done: drain queued messages one at a time
                |
                v
              Release the session lock
```

Each session maintains its own run state and queue. Different sessions still run concurrently -- the lock is per-session, not global.

### Queue Acknowledgment

When a message is queued, the user receives immediate feedback:

- **Channels** (Discord, WhatsApp, Telegram, etc.): A short text reply -- "Got it -- I'll get to that after I finish the current task."
- **Webchat**: A `{ type: 'queued' }` WebSocket event. The dashboard can use this to show a subtle queued indicator.

### Sequential Drain

After the current run finishes, queued messages are drained one at a time in arrival order. Each drained message goes through the full processing pipeline (guardrails, enrichment, tool execution) -- no shortcuts. The drained message naturally sees all prior work in the session transcript.

## Configuration

Add a `queue` section to `~/.auxiora/config.json`:

```json
{
  "queue": {
    "mode": "followup",
    "cap": 20,
    "debounceMs": 0
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mode` | string | `"followup"` | Queue mode. Currently only `followup` is supported. |
| `cap` | number | `20` | Maximum queued messages per session. Oldest messages are dropped on overflow. |
| `debounceMs` | number | `0` | Debounce interval in milliseconds before processing queued messages. |

### Queue Modes

- **`followup`** -- Queue new messages and process them one-by-one after the current run completes. This is the only mode implemented today.
- **`collect`** -- (future) Batch queued messages into a single combined prompt.
- **`steer`** -- (future) Inject the new message into the active run mid-stream.

## Properties

- **In-memory only** -- Queues are lost on restart. This is intentional; pending messages are ephemeral and do not need crash recovery.
- **Per-session isolation** -- Each session has its own queue and lock. Sessions on different channels or different users run independently.
- **Sequential drain** -- Only one message is processed at a time per session.
- **Full pipeline** -- Drained messages go through the same guardrails, enrichment, and tool execution as any other message.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Queue overflow (cap hit) | Oldest queued message is dropped. A warning is logged. |
| Timeout during drain | Existing rollback cleans up the failed message. Drain continues to the next queued message. |
| Client disconnects | Queued webchat messages for a disconnected client are skipped. |
| Session destroyed | Remaining queued messages for that session are discarded. |
| Shutdown | All run states and queues are cleared on `Auxiora.destroy()`. |

## Related Documentation

- [Messaging Channels](channels.md) -- Channel adapters that produce queued acknowledgments
- [Orchestration & ReAct](orchestration.md) -- Long-running agentic tasks that benefit from queuing
- [Behaviors](behaviors.md) -- Background automation that runs alongside the message queue
