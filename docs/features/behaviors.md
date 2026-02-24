# Behaviors

> Proactive automation: scheduled tasks, conditional monitors, one-shot reminders, and event-driven triggers.

## Overview

Behaviors let Auxiora act on your behalf without waiting for a prompt. A behavior is a reusable automation rule that fires on a schedule, polls a condition, triggers at a specific time, or reacts to an event. Every execution is audit-logged and respects your trust settings.

## Behavior Types

| Type | Trigger | Internal Name | Use Case |
|------|---------|---------------|----------|
| Scheduled | Cron expression | `scheduled` | "Every weekday at 9am, summarize my unread emails" |
| Monitor | Polling interval (60s -- 24h) | `monitor` | "Alert me when Bitcoin drops below $50k" |
| One-Shot | Fires once at a specific time | `one-shot` | "Remind me to call the dentist at 3pm" |
| Event | Condition-based trigger on incoming events | `event` | "When a PR is merged to main, notify me on Telegram" |

### Polling Intervals (Monitor)

Monitors poll at a configurable interval between **60 seconds** and **24 hours** (86,400 seconds). Intervals shorter than 60 seconds are rejected to prevent excessive resource usage.

### Event Triggers

Event behaviors fire when an incoming event matches a set of conditions. Each condition targets a `field` with an operator (`equals`, `contains`, `startsWith`, `endsWith`, `gt`, `lt`, `exists`) and a value. Conditions can be combined with `and` or `or` logic.

## Creating Behaviors

### Via Dashboard

Navigate to **Behaviors** in the sidebar, click **Create**, select a type, configure the trigger and action prompt, choose a delivery channel, and save.

### Via CLI

```bash
# Scheduled: daily standup summary (weekdays at 9am)
auxiora behaviors create \
  --type scheduled \
  --cron "0 9 * * 1-5" \
  --prompt "Summarize my calendar and unread messages for today"

# Monitor: PR approval watch (every 5 minutes)
auxiora behaviors create \
  --type monitor \
  --interval 300 \
  --prompt "Check if my open GitHub PRs have been approved"

# One-shot reminder
auxiora behaviors create \
  --type one-shot \
  --at "2026-02-25T15:00:00" \
  --message "Call dentist"

# Event: notify on deployment failure
auxiora behaviors create \
  --type event \
  --source github \
  --event workflow_run \
  --condition "conclusion equals failure" \
  --prompt "Summarize the deployment failure and suggest fixes"
```

### Via API

```http
POST /api/v1/behaviors
Content-Type: application/json

{
  "type": "scheduled",
  "action": "Summarize my calendar and unread messages for today",
  "schedule": {
    "cron": "0 9 * * 1-5",
    "timezone": "America/New_York"
  },
  "channel": {
    "type": "telegram",
    "id": "my-chat-id",
    "overridden": false
  }
}
```

## Managing Behaviors

### CLI Commands

| Command | Description |
|---------|-------------|
| `auxiora behaviors list` | Show all behaviors (filter with `--type` or `--status`) |
| `auxiora behaviors pause <id>` | Pause a behavior (stops executing but retains config) |
| `auxiora behaviors resume <id>` | Resume a paused behavior |
| `auxiora behaviors delete <id>` | Permanently remove a behavior |

### Dashboard

The **Behaviors** page displays all behaviors in a filterable list. Each row shows the behavior type, status, last run time, run count, and failure count. Actions (pause, resume, delete, run now) are available inline.

### Status Transitions

A behavior moves through these statuses:

- **active** -- running on its configured trigger.
- **paused** -- temporarily stopped. Can be resumed.
- **missed** -- a one-shot whose fire time passed while the system was offline.
- **deleted** -- permanently removed.

## Error Handling

### Auto-Pause on Repeated Failures

If a behavior fails **3 consecutive times** (configurable via `maxFailures`), it is automatically paused to prevent runaway errors. The failure count resets to zero on any successful execution.

### Execution Timeout

Each behavior execution has a **60-second timeout**. If the action does not complete within this window, it is treated as a failure.

### Active Behavior Limit

A maximum of **50 active behaviors** can run simultaneously. This limit prevents resource exhaustion on the host machine. Paused and deleted behaviors do not count toward the limit.

### Retry on Transient Failure

When a behavior execution fails, it is retried once after a **30-second delay** before recording the failure. This catches transient network issues without requiring manual intervention.

## Durable Job Queue

Behaviors are backed by a **SQLite-based durable job queue** that survives process crashes and restarts. This is the same job queue described in the [Orchestration](orchestration.md) documentation.

### Crash Recovery

When Auxiora restarts, any jobs that were in `running` state are automatically reset to `pending` with an incremented attempt counter. This means a behavior execution that was interrupted by a crash will be retried on the next startup.

### Exponential Backoff

Failed jobs are retried with exponential backoff: the delay before the Nth retry is `2^attempt * 1000` milliseconds. After **3 attempts** (configurable), the job is moved to the dead-letter state.

### Non-Retryable Errors

Some errors are marked as non-retryable (e.g., invalid configuration, missing credentials). These skip the retry queue and are recorded as dead immediately.

### Checkpoint Support

Long-running behavior handlers can call `ctx.checkpoint(data)` to persist intermediate state. If the process crashes, the handler resumes from the last checkpoint via `ctx.getCheckpoint()` rather than starting over.

### Fallback Mode

If the SQLite job queue is unavailable (e.g., during first run before initialization), behaviors fall back to an in-memory execution queue. This queue does not survive crashes but ensures behaviors still function.

## Use Cases

### 1. Morning Briefing

A scheduled behavior at 8:00 AM pulls your calendar events, email summaries, weather forecast, and top news stories. The compiled briefing is delivered via Telegram before you start your day.

```bash
auxiora behaviors create \
  --type scheduled \
  --cron "0 8 * * *" \
  --prompt "Generate my morning briefing: calendar, unread emails, weather, top news" \
  --channel telegram
```

### 2. Competitor Monitoring

A monitor behavior checks competitor websites every 6 hours, diffs the content against the previous snapshot, and summarizes any changes.

```bash
auxiora behaviors create \
  --type monitor \
  --interval 21600 \
  --prompt "Check competitor.com/pricing for changes and summarize any differences" \
  --channel slack
```

### 3. Meeting Prep

A one-shot reminder fires 30 minutes before each meeting. It pulls attendee information from Google Workspace, related Notion documents, and recent email threads to prepare a context brief.

```bash
auxiora behaviors create \
  --type one-shot \
  --at "2026-02-25T13:30:00" \
  --prompt "Prep me for my 2pm meeting: pull attendee info, Notion project notes, recent email threads"
```

### 4. Health Check

A monitor behavior pings your production API health endpoint every 5 minutes and alerts you on Telegram if it returns a non-200 status.

```bash
auxiora behaviors create \
  --type monitor \
  --interval 300 \
  --prompt "Check https://api.example.com/health — alert me if status is not 200" \
  --channel telegram
```

## Related Documentation

- [Ambient Intelligence](ambient.md) -- Proactive briefings and pattern detection built on top of behaviors
- [Orchestration & ReAct](orchestration.md) -- Job queue details and multi-agent patterns
- [CLI Reference](cli.md) -- Full command reference for `auxiora behaviors`
- [Vault & Security](vault-and-security.md) -- Trust levels that govern autonomous behavior execution
