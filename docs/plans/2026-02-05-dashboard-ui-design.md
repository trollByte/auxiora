# Dashboard UI Design

## Goal

Add a web dashboard to Auxiora: an operations panel for monitoring and managing behaviors, webhooks, sessions, and audit logs. React + Vite SPA served from the existing Express gateway, protected by simple password authentication.

## Architecture

Two layers:

**REST API** — New routes on the gateway under `/api/v1/dashboard/`. Endpoints expose read/write access to behaviors, webhooks, sessions, audit logs, and system status. Protected by session cookie auth. The API is a thin layer — it calls into existing managers (BehaviorManager, WebhookManager, SessionManager) that the runtime already wires together.

**Static SPA** — React app built with Vite, output to `packages/dashboard/dist/`. The gateway serves this at `/dashboard` using `express.static()`. The SPA makes `fetch()` calls to the REST API. No SSR — pure client-side rendering.

**Auth flow:** Login page at `/dashboard/login`. User enters the dashboard password (stored in vault as `DASHBOARD_PASSWORD`). The gateway validates it and sets an `HttpOnly` session cookie. All `/api/v1/dashboard/` routes check for a valid session cookie before responding. Logout clears the cookie.

**Gateway integration:** The runtime mounts the dashboard routes using `mountRouter()`. The dashboard is opt-in via `config.dashboard.enabled`.

**New package:** `packages/dashboard/` — React SPA, REST API router, session management, auth middleware.

---

## Dashboard Pages

**Behaviors** — Table of all behaviors showing name, type (scheduled/monitor/one-shot), status (active/paused), last run time, next run time, run count, fail count. Actions: pause, resume, delete. Click a row to see execution history and the behavior's action prompt. Reads from `BehaviorManager.list()` and writes via `BehaviorManager.update()` / `remove()`.

**Webhooks** — Table of all registered webhooks showing name, type (channel/generic), enabled status, linked behavior, created date. Actions: enable/disable, delete. Below the table, a live activity feed showing recent webhook events from the audit log (received, triggered, signature_failed). Reads from `WebhookManager.list()` and the audit store.

**Sessions** — List of active WebSocket sessions showing session ID, connected at, last activity, voice active status. Read-only — no actions needed for v1. Reads from the gateway's connection tracking.

**Audit Log** — Filterable, paginated table of all audit events. Filter by event type (behavior.*, webhook.*, voice.*, system.*), date range, and free-text search. Requires a new `AuditStore.query()` method with pagination support.

**System Status** (sidebar/header bar) — Uptime, active provider, number of active behaviors, connected sessions, webhooks enabled. A quick health-at-a-glance summary from `/api/v1/dashboard/status`.

---

## REST API

### Auth endpoints

- `POST /api/v1/dashboard/auth/login` — Body: `{ password }`. Validates against vault's `DASHBOARD_PASSWORD`. Sets `HttpOnly`, `SameSite=Strict` session cookie. Returns `{ success: true }`.
- `POST /api/v1/dashboard/auth/logout` — Clears session cookie.
- `GET /api/v1/dashboard/auth/check` — Returns `{ authenticated: true/false }`. Used by the SPA on load to check session validity.

### Session management

Server-side sessions stored in memory (Map of session ID to expiry). Sessions expire after 24 hours of inactivity. No external store needed — single-user self-hosted app.

### Data endpoints

All require valid session cookie. All prefixed with `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard/behaviors` | List all behaviors |
| `PATCH` | `/dashboard/behaviors/:id` | Update status (pause/resume) |
| `DELETE` | `/dashboard/behaviors/:id` | Remove a behavior |
| `GET` | `/dashboard/webhooks` | List all webhooks |
| `PATCH` | `/dashboard/webhooks/:id` | Enable/disable |
| `DELETE` | `/dashboard/webhooks/:id` | Remove a webhook |
| `GET` | `/dashboard/sessions` | List active connections |
| `GET` | `/dashboard/audit` | Query audit log (type, after, before, limit, offset) |
| `GET` | `/dashboard/status` | System status summary |

Responses use standard JSON envelopes: `{ data }` for success, `{ error }` for failures. All return 401 if no valid session.

---

## Frontend Structure

```
packages/dashboard/
  src/
    App.tsx            — Router, auth context, layout shell
    pages/
      Login.tsx        — Password form, calls auth/login
      Behaviors.tsx    — Behaviors table with actions
      Webhooks.tsx     — Webhooks table + activity feed
      Sessions.tsx     — Active connections list
      AuditLog.tsx     — Filterable, paginated event table
    components/
      Layout.tsx       — Sidebar nav + header with status bar
      DataTable.tsx    — Reusable sortable table component
      StatusBadge.tsx  — Colored badge for status values
      Pagination.tsx   — Page controls for audit log
    hooks/
      useApi.ts        — Fetch wrapper with auth handling (401 → login redirect)
      usePolling.ts    — Periodic data refresh (10s default)
    api.ts             — Typed API client functions
```

**Styling:** CSS Modules with a minimal custom design system. No heavy UI framework. CSS variables for colors, spacing, typography. Dark theme by default.

**Data fetching:** `usePolling` hook calls the API at 10s intervals. No WebSocket subscription — polling is simpler and the data doesn't need sub-second freshness. `useApi` handles 401 responses globally by redirecting to login.

**Build output:** Vite builds to `packages/dashboard/dist/`. Gateway serves at `/dashboard` using `express.static()`. Catch-all route serves `index.html` for client-side routing support.

---

## Configuration

```typescript
dashboard: z.object({
  enabled: z.boolean().default(false),
  sessionTtlMs: z.number().int().positive().default(86_400_000), // 24 hours
})
```

Dashboard disabled by default. Opt in via config or `AUXIORA_DASHBOARD_ENABLED=true`. Password stored in vault (`DASHBOARD_PASSWORD`), not in config.

**First-run setup:** If dashboard is enabled but no `DASHBOARD_PASSWORD` exists in the vault, the login page shows a "Set password" form. First password submitted gets stored in the vault.

---

## Security

| Concern | Mitigation |
|---------|------------|
| Password brute-force | Rate limit: 5 login attempts per minute per IP, then 429 |
| Session hijacking | `HttpOnly`, `SameSite=Strict`, `Secure` (when HTTPS) cookie flags |
| XSS | React's default escaping, no raw HTML injection, CSP header |
| CSRF | `SameSite=Strict` cookie prevents cross-origin requests |
| Sensitive data in API | Webhook secrets redacted to `***` in responses |
| Static file access | Auth middleware protects all `/api/v1/dashboard/` routes |

**Audit events:** `dashboard.login`, `dashboard.logout`, `dashboard.login_failed`.

---

## Testing Strategy

- **Auth tests** (~6): login success, wrong password, rate limiting, session validation, session expiry, logout
- **Behaviors API tests** (~4): list, patch status, delete, 401 without auth
- **Webhooks API tests** (~4): list, patch enabled, delete, secret redaction
- **Sessions API tests** (~2): list active, empty when none
- **Audit API tests** (~4): list with pagination, filter by type, filter by date range, empty result
- **Status API tests** (~2): returns aggregated status, 401 without auth
- **Integration test** (~1): full login → fetch behaviors flow

~23 new tests, bringing project total to ~297.

No frontend unit tests for v1 — YAGNI for an internal tool. Backend tests cover data correctness.

---

## Dependencies

**Runtime:** `react`, `react-dom`, `react-router-dom`, `cookie` (for cookie parsing in Express)

**Dev:** `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`

---

## Future Scope (not v1.7)

- **Real-time updates** — WebSocket subscription for live audit feed instead of polling
- **Behavior creation UI** — Create behaviors through forms instead of AI tools
- **Webhook testing UI** — Send test payloads to webhooks from the dashboard
- **Multi-user auth** — User accounts with roles (admin, viewer)
- **Frontend component tests** — Vitest + jsdom if the UI grows in complexity
