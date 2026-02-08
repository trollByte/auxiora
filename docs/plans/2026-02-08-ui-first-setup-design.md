# UI-First Setup & Settings Design

## Goal

Make Auxiora fully configurable through the browser. After installing the .deb and starting the service, a new user opens `http://localhost:18800` and is guided through setup without ever touching a terminal, config file, or environment variable. After setup, a Settings page lets them change everything — agent identity, AI provider, channel credentials, allowed senders, vault password — all from the dashboard.

## Problem

Today's first-run experience requires the CLI:
1. Set `AUXIORA_VAULT_PASSWORD` in `/etc/auxiora/env`
2. Run `auxiora init` to configure identity, provider, channels
3. Run `auxiora vault add` for each API key
4. Edit config.json for channel-specific settings (allowed senders, etc.)

This is hostile to beginners. The dashboard already has a backend setup API (`/api/v1/dashboard/setup/*`) and a React SPA, but no setup wizard UI and no settings page.

---

## Architecture

No new packages. This extends `packages/dashboard/` (backend routes + React pages) and touches the runtime startup logic.

```
Browser (React SPA)
  |
  +-- /dashboard/setup/*     --> Setup wizard pages (new)
  +-- /dashboard/settings/*  --> Settings pages (new)
  |
  +-- /api/v1/dashboard/
       +-- setup/*            --> Existing endpoints + new vault endpoint
       +-- settings/*         --> New CRUD endpoints
              |
              +-- settings/agent          --> config.json
              +-- settings/provider       --> config.json + vault
              +-- settings/channels/:type --> config.json + vault
              +-- settings/security       --> vault + dashboard auth
              +-- settings/export         --> full config download/upload
```

**Routing rules:**
- Setup routes are public (no auth) during first-run — the existing setup guard middleware handles this.
- Settings routes require dashboard auth (existing session cookie middleware).
- If setup is incomplete, any navigation to `/dashboard` redirects to `/dashboard/setup`.

**Credential storage:**
- API keys and channel tokens go in the vault (encrypted at rest).
- Non-secret config (enabled flags, allowed senders, agent name) goes in `config.json`.
- The UI never displays raw secrets — only masked placeholders with a "Change" action.

---

## First-Boot Flow

### What happens after `sudo dpkg -i auxiora_*.deb`

1. The postinst script creates the `auxiora` system user and starts the service.
2. The systemd service starts Auxiora in **setup mode** — vault not initialized, setup guard active.
3. The gateway listens on port 18800. All routes except `/api/v1/dashboard/setup/*` are blocked.
4. User opens `http://localhost:18800`. The SPA detects setup is incomplete via `GET /api/v1/dashboard/setup/status` and shows the setup wizard.

### Systemd service change

The service unit starts with `--no-vault` initially. After the wizard creates the vault password, the backend writes it to `/etc/auxiora/env` and restarts itself with the vault unlocked.

```ini
[Service]
Type=simple
User=auxiora
ExecStart=/usr/bin/auxiora start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=-/etc/auxiora/env
```

The `ExecStart` no longer needs `--no-vault` because the `EnvironmentFile` provides `AUXIORA_VAULT_PASSWORD` after the wizard writes it. On a completely fresh install, the env file has the variable commented out, so the CLI detects no password + no TTY and starts in setup mode (vault deferred).

### CLI change for setup mode

The start command gains a third mode: if no vault password is available and stdin is not a TTY, start the gateway with the vault locked but the setup wizard accessible, instead of exiting with an error.

```
Password resolution order:
1. --password flag
2. AUXIORA_VAULT_PASSWORD env var
3. Interactive prompt (if TTY)
4. Setup mode (no vault, setup wizard only)
```

---

## Setup Wizard

Seven steps, each a full-screen React page with a progress bar at the top.

### Step 1: Welcome

Static page. Explains what Auxiora is. Single "Get Started" button. No API call.

### Step 2: Create Vault Password

Two password fields (enter + confirm). Strength indicator. On submit:

- `POST /api/v1/dashboard/setup/vault` (new endpoint)
- Backend calls `vault.initialize(password)` then `vault.unlock(password)`
- Writes `AUXIORA_VAULT_PASSWORD=<password>` to `/etc/auxiora/env` (mode 600, owned by auxiora)
- Returns `{ success: true }`

This is the only step that touches the filesystem outside of config.json. After this, the vault is live and subsequent steps can store secrets in it.

### Step 3: Create Dashboard Password

Single password field + confirm. This is the password used to log into the dashboard after setup.

- `POST /api/v1/dashboard/setup/dashboard-password` (new endpoint)
- Backend stores the bcrypt hash in the vault as `DASHBOARD_PASSWORD`
- Returns `{ success: true }`

### Step 4: Agent Identity

Text field for name, select for pronouns (she/her, he/him, they/them, it/its).

- `POST /api/v1/dashboard/setup/identity` (existing endpoint)
- Writes to config.json `agent.name` and `agent.pronouns`

### Step 5: Personality

Grid of personality template cards with name, description, and a tone preview. User clicks one.

- `GET /api/v1/dashboard/setup/templates` (existing) to populate the grid
- `POST /api/v1/dashboard/setup/personality` (existing) to apply selection
- Writes SOUL.md from the template

### Step 6: AI Provider

Select provider (Anthropic / OpenAI / Ollama). If Anthropic or OpenAI, show API key input field. If Ollama, show endpoint URL field.

- `POST /api/v1/dashboard/setup/provider` (existing, enhanced)
- Stores API key in vault, provider selection in config.json

### Step 7: Channels (optional)

Card per channel type. Each card has an enable toggle. When enabled, it expands to show the required credential fields for that channel:

| Channel | Credential fields |
|---------|------------------|
| Webchat | None (built-in) |
| Discord | Bot Token |
| Telegram | Bot Token |
| Slack | Bot Token, App Token |
| Matrix | Homeserver URL, User ID, Access Token |
| Signal | Signal CLI Endpoint, Phone Number |
| Teams | App ID, App Password |
| WhatsApp | Phone Number ID, Access Token, Verify Token |
| Twilio | Account SID, Auth Token, Phone Number |
| Email | IMAP Host/Port, SMTP Host/Port, Email, Password |

User can skip this step entirely (webchat is always available). A "Skip for now" link at the bottom.

- `POST /api/v1/dashboard/setup/channels` (existing, enhanced to accept credentials)
- Channel credentials stored in vault, enabled flags in config.json

### Step 8: Done

Confirmation page. Shows the agent name and personality. Two buttons:
- "Open Chat" — goes to webchat at `/`
- "Go to Dashboard" — goes to `/dashboard`

Calls `POST /api/v1/dashboard/setup/complete` (existing) to mark setup finished. The setup guard deactivates and the full dashboard becomes accessible.

---

## Settings Page

Accessible from the dashboard sidebar after setup. Organized into tabs.

### General Tab

- Agent name (text input)
- Pronouns (select)
- Personality template (select with preview, or "Custom" if SOUL.md was manually edited)
- Tone, expertise, error style (text inputs)

All fields save via `PATCH /api/v1/dashboard/settings/agent`. Backend validates with Zod schema, writes config.json, and updates the runtime's personality in-memory.

### Providers Tab

- Primary provider (select: anthropic, openai, ollama)
- Fallback provider (select, optional)
- Per-provider section:
  - API key (masked field, "Change" button reveals input)
  - Model preference (text input, e.g. "claude-sonnet-4-5-20250929")
  - Endpoint URL (for Ollama / self-hosted)

Saves via `PATCH /api/v1/dashboard/settings/provider`. API keys go to vault, everything else to config.json. Backend calls `providerManager.reload()` to hot-swap without restart.

### Channels Tab

Card layout, one per channel type. Each card shows:
- **Header**: Channel name, icon, enable/disable toggle
- **Status badge**: Connected / Disconnected / Error
- **Credentials section**: Masked fields for tokens/keys with "Change" button
- **Allowed Senders section**: Tag-input component

The tag-input component for allowed senders:
- Text field where you type an ID and press Enter to add it as a chip/tag
- Each chip has an X button to remove
- Placeholder text explains the expected format (e.g., "@user:server.com" for Matrix, "+1234567890" for Signal)
- Maps to the config fields: `allowedUsers`, `allowedNumbers`, `allowedChannels`, `allowedTenants`, `allowedRooms`

Each card saves independently via `PATCH /api/v1/dashboard/settings/channels/:type`. Backend validates credentials format, stores secrets in vault, writes config flags to config.json, and calls `channelManager.reconnect(type)` for live reload.

### Security Tab

- **Change vault password**: Current password + new password + confirm. Calls `PATCH /api/v1/dashboard/settings/security/vault`. Backend re-encrypts the vault with the new password and updates `/etc/auxiora/env`.
- **Change dashboard password**: Current + new + confirm. Calls `PATCH /api/v1/dashboard/settings/security/dashboard`. Backend updates the bcrypt hash in vault.
- **JWT secret**: Display (masked), "Regenerate" button with confirmation dialog. Warns that regeneration invalidates all existing tokens.

### System Tab

- Gateway host and port (text inputs)
- CORS origins (tag-input, same component as allowed senders)
- Log level (select: debug, info, warn, error)
- **Export config**: "Download" button — `GET /api/v1/dashboard/settings/export` returns JSON
- **Import config**: File upload — `POST /api/v1/dashboard/settings/import` validates and applies
- **Restart service**: Button with confirmation dialog — triggers graceful restart

---

## New Backend Endpoints

### Setup (additions to existing router)

```
POST /api/v1/dashboard/setup/vault
  Body: { password: string }
  Action: Initialize vault, write password to /etc/auxiora/env
  Auth: None (setup mode only)

POST /api/v1/dashboard/setup/dashboard-password
  Body: { password: string }
  Action: Store bcrypt hash in vault as DASHBOARD_PASSWORD
  Auth: None (setup mode only)

POST /api/v1/dashboard/setup/channels (enhanced)
  Body: { channels: [{ type: "discord", enabled: true, credentials: { botToken: "..." } }] }
  Action: Enable channels, store credentials in vault
  Auth: None (setup mode only)
```

### Settings (new router)

```
GET    /api/v1/dashboard/settings
  Returns: Full settings object (secrets masked)

PATCH  /api/v1/dashboard/settings/agent
  Body: { name?, pronouns?, personality?, tone?, expertise?, errorStyle? }
  Action: Validate with Zod, write config.json, update runtime

PATCH  /api/v1/dashboard/settings/provider
  Body: { primary?, fallback?, apiKey?, model?, endpoint? }
  Action: Write config + vault, hot-reload provider

PATCH  /api/v1/dashboard/settings/channels/:type
  Body: { enabled?, credentials?, allowedUsers?, allowedNumbers?, ... }
  Action: Write config + vault, reconnect channel

PATCH  /api/v1/dashboard/settings/security/vault
  Body: { currentPassword, newPassword }
  Action: Re-encrypt vault, update /etc/auxiora/env

PATCH  /api/v1/dashboard/settings/security/dashboard
  Body: { currentPassword, newPassword }
  Action: Update DASHBOARD_PASSWORD hash in vault

GET    /api/v1/dashboard/settings/export
  Returns: Full config.json (secrets excluded)

POST   /api/v1/dashboard/settings/import
  Body: Config JSON
  Action: Validate, merge, restart affected subsystems
```

All settings endpoints require dashboard auth. All request bodies are validated with Zod schemas before processing.

---

## New React Components

### Pages

| File | Purpose |
|------|---------|
| `SetupWelcome.tsx` | Step 1 — static welcome page |
| `SetupVault.tsx` | Step 2 — create vault password |
| `SetupDashboardPassword.tsx` | Step 3 — create dashboard password |
| `SetupIdentity.tsx` | Step 4 — agent name and pronouns |
| `SetupPersonality.tsx` | Step 5 — personality template grid |
| `SetupProvider.tsx` | Step 6 — AI provider and API key |
| `SetupChannels.tsx` | Step 7 — enable and configure channels |
| `SetupComplete.tsx` | Step 8 — done confirmation |
| `Settings.tsx` | Settings page with tab navigation |

### Components

| File | Purpose |
|------|---------|
| `SetupProgress.tsx` | Progress bar showing current step (1-8) |
| `TagInput.tsx` | Reusable chip/tag input for allowed senders and CORS origins |
| `ChannelCard.tsx` | Expandable card for channel config (enable, credentials, allowed senders) |
| `MaskedField.tsx` | Password-style field with "Change" toggle for existing secrets |
| `PasswordStrength.tsx` | Strength indicator bar for vault/dashboard password creation |

---

## Implementation Phases

### Phase 1: Setup Wizard

Deliverables:
- `POST /api/v1/dashboard/setup/vault` endpoint
- `POST /api/v1/dashboard/setup/dashboard-password` endpoint
- Enhanced channel setup endpoint (accept credentials)
- CLI setup mode (start without vault when no password + no TTY)
- 8 React pages for the wizard
- SetupProgress component
- Auto-redirect to setup when incomplete
- Updated .deb postinst and systemd service

This is the critical path. After Phase 1, a new user can install the .deb, open a browser, and have a working assistant without touching the CLI.

### Phase 2: Settings Page

Deliverables:
- Settings REST API (all PATCH endpoints)
- Settings page with 5 tabs
- TagInput, ChannelCard, MaskedField components
- Hot-reload for channel and provider changes
- Config export/import

After Phase 2, the CLI is only needed for `dpkg -i`. Everything else is browser-based.

### Phase 3: Polish

Deliverables:
- "Test Connection" button on channel cards (validates credentials before saving)
- Toast notifications for save success/error
- Form validation with inline error messages
- Responsive layout for tablet/mobile
- Loading skeletons and optimistic updates
- Keyboard navigation and accessibility

---

## File Changes Summary

| Area | New files | Modified files |
|------|-----------|---------------|
| Dashboard backend | `settings-router.ts`, `setup-vault.ts` | `router.ts` (mount new routes) |
| Dashboard frontend | 9 pages, 5 components | `App.tsx` (routes), `Layout.tsx` (sidebar), `api.ts` (new API calls) |
| Runtime | — | `index.ts` (setup mode startup, settings hot-reload) |
| CLI | — | `commands/start.ts` (setup mode fallback) |
| CI/CD | — | `release.yml` (postinst changes) |
| Config | — | `index.ts` (new Zod schemas for settings validation) |

---

## Security Considerations

- Vault password is written to `/etc/auxiora/env` with mode 600, owned by the auxiora user. Only root and the service user can read it.
- The setup wizard is only accessible when setup is incomplete. After `setup/complete`, the setup guard blocks all setup endpoints.
- Settings endpoints require authenticated dashboard sessions.
- API keys and tokens are never returned in GET responses — only `"********"` placeholders with a boolean `isSet` field.
- Config import validates the entire payload with Zod before applying. Secrets in imported config are rejected (must be set individually through the vault).
- The vault password change endpoint requires the current password, preventing unauthorized changes even with a valid dashboard session.
