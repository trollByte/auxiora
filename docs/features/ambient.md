# Ambient Intelligence

> Proactive awareness: pattern detection, briefings, anticipation, and quiet notifications.

## Overview

The ambient intelligence system observes your activity across channels, connectors, and behaviors to build a model of your routines. It detects patterns, anticipates needs, generates personalized briefings, and delivers notifications at the right priority level. Unlike behaviors (which you configure explicitly), ambient intelligence emerges from observation -- it learns what matters to you and surfaces it before you ask.

## How It Works

Auxiora's ambient engine runs a continuous observation loop:

1. **Observe** -- Every interaction (messages, connector events, behavior executions, calendar changes) is recorded as an `ObservedEvent` with a timestamp and metadata.
2. **Detect** -- A sliding-window pattern engine (default: 7-day window) analyzes events for recurring schedules, frequency patterns, and temporal correlations. Patterns require at least 3 occurrences and 30% confidence to be surfaced.
3. **Anticipate** -- Detected patterns feed into the anticipation engine, which predicts upcoming needs and suggests proactive actions.
4. **Notify** -- Results are routed through a priority-based notification system that batches low-priority items and escalates urgent ones.

## Features

### Pattern Detection

The pattern engine detects four types of patterns:

| Pattern Type | What It Detects | Example |
|-------------|-----------------|---------|
| **Schedule** | Events recurring at similar times of day | "Code review events frequently occur around 14:00" |
| **Preference** | Events occurring at regular intervals | "Email checking occurs roughly every 2.5 hours" |
| **Correlation** | Event B frequently follows event A within 5 minutes | "Slack messages often follow GitHub notifications" |
| **Trigger** | Event sequences that signal a specific condition | "Three failed CI runs in a row" |

Each pattern includes a confidence score (0--1), evidence trail, occurrence count, and timestamps for when it was first detected and last confirmed. Pattern confidence increases by 0.05 each time the pattern is re-confirmed.

### Briefings

Configurable morning and evening summaries that pull from all connected data sources.

**Morning briefing** sections:
- Pending notifications
- Today's calendar schedule
- Active tasks
- Observed patterns (50%+ confidence)
- Anticipated upcoming events

**Evening briefing** sections:
- Pending notifications
- Tomorrow's schedule
- Active tasks
- Patterns and anticipations

Briefings are configurable:

```json
{
  "ambient": {
    "briefings": {
      "enabled": true,
      "morningTime": "08:00",
      "eveningTime": "20:00",
      "categories": ["calendar", "tasks", "weather", "news", "patterns"],
      "maxItemsPerSection": 5
    }
  }
}
```

Generate a briefing on demand via CLI:

```bash
auxiora ambient briefing               # Morning briefing (default)
auxiora ambient briefing --time evening # Evening summary
```

### Anticipation

The anticipation engine predicts what you will need next based on detected patterns:

- **Schedule-based** -- If you always review PRs at 2pm, Auxiora prepares a PR summary 15 minutes before.
- **Frequency-based** -- If you check email every 2.5 hours, Auxiora pre-fetches an email summary when the interval approaches.
- **Correlation-based** -- If Slack activity always follows GitHub notifications, Auxiora prepares Slack context when a GitHub event arrives.
- **Trigger-based** -- If a trigger pattern fires (e.g., repeated CI failures), Auxiora immediately generates a diagnostic summary.

Anticipations require a minimum confidence of 0.4 from the source pattern. Confidence is further scaled per pattern type (schedule: 0.8x, preference: 0.7x, correlation: 0.6x, trigger: 0.9x) to reflect prediction reliability.

### Quiet Notifications

Not everything deserves an interruption. The notification system uses three priority levels:

| Priority | Behavior | Use Case |
|----------|----------|----------|
| **alert** | Immediate delivery, interrupts current activity | Production outage, urgent email from boss |
| **nudge** | Delivered at next natural break point | PR approved, meeting in 15 minutes |
| **whisper** | Batched into daily/weekly digest | Pattern detected, low-priority update |

Notifications are sorted by priority within the queue. Old dismissed notifications are automatically pruned after 24 hours.

## Configuration

### CLI Commands

```bash
auxiora ambient status          # Show observed events, detected patterns, pending notifications
auxiora ambient briefing        # Generate a personalized briefing
auxiora ambient patterns        # Show detected behavioral patterns
auxiora ambient patterns -l 20  # Show up to 20 patterns
auxiora ambient notifications   # Show pending quiet notifications
```

### Enabling / Disabling

Ambient intelligence can be toggled globally:

```bash
auxiora ambient enable          # Enable ambient features
auxiora ambient disable         # Disable ambient features
```

When disabled, no events are observed and no patterns are detected. Existing patterns and notifications are preserved and resume when re-enabled.

### Dashboard

The **Settings > Ambient** page provides toggles for:

- Pattern detection (on/off)
- Briefing schedule (morning/evening times)
- Briefing categories (calendar, tasks, weather, news, patterns)
- Notification priority thresholds
- Maximum items per briefing section

## Architecture

The ambient system is composed of several cooperating modules:

| Module | Responsibility |
|--------|---------------|
| `AmbientPatternEngine` | Sliding-window event observation and pattern detection |
| `AnticipationEngine` | Predicts user needs from detected patterns |
| `BriefingGenerator` | Compiles data sources into structured morning/evening briefings |
| `QuietNotificationManager` | Priority-based notification queue with dismissal and pruning |
| `AmbientScheduler` | Coordinates timed execution of ambient tasks |
| `NotificationOrchestrator` | Routes notifications to appropriate delivery channels |
| `AmbientAwarenessCollector` | Gathers events from channels, connectors, and behaviors |

All state can be serialized and restored across restarts via `AmbientPatternEngine.serialize()` and `AmbientPatternEngine.deserialize()`.

## Use Cases

### 1. Executive Assistant

The ambient system observes your calendar, email, and task management tools throughout the week. Each morning at 8:00 AM, it delivers a briefing with today's meetings, flagged emails, overdue tasks, and any patterns it has noticed (e.g., "You tend to schedule deep work on Wednesday afternoons"). Before each meeting, it prepares a context brief with attendee backgrounds and relevant documents.

### 2. Developer Awareness

As you work, the ambient system tracks GitHub notifications, CI pipeline results, and Slack activity. It detects that your CI pipeline has failed 3 times today and proactively surfaces a summary of the failures as a `nudge` notification. It also notices that you always check Slack within 5 minutes of a GitHub notification and begins pre-loading relevant Slack threads.

### 3. Meeting Intelligence

The anticipation engine detects a recurring pattern: you have a standup at 9:30 AM every weekday. Fifteen minutes before, it prepares context -- yesterday's standup notes, your completed tasks since then, and any blockers from your project tracker. The preparation is delivered as a `nudge` notification so it is ready when you need it, without interrupting deep work.

## Related Documentation

- [Behaviors](behaviors.md) -- Explicit automation rules that complement ambient intelligence
- [Personality System](personality.md) -- The Architect's context detection feeds into ambient patterns
- [Memory](memory.md) -- Ambient patterns contribute to the assistant's long-term memory
- [CLI Reference](cli.md) -- Full command reference for `auxiora ambient`
