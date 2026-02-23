# Activation Push — Design Document

**Date**: 2026-02-23
**Goal**: Make Auxiora's existing features visible, activated, and demonstrable out of the box.

**Problem**: Auxiora has 12 channel adapters, self-authoring skills, webhooks, IoT connectors, a desktop app, and a marketplace — but most features default to off, the plugins directory is empty on first boot, and there's no system-level view of what's available. The competitive gap with OpenClaw isn't missing features — it's activation and visibility.

**Strategy**: Activation-first. Flip defaults, ship starter content, add visibility, enhance onboarding.

---

## 1. Aggressive Defaults

Enable all channel adapters by default. Adapters that lack credentials should initialize, detect no token, log a WARN, and stay idle (graceful no-op).

### Changes to `packages/config/src/index.ts`

| Setting | Old Default | New Default |
|---------|------------|-------------|
| `channels.discord.enabled` | `false` | `true` |
| `channels.slack.enabled` | `false` | `true` |
| `channels.signal.enabled` | `false` | `true` |
| `channels.email.enabled` | `false` | `true` |
| `channels.teams.enabled` | `false` | `true` |
| `channels.matrix.enabled` | `false` | `true` |
| `channels.whatsapp.enabled` | `false` | `true` |

Already enabled: `telegram`, `webchat`. Stays disabled: `voice` (requires API key, would error).

### Graceful degradation

Each adapter's `connect()` must check for required credentials and skip with a WARN log if missing. Verify all 12 adapters handle this case without throwing.

---

## 2. Starter Skills Bundle

Ship 5 pre-built skill files so the plugins system is never empty.

### Location

- Source: `packages/plugins/starter-skills/*.js`
- Destination: `$XDG_DATA_HOME/auxiora/plugins/` (copied on first boot when dir is empty)

### Skills

| Name | Description | Tools Used |
|------|-------------|------------|
| `daily-summary` | Morning briefing: calendar events, unread emails, pending tasks | calendar, email, memory |
| `smart-reply` | Context-aware reply suggestions for the last message | memory |
| `note-taker` | Extracts action items and key points, saves to memory | memory |
| `web-clipper` | Summarizes a URL and saves with tags to memory | web_browser, memory |
| `pomodoro` | 25-min focus timer with break reminders via notifications | notifications |

### Constraints

- No NETWORK/FILESYSTEM permissions (no approval needed)
- Follow existing plugin format: `export const plugin = { name, version, tools }`
- Each tool has JSON Schema parameters and an `execute()` function

### Loader changes

`PluginLoader` gains a `seedStarterSkills()` method called during initialization. If the plugins directory is empty or doesn't exist, copies starter skills from the bundle. Never overwrites existing files.

---

## 3. Feature Status Dashboard

New "System Status" app in the DesktopShell showing all features at a glance.

### Component

- File: `packages/dashboard/ui/src/pages/SystemStatus.tsx`
- Registered in DesktopShell APPS: `{ id: 'status', label: 'System Status', icon: '📊', component: SystemStatus, defaultWidth: 860, defaultHeight: 640 }`

### Three-tier layout

1. **Active** (green) — Features fully working. Shows: name, status badge, description.
2. **Ready to Activate** (yellow) — Enabled but needs configuration (e.g., "Telegram — needs bot token"). Shows "Configure" button → links to settings page.
3. **Available** (gray) — Exists but disabled. Shows "Enable" button that toggles the flag via API.

### API

New endpoint: `GET /api/v1/features/status`

Returns array of feature descriptors:
```typescript
interface FeatureStatus {
  id: string;            // e.g., "channels.telegram"
  name: string;          // e.g., "Telegram"
  category: string;      // e.g., "channel", "integration", "capability"
  enabled: boolean;      // config flag
  configured: boolean;   // has required credentials
  active: boolean;       // currently running
  missing?: string[];    // what's needed, e.g., ["TELEGRAM_BOT_TOKEN"]
  settingsPath?: string; // dashboard route to configure
}
```

Gateway builds this by inspecting config + runtime state.

### CSS

Follows existing glassmorphism patterns. Status cards with colored left borders (green/yellow/gray). Category grouping headers.

---

## 4. Enhanced Install Script

Make `scripts/install.sh` interactive so it configures providers and channels during install.

### New prompts (all skippable)

1. **Provider setup**:
   - "Do you have an AI provider API key? (y/n)"
   - Provider selection: Anthropic, OpenAI, Google, Ollama (local)
   - API key input (masked)
   - Ollama auto-detection: if `curl localhost:11434/api/version` succeeds, offer local mode

2. **Channel setup**:
   - "Want to connect a messaging channel? (y/n)"
   - Channel selection: Telegram, Discord, Slack, Skip
   - Bot token input (masked)

3. **Success summary**:
   ```
   ✅ Auxiora installed at /opt/auxiora
   ✅ Provider: Anthropic (claude-sonnet-4-6)
   ✅ Channel: Telegram connected
   ✅ 5 starter skills loaded
   Dashboard: http://localhost:18800/dashboard
   ```

### Implementation

- Prompts use `read -p` with defaults
- API keys written to config via `auxiora config set` CLI or direct JSON write to `~/.config/auxiora/config.json`
- Channel tokens stored in vault if vault is set up, otherwise in config
- All prompts skippable with `--non-interactive` flag for CI/Docker use
- Existing behavior preserved: pressing Enter through everything = same result as today

---

## Testing Strategy

- Config defaults: update existing config tests
- Starter skills: unit test each skill's `execute()` function + integration test for `seedStarterSkills()`
- Feature status API: test endpoint returns correct state for various config combinations
- SystemStatus component: React testing-library tests for render + click handlers
- Install script: bash test with mock prompts (heredoc input)

## Scope

~18-22 TDD tasks across 4 workstreams. No new packages needed. All changes within existing package boundaries.
