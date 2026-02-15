# Mission Control: Live Activity Feed & Behavior Health

## Overview

Replace the static Overview page with an operational Mission Control view featuring real-time activity streaming and per-behavior health status.

## Architecture: Gateway-side Event Filtering (Approach A)

The runtime hooks into the audit logger to broadcast curated events over WebSocket. The dashboard subscribes and renders them. Behavior health uses the existing REST endpoint on mount plus real-time updates from behavior WebSocket events.

## Backend Changes

### 1. Audit event broadcasting (runtime/src/index.ts)

Wire the audit logger to broadcast high-level events through the gateway:

- **Curated event prefixes:** `behavior.`, `message.`, `channel.`, `webhook.`, `system.`, `auth.login`, `auth.logout`
- **Broadcast format:** `{ type: 'activity', payload: AuditEntry }`
- **Implementation:** After the audit logger is initialized, register a listener that filters events and calls `gateway.broadcast()` for matching prefixes

### 2. Audit listener hook (packages/audit/src/index.ts)

Add an optional `onEntry` callback to the `AuditLogger` so the runtime can subscribe to new entries without polling:

```typescript
onEntry?: (entry: AuditEntry) => void;
```

Called inside `log()` after the entry is written.

## Frontend Changes

### 3. Mission Control page (replaces Overview)

**Layout:** Two-column on desktop (behaviors 40%, feed 60%), stacked on mobile.

```
┌─────────────────────────────────────┐
│ Mission Control          [status]   │
├──────────────┬──────────────────────┤
│  Behavior    │  Live Activity Feed  │
│  Health      │                      │
│  Cards       │  [event]             │
│  (left col)  │  [event]             │
│              │  ...                 │
└──────────────┴──────────────────────┘
```

### 4. Live Activity Feed component

- On mount: fetch last 50 events from `GET /audit?limit=50`
- Subscribe to WebSocket `activity` messages for real-time updates
- New events prepend to top
- Capped at 100 items in DOM
- Each event shows: relative timestamp, category icon/color, human-readable description
- Event categories and colors:
  - `behavior.*` — purple
  - `message.*` — blue
  - `channel.*` — green
  - `webhook.*` — orange
  - `system.*` — gray
  - `auth.*` — red

### 5. Behavior Health Panel component

- On mount: fetch from `GET /behaviors`
- Updates in real-time when `behavior.executed` activity events arrive
- Per-behavior card shows:
  - Action text (truncated), type badge (scheduled/monitor/one-shot)
  - Status: green (healthy), yellow (has failures), red (auto-paused), gray (manually paused)
  - Last run as relative time, last result preview
  - Run count / fail count

### 6. Human-readable event descriptions

Map audit event types to user-friendly text:
- `behavior.executed` → "Behavior '{action}' executed successfully" / "Behavior '{action}' failed"
- `message.received` → "Message received on {channelType}"
- `message.sent` → "Message sent to {channelType}"
- `channel.connected` → "{channelType} connected"
- `webhook.triggered` → "Webhook '{name}' triggered"
- `system.started` → "System started"
- `auth.login` → "Dashboard login"

## Files to modify

- `packages/audit/src/index.ts` — Add `onEntry` callback
- `packages/runtime/src/index.ts` — Wire audit → gateway broadcast
- `packages/dashboard/ui/src/pages/Overview.tsx` — Rewrite as Mission Control
- `packages/dashboard/ui/src/api.ts` — Add audit fetch helper
- `packages/gateway/src/types.ts` — Document `activity` message type (optional)

## Files to create

- `packages/dashboard/ui/src/components/ActivityFeed.tsx`
- `packages/dashboard/ui/src/components/BehaviorHealth.tsx`

## Not in scope

- Filtering/search within the feed (future enhancement)
- Click-to-expand event details
- Behavior management actions from Mission Control (use existing behaviors page)
