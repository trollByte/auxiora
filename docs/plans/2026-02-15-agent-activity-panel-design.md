# Agent Activity Panel Design

## Overview

Add a real-time "Active Now" panel to Mission Control showing what agents are doing right now — behavior executions in flight and channel messages being processed by the AI.

## Architecture

WebSocket events for real-time updates + REST snapshot for page load hydration. The runtime maintains a `Map<string, AgentActivity>` of active agents, broadcasts start/end events over WebSocket, and exposes the map via a REST endpoint.

## Data Model

```typescript
interface AgentActivity {
  id: string;
  type: 'behavior' | 'channel';
  description: string;      // behavior action text or "Processing message on discord"
  channelType?: string;      // 'discord', 'telegram', etc.
  startedAt: string;         // ISO timestamp
}
```

## Backend Changes

### Runtime tracking map (runtime/src/index.ts)

- Add `private activeAgents: Map<string, AgentActivity>` to `Auxiora` class
- Helper methods `agentStart(activity)` and `agentEnd(id, success)` that update the map and broadcast WebSocket events

### WebSocket events

- `{ type: 'agent_start', payload: AgentActivity }` — when execution begins
- `{ type: 'agent_end', payload: { id, duration, success } }` — when execution completes

### Hook points

1. **Behavior execution** — In `sendToChannel` callback, wrap with start/end. Use behavior ID from the executor. Actually better: hook in `BehaviorManager.enqueueExecution()` since that's where execution starts/ends.

2. **Channel message processing** — In `handleChannelMessage`, wrap the `executeWithTools` call with start/end. ID: `channel:${inbound.channelType}:${inbound.channelId}`.

### REST snapshot endpoint

- `GET /api/v1/dashboard/status/agents` → `{ data: AgentActivity[] }`
- Returns `Array.from(activeAgents.values())`

## Frontend Changes

### AgentActivity component

- On mount: fetch from `GET /status/agents` to hydrate
- Subscribe to WebSocket `agent_start` / `agent_end` events
- Render active agents as cards with pulsing dot, description, channel badge, elapsed time (ticking via setInterval)
- When empty: "All quiet" message

### Layout

Placed above BehaviorHealth in the left column of Mission Control.

## Files to modify

- `packages/runtime/src/index.ts` — tracking map, start/end helpers, hook points
- `packages/dashboard/src/router.ts` — REST endpoint
- `packages/dashboard/ui/src/pages/Overview.tsx` — add AgentActivity component
- `packages/dashboard/ui/src/styles/global.css` — styles

## Files to create

- `packages/dashboard/ui/src/components/AgentActivity.tsx`
