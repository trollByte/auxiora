# Self-Awareness Design: Capability Catalog & Self-Diagnosis

## Goal

Give Auxiora introspection — a live understanding of her own capabilities, health, and configuration — so she can accurately describe what she can do, detect when something breaks, and (at sufficient trust levels) fix herself.

## Architecture

A new `packages/introspection` package provides two core systems:

1. **CapabilityCatalog** — event-driven registry of everything Auxiora can do right now
2. **HealthMonitor** — continuous background loop detecting issues across all subsystems

These feed into:
- A **prompt fragment** injected into the system prompt (always-on awareness)
- An **introspect tool** the AI can call for deep queries
- **Mission Control** panels for user visibility
- **Trust-gated auto-fixes** for self-healing

## Capability Catalog

### Data Model

```typescript
interface CapabilityCatalog {
  tools: ToolCapability[];
  channels: ChannelCapability[];
  behaviors: BehaviorCapability[];
  providers: ProviderCapability[];
  plugins: PluginCapability[];
  features: FeatureFlags;
  updatedAt: string;
}
```

### Update Strategy

Event-driven via audit `onEntry` callback. When the catalog sees events like `channel.connected`, `plugin.loaded`, `behavior.created`, it rebuilds the relevant section (not the full catalog). Built once at startup by querying all registries.

### Prompt Fragment

A compact text block injected into the system prompt after identity, before mode instructions:

```
[Self-Awareness]
Tools (12): bash, web_browser, file_read, file_write, research, ...
Channels: discord (connected), telegram (connected), webchat (active)
Behaviors: 3 active, 1 paused
Provider: Anthropic Claude (primary), OpenAI (fallback)
Plugins: 2 loaded (weather, calendar-sync)
Health: All systems operational
```

Regenerated when the catalog changes, not on every message.

## Health Monitor

### Monitored Subsystems

| Subsystem | Check | Interval | Unhealthy when |
|-----------|-------|----------|----------------|
| Providers | `isAvailable()` | 60s | Primary unavailable, no fallback |
| Channels | `isConnected()` | 30s | Configured but disconnected |
| Behaviors | `failCount` vs `maxFailures` | 60s | Approaching or hit failure threshold |
| Plugins | `status` field | 60s | Status is 'failed' |
| Memory | Store accessible | 120s | Read/write fails |

### Health State Model

```typescript
interface HealthState {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  subsystems: Map<string, SubsystemHealth>;
  issues: HealthIssue[];
  lastCheck: string;
}

interface HealthIssue {
  id: string;
  subsystem: string;
  severity: 'warning' | 'critical';
  description: string;
  detectedAt: string;
  suggestedFix?: string;
  autoFixable: boolean;
  trustLevelRequired?: number;
}
```

### Trust-Gated Auto-Fix

When an issue is detected:
1. Log to audit (`health.issue_detected`)
2. Broadcast to Mission Control (`health_update` event)
3. If `autoFixable` and trust level sufficient: execute fix, log `health.auto_fix`, notify user
4. If trust level too low: report to user with suggested fix

## Introspection Tool

```typescript
{
  name: 'introspect',
  description: 'Query your own capabilities, health, and configuration',
  parameters: [
    { name: 'query', type: 'string', required: true,
      description: '"capabilities", "health", "config", "errors", or a subsystem name' },
    { name: 'timeRange', type: 'string', required: false,
      description: 'For error queries: "1h", "24h", "7d". Defaults to "1h".' }
  ]
}
```

### Query Types

- **capabilities** — Full catalog: tools with descriptions, channels with status, behaviors, providers with models
- **health** — Active issues, recent auto-fixes, subsystem status
- **config** — Feature flags, enabled subsystems, configured channels/providers
- **errors** — Aggregated error patterns from audit log, grouped by subsystem
- **channels/providers/behaviors/plugins** — Deep dive into specific subsystem

### Error Aggregation

Returns patterns, not raw entries:
```
Errors (last 1h):
- channels.discord: 3 send failures (last: 12m ago)
- tools.research: 2 failures — "Research engine not configured"
- behaviors: "daily-news" paused after 3 consecutive failures
```

## Runtime Wiring

### Initialization Order

1. Existing setup (vault, providers, channels, behaviors, etc.)
2. Create CapabilityCatalog — query all registries
3. Create HealthMonitor — start background check loop
4. Register introspect tool in tool registry
5. Subscribe catalog to audit `onEntry` for live updates
6. Inject prompt fragment into system prompt assembly

### Event Flow (capability change)

```
adapter event → audit log → onEntry fires
  → catalog rebuilds section → prompt fragment regenerated
  → health monitor updates → broadcast to Mission Control
```

### Event Flow (trust-gated auto-fix)

```
health monitor detects issue → creates HealthIssue
  → trust.getLevel(domain) >= trustLevelRequired?
    → YES: execute fix, log health.auto_fix, notify user
    → NO: log health.issue_detected, notify user with suggested fix
```

## Mission Control Integration

- **Status strip** — 4th card: Health indicator (green/yellow/red)
- **Health alert bar** — Below status strip when issues exist
- **WebSocket events:** `health_update`, `catalog_update`
- **REST endpoints:** `GET /status/health`, `GET /status/capabilities`

## Package Structure

```
packages/introspection/
  src/
    catalog.ts         — CapabilityCatalog class
    health-monitor.ts  — HealthMonitor class
    introspect-tool.ts — IntrospectionTool for AI
    prompt-fragment.ts — compact prompt text generator
    types.ts           — shared interfaces
    index.ts           — exports
```

## Files to Modify

- `packages/runtime/src/index.ts` — wire in catalog, monitor, tool, prompt injection
- `packages/personality/src/modes/prompt-assembler.ts` — add capability section to prompt assembly
- `packages/dashboard/src/router.ts` — add health + capabilities endpoints
- `packages/dashboard/src/types.ts` — add deps for health/capabilities
- `packages/dashboard/ui/src/pages/Overview.tsx` — health card + alert bar
- `packages/dashboard/ui/src/styles/global.css` — health indicator styles

## Files to Create

- `packages/introspection/` — entire new package
- `packages/introspection/package.json`
- `packages/introspection/tsconfig.json`
- `packages/introspection/src/types.ts`
- `packages/introspection/src/catalog.ts`
- `packages/introspection/src/health-monitor.ts`
- `packages/introspection/src/introspect-tool.ts`
- `packages/introspection/src/prompt-fragment.ts`
- `packages/introspection/src/index.ts`
