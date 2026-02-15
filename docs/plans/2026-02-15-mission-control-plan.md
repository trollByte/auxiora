# Mission Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static Overview page with a real-time Mission Control featuring a live activity feed and behavior health panel.

**Architecture:** The audit logger gains an `onEntry` callback. The runtime wires it to broadcast curated events over the existing WebSocket gateway. The dashboard subscribes on mount and renders events in real-time, with initial backfill from the REST audit endpoint.

**Tech Stack:** TypeScript, React, WebSocket (existing gateway), CSS variables (existing theme system)

---

### Task 1: Add `onEntry` callback to AuditLogger

**Files:**
- Modify: `packages/audit/src/index.ts:191-260`

**Step 1: Add the callback property and wire it into `log()`**

In `AuditLogger` class, add a public `onEntry` property and call it at the end of `log()`:

```typescript
// Add after line 195 (private initialized)
public onEntry?: (entry: AuditEntry) => void;
```

At the end of the `log()` method, after the `appendFile` call (after line 254), add:

```typescript
this.onEntry?.(entry);
```

**Step 2: Build audit package**

Run: `pnpm --filter audit build`
Expected: clean compile

**Step 3: Commit**

```bash
git add packages/audit/src/index.ts
git commit -m "feat(audit): add onEntry callback for real-time event streaming"
```

---

### Task 2: Wire audit events to gateway broadcast in runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Import `getAuditLogger` and define curated event prefixes**

Near the top of `packages/runtime/src/index.ts`, the audit module is already imported. After the `Auxiora` class constructor sets up the gateway (around line 307), wire the audit listener.

Add this constant at module level (or inside the class):

```typescript
const ACTIVITY_EVENT_PREFIXES = [
  'behavior.', 'message.', 'channel.', 'webhook.',
  'system.', 'auth.login', 'auth.logout',
];
```

**Step 2: Wire the onEntry callback after gateway is ready**

In the `start()` method, after the gateway is set up and before behavior initialization (around line 309), add:

```typescript
// Stream curated audit events to dashboard via WebSocket
const auditLogger = getAuditLogger();
auditLogger.onEntry = (entry) => {
  const isActivityEvent = ACTIVITY_EVENT_PREFIXES.some(
    (prefix) => entry.event.startsWith(prefix)
  );
  if (isActivityEvent) {
    this.gateway.broadcast(
      { type: 'activity', payload: entry },
      (client) => client.authenticated
    );
  }
};
```

Note: We filter to `authenticated` clients only so unauthenticated WebSocket connections don't receive audit data.

**Step 3: Build runtime package**

Run: `pnpm --filter runtime build`
Expected: clean compile

**Step 4: Run tests**

Run: `pnpm test`
Expected: all tests pass

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): broadcast curated audit events over WebSocket"
```

---

### Task 3: Create ActivityFeed component

**Files:**
- Create: `packages/dashboard/ui/src/components/ActivityFeed.tsx`

**Step 1: Create the component**

```tsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface ActivityEvent {
  timestamp: string;
  sequence: number;
  event: string;
  details: Record<string, unknown>;
}

const EVENT_LABELS: Record<string, (d: Record<string, unknown>) => string> = {
  'behavior.executed': (d) => d.success ? `Behavior ran successfully` : `Behavior failed: ${d.error ?? 'unknown'}`,
  'behavior.created': () => 'Behavior created',
  'behavior.updated': () => 'Behavior updated',
  'behavior.deleted': () => 'Behavior deleted',
  'behavior.paused': () => 'Behavior paused',
  'behavior.failed': (d) => `Behavior failed: ${d.error ?? 'unknown'}`,
  'message.received': (d) => `Message received on ${d.channelType ?? 'unknown'}`,
  'message.sent': (d) => `Message sent to ${d.channelType ?? 'unknown'}`,
  'message.filtered': () => 'Message filtered',
  'channel.connected': (d) => `${d.channelType ?? 'Channel'} connected`,
  'channel.disconnected': (d) => `${d.channelType ?? 'Channel'} disconnected`,
  'channel.error': (d) => `${d.channelType ?? 'Channel'} error`,
  'webhook.triggered': (d) => `Webhook triggered: ${d.path ?? ''}`,
  'webhook.received': () => 'Webhook received',
  'webhook.created': () => 'Webhook created',
  'webhook.deleted': () => 'Webhook deleted',
  'webhook.error': (d) => `Webhook error: ${d.error ?? 'unknown'}`,
  'system.startup': () => 'System started',
  'system.shutdown': () => 'System shut down',
  'system.error': (d) => `System error: ${d.error ?? 'unknown'}`,
  'auth.login': () => 'Login',
  'auth.logout': () => 'Logout',
};

const CATEGORY_COLORS: Record<string, string> = {
  behavior: 'var(--accent)',
  message: '#3b82f6',
  channel: 'var(--success)',
  webhook: '#f97316',
  system: 'var(--text-secondary)',
  auth: 'var(--danger)',
};

function getCategory(event: string): string {
  return event.split('.')[0];
}

function getLabel(event: string, details: Record<string, unknown>): string {
  const fn = EVENT_LABELS[event];
  if (fn) return fn(details);
  // Fallback: humanize event name
  return event.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const MAX_EVENTS = 100;

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Backfill from REST on mount
  useEffect(() => {
    api.getAudit({ limit: 50 }).then((res) => {
      if (res.data) {
        // Filter to activity-relevant events and reverse so newest first
        const PREFIXES = ['behavior.', 'message.', 'channel.', 'webhook.', 'system.', 'auth.login', 'auth.logout'];
        const filtered = res.data
          .filter((e: any) => PREFIXES.some((p) => e.event.startsWith(p)))
          .reverse();
        setEvents(filtered);
      }
    }).catch(() => {});
  }, []);

  // Subscribe to real-time events via WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:18800' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'activity' && msg.payload) {
          setEvents((prev) => {
            const next = [msg.payload, ...prev];
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
          });
        }
      } catch { /* ignore non-JSON */ }
    };

    return () => { ws.close(); };
  }, []);

  return (
    <div className="activity-feed">
      <h3 className="mc-section-title">Live Activity</h3>
      <div className="activity-feed-list">
        {events.length === 0 && (
          <div className="activity-empty">No recent activity</div>
        )}
        {events.map((e, i) => {
          const cat = getCategory(e.event);
          const color = CATEGORY_COLORS[cat] ?? 'var(--text-secondary)';
          return (
            <div key={`${e.sequence}-${i}`} className="activity-item">
              <span className="activity-dot" style={{ background: color }} />
              <span className="activity-label">{getLabel(e.event, e.details)}</span>
              <span className="activity-time">{timeAgo(e.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/ui/src/components/ActivityFeed.tsx
git commit -m "feat(dashboard): add ActivityFeed component with real-time WebSocket streaming"
```

---

### Task 4: Create BehaviorHealth component

**Files:**
- Create: `packages/dashboard/ui/src/components/BehaviorHealth.tsx`

**Step 1: Create the component**

```tsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface Behavior {
  id: string;
  type: 'scheduled' | 'monitor' | 'one-shot';
  status: 'active' | 'paused' | 'deleted' | 'missed';
  action: string;
  runCount: number;
  failCount: number;
  maxFailures: number;
  lastRun?: string;
  lastResult?: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getHealthColor(b: Behavior): string {
  if (b.status === 'paused' && b.failCount >= b.maxFailures) return 'var(--danger)';
  if (b.status === 'paused') return 'var(--text-secondary)';
  if (b.failCount > 0) return 'var(--warning)';
  return 'var(--success)';
}

function getHealthLabel(b: Behavior): string {
  if (b.status === 'paused' && b.failCount >= b.maxFailures) return 'Auto-paused';
  if (b.status === 'paused') return 'Paused';
  if (b.failCount > 0) return `${b.failCount} failures`;
  return 'Healthy';
}

const TYPE_LABELS: Record<string, string> = {
  scheduled: 'Sched',
  monitor: 'Monitor',
  'one-shot': 'Once',
};

export function BehaviorHealth() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch behaviors on mount
  useEffect(() => {
    api.getBehaviors().then((res) => {
      if (res.data) {
        setBehaviors(res.data.filter((b: any) => b.status !== 'deleted'));
      }
    }).catch(() => {});
  }, []);

  // Listen for real-time behavior execution events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:18800' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'activity' && msg.payload?.event?.startsWith('behavior.')) {
          // Re-fetch behaviors to get updated state
          api.getBehaviors().then((res) => {
            if (res.data) {
              setBehaviors(res.data.filter((b: any) => b.status !== 'deleted'));
            }
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    };

    return () => { ws.close(); };
  }, []);

  return (
    <div className="behavior-health">
      <h3 className="mc-section-title">Behavior Health</h3>
      {behaviors.length === 0 && (
        <div className="bh-empty">No behaviors configured</div>
      )}
      <div className="bh-list">
        {behaviors.map((b) => (
          <div key={b.id} className="bh-card">
            <div className="bh-card-header">
              <span className="bh-dot" style={{ background: getHealthColor(b) }} />
              <span className="bh-action">{b.action.length > 60 ? b.action.slice(0, 57) + '...' : b.action}</span>
              <span className="bh-type-badge">{TYPE_LABELS[b.type] ?? b.type}</span>
            </div>
            <div className="bh-card-meta">
              <span className="bh-health-label" style={{ color: getHealthColor(b) }}>{getHealthLabel(b)}</span>
              <span className="bh-stat">{b.runCount} runs</span>
              {b.lastRun && <span className="bh-stat">{timeAgo(b.lastRun)}</span>}
            </div>
            {b.lastResult && (
              <div className="bh-result">{b.lastResult.length > 120 ? b.lastResult.slice(0, 117) + '...' : b.lastResult}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/ui/src/components/BehaviorHealth.tsx
git commit -m "feat(dashboard): add BehaviorHealth component with real-time updates"
```

---

### Task 5: Rewrite Overview page as Mission Control

**Files:**
- Modify: `packages/dashboard/ui/src/pages/Overview.tsx`

**Step 1: Replace the Overview page content**

Replace the entire file with:

```tsx
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { ActivityFeed } from '../components/ActivityFeed';
import { BehaviorHealth } from '../components/BehaviorHealth';

export function Overview() {
  const { data: status, refresh } = useApi(() => api.getStatus(), []);
  const { data: models, refresh: refreshModels } = useApi(() => api.getModels(), []);
  usePolling(() => { refresh(); refreshModels(); });

  const s = status?.data;
  const primaryProvider = models?.providers?.find((p: any) => p.available)?.displayName ?? 'None';

  return (
    <div className="page">
      <h2>Mission Control</h2>

      {/* Quick status strip */}
      <div className="status-grid">
        <div className="status-card">
          <h3>Connections</h3>
          <div className="value">{s?.connections ?? 0}</div>
          <div className="sub">Active sessions</div>
        </div>
        <div className="status-card">
          <h3>Provider</h3>
          <div className="value">{primaryProvider}</div>
          <div className="sub">{s?.activeModel?.model ?? 'unknown'}</div>
        </div>
        <div className="status-card">
          <h3>Uptime</h3>
          <div className="value">{s ? formatUptime(s.uptime) : '-'}</div>
          <div className="sub">Since last restart</div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="mc-columns">
        <div className="mc-left">
          <BehaviorHealth />
        </div>
        <div className="mc-right">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/ui/src/pages/Overview.tsx
git commit -m "feat(dashboard): rewrite Overview as Mission Control with activity feed and behavior health"
```

---

### Task 6: Add CSS styles for Mission Control

**Files:**
- Modify: `packages/dashboard/ui/src/styles/global.css`

**Step 1: Add styles after the existing status-card section (after line 261)**

```css
/* ── Mission Control ──────────────────────────── */

.mc-columns {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 1.5rem;
  min-height: 0;
}

.mc-section-title {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

/* Activity Feed */
.activity-feed-list {
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--bg-card);
  font-size: 0.82rem;
  animation: mc-fade-in var(--transition-base);
}

.activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.activity-label {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-time {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.activity-empty {
  color: var(--text-secondary);
  font-size: 0.82rem;
  padding: 1rem 0.75rem;
}

/* Behavior Health */
.bh-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bh-card {
  background: var(--bg-card);
  padding: 0.75rem;
  border-radius: var(--radius);
}

.bh-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bh-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bh-action {
  flex: 1;
  font-size: 0.82rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bh-type-badge {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.bh-card-meta {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.35rem;
  font-size: 0.72rem;
}

.bh-health-label {
  font-weight: 500;
}

.bh-stat {
  color: var(--text-secondary);
}

.bh-result {
  margin-top: 0.35rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.bh-empty {
  color: var(--text-secondary);
  font-size: 0.82rem;
  padding: 1rem 0;
}

@keyframes mc-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Step 2: Add responsive breakpoint (in the existing media queries section)**

Find the media query section and add:

```css
@media (max-width: 900px) {
  .mc-columns {
    grid-template-columns: 1fr;
  }
}
```

**Step 3: Commit**

```bash
git add packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): add Mission Control CSS styles"
```

---

### Task 7: Build and verify

**Step 1: Build all affected packages**

Run: `pnpm --filter audit build && pnpm --filter runtime build && pnpm --filter dashboard build`
Expected: all compile cleanly

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: all tests pass

**Step 3: Final commit if any fixes needed, then push**

```bash
git push
```
