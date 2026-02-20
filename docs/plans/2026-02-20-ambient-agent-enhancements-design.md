# Ambient Agent Enhancements Design

**Date:** 2026-02-20
**Status:** Approved

## Goal

Close the remaining gaps in the ambient agent runtime: persist learned patterns across restarts, feed ambient signals to the self-awareness pipeline, add event-driven behavior triggers with a condition DSL, and expose REST endpoints for pattern/notification/scheduler management.

## Decisions

- **Approach:** Layered integration (4 focused layers, each independently testable)
- **Pattern storage:** Encrypted vault (key: `ambient:patterns`)
- **Event triggers:** New `event` behavior type with simple field-matching condition DSL (AND/OR combinators, 7 operators)
- **Awareness:** New `AmbientAwarenessCollector` following the same pattern as `ArchitectAwarenessCollector`

## Layer 1: Pattern Persistence

Add `serialize()`/`deserialize()` to `AmbientPatternEngine`.

- `serialize()` returns JSON string of internal patterns map + events window
- `static deserialize(data: string)` reconstructs engine state
- Runtime persists after each `detectPatterns()` cycle to vault key `ambient:patterns`
- Runtime restores on startup before first detection cycle

## Layer 2: Ambient Awareness Collector

New `AmbientAwarenessCollector` implements `SignalCollector`:

| Dimension | Priority | Content |
|-----------|----------|---------|
| `ambient-patterns` | 0.5 | Top 3 high-confidence patterns with descriptions |
| `ambient-anticipations` | 0.7 | Upcoming predicted needs (next 1 hour) |
| `ambient-activity` | 0.3 | Current event rate, active behaviors count |

Registered in runtime alongside the Architect collector. Updated after each trigger poll cycle.

## Layer 3: Event-Driven Behavior Triggers

### New Types

```ts
type BehaviorType = 'scheduled' | 'monitor' | 'one-shot' | 'event';

interface BehaviorEventTrigger {
  source: string;           // connector ID
  event: string;            // trigger ID
  conditions: EventCondition[];
  combinator: 'and' | 'or';
}

interface EventCondition {
  field: string;            // dot-notation path into event.data
  op: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'exists';
  value: string | number | boolean;
}
```

### Condition Evaluator

Pure function `evaluateConditions(data, conditions, combinator)`:
- Resolves `field` via dot-notation traversal of event data
- Applies operator comparison
- Combines with AND (all must match) or OR (any must match)
- Returns boolean

### Event Routing Flow

```
TriggerManager.pollAll() → TriggerEvent[]
    ↓
For each event:
  1. AmbientPatternEngine.observe(event)
  2. Match against all active event-type behaviors
  3. If evaluateConditions(event.data, behavior.eventTrigger.conditions, combinator):
     → BehaviorManager.executeNow(behaviorId)
     → audit('behavior.event_triggered', { behaviorId, source, event })
```

## Layer 4: REST API

Router mounted at `/api/v1/ambient`:

### Pattern Management
```
GET    /patterns                    — All detected patterns (sorted by confidence)
GET    /patterns/:id                — Single pattern by ID
POST   /patterns/detect             — Force detection cycle
DELETE /patterns                    — Reset all patterns
```

### Anticipations
```
GET    /anticipations               — Upcoming anticipated needs
```

### Notifications
```
GET    /notifications               — List notifications (query: priority, dismissed)
POST   /notifications/:id/dismiss   — Dismiss a notification
GET    /notifications/stats         — Counts by priority level
```

### Scheduler Control
```
GET    /scheduler/status            — Running state, next briefing times
POST   /scheduler/start             — Start the ambient scheduler
POST   /scheduler/stop              — Stop the ambient scheduler
PUT    /scheduler/config            — Update briefing config (times, categories)
```

## Audit Events

| Event | When |
|-------|------|
| `ambient.patterns.detected` | After detection cycle (pattern count) |
| `ambient.patterns.reset` | All patterns cleared |
| `ambient.scheduler.started` | Scheduler started |
| `ambient.scheduler.stopped` | Scheduler stopped |
| `behavior.event_triggered` | Event-type behavior fired by condition match |

## Files Changed

| File | Change |
|------|--------|
| `packages/ambient/src/pattern-engine.ts` | Add serialize/deserialize |
| `packages/ambient/src/ambient-awareness-collector.ts` | New: awareness collector |
| `packages/ambient/src/index.ts` | Export new collector |
| `packages/behaviors/src/types.ts` | Add `event` type, condition DSL types |
| `packages/behaviors/src/condition-evaluator.ts` | New: pure condition evaluation |
| `packages/runtime/src/index.ts` | Pattern persistence, awareness registration, event routing, REST router |
| `packages/audit/src/index.ts` | New audit event types |
| Tests for each new/modified file |

## What This Does NOT Change

- Existing behavior types (scheduled, monitor, one-shot) — unchanged
- The AmbientPatternEngine detection algorithms — unchanged
- The BriefingGenerator or NotificationOrchestrator — unchanged
- Existing connector implementations — unchanged
