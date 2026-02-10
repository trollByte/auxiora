# Morning Briefing Vertical Slice Design

> **Date:** 2026-02-09
> **Status:** Approved
> **Goal:** Wire the first end-to-end pipeline from real Google APIs through the ambient scheduler to a delivered morning briefing — proving the "living agent" architecture works.

---

## Context

Auxiora has ~60 packages covering email intelligence, calendar intelligence, connectors, ambient patterns, briefing generation, and more. But they're all scaffolding — the Google Workspace connector returns stub data, the ambient loop doesn't run, and the briefing generator has no real data sources. This design connects them into one working pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                MORNING BRIEFING PIPELINE             │
│                                                      │
│  Google APIs ──► Connector ──► Ambient ──► Briefing  │
│  (real data)     (registry)    (scheduler)  (channel) │
│                                                      │
│  Gmail ──────────► EmailIntelligence.triage()         │
│  Calendar ───────► CalendarIntelligence.analyze()     │
│  Both ───────────► BriefingGenerator.generate()       │
│                    ──► Deliver via webchat + channels  │
└─────────────────────────────────────────────────────┘
```

Five layers, each building on the last:

1. **Google API Layer** — Real `googleapis` calls replacing stubs
2. **Auth + Token Layer** — OAuth2 flow with vault-stored tokens
3. **Ambient Scheduler** — Cron-based polling and briefing generation
4. **Briefing Compiler** — Wire BriefingGenerator to real connector data
5. **Delivery** — Send briefings to webchat and all connected channels

---

## Phase A: Google API Layer

**Dependency:** `googleapis` npm package (Google's official Node.js client).

### New file: `packages/connector-google-workspace/src/google-client.ts`

Factory for authenticated Google API clients:

```typescript
import { google } from 'googleapis';

export function createGoogleClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return {
    calendar: google.calendar({ version: 'v3', auth }),
    gmail: google.gmail({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}
```

### Modified: `packages/connector-google-workspace/src/connector.ts`

Replace all 17 stub `executeAction` cases with real API calls. Examples:

**Calendar list events:**
```typescript
case 'calendar-list-events': {
  const client = createGoogleClient(token);
  const res = await client.calendar.events.list({
    calendarId: params.calendarId as string ?? 'primary',
    maxResults: params.maxResults as number ?? 10,
    timeMin: params.timeMin as string ?? new Date().toISOString(),
    timeMax: params.timeMax as string,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return { events: res.data.items ?? [] };
}
```

**Gmail list messages:**
```typescript
case 'gmail-list-messages': {
  const client = createGoogleClient(token);
  const res = await client.gmail.users.messages.list({
    userId: 'me',
    maxResults: params.maxResults as number ?? 10,
    q: params.query as string,
    labelIds: params.labelIds as string[],
  });
  return { messages: res.data.messages ?? [] };
}
```

**Gmail read message (with body extraction):**
```typescript
case 'gmail-read-message': {
  const client = createGoogleClient(token);
  const res = await client.gmail.users.messages.get({
    userId: 'me',
    id: params.messageId as string,
    format: 'full',
  });
  const headers = res.data.payload?.headers ?? [];
  const subject = headers.find(h => h.name === 'Subject')?.value ?? '';
  const from = headers.find(h => h.name === 'From')?.value ?? '';
  const body = extractBody(res.data.payload);
  return { messageId: res.data.id, subject, from, body, snippet: res.data.snippet };
}
```

**Poll triggers:**
```typescript
async pollTrigger(triggerId, token, lastPollAt) {
  const client = createGoogleClient(token);
  switch (triggerId) {
    case 'new-email': {
      const after = Math.floor((lastPollAt ?? Date.now() - 120_000) / 1000);
      const res = await client.gmail.users.messages.list({
        userId: 'me',
        q: `after:${after}`,
        maxResults: 20,
      });
      return (res.data.messages ?? []).map(m => ({
        triggerId: 'new-email',
        connectorId: 'google-workspace',
        timestamp: Date.now(),
        data: { messageId: m.id },
      }));
    }
    case 'event-starting-soon': {
      const now = new Date();
      const soon = new Date(now.getTime() + 15 * 60_000);
      const res = await client.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: soon.toISOString(),
        singleEvents: true,
      });
      return (res.data.items ?? []).map(e => ({
        triggerId: 'event-starting-soon',
        connectorId: 'google-workspace',
        timestamp: Date.now(),
        data: { eventId: e.id, summary: e.summary, start: e.start },
      }));
    }
  }
  return [];
}
```

### Files

| File | Action |
|------|--------|
| `packages/connector-google-workspace/package.json` | Add `googleapis` dependency |
| `packages/connector-google-workspace/src/google-client.ts` | **NEW** — Authenticated client factory |
| `packages/connector-google-workspace/src/connector.ts` | **MODIFY** — Real API calls for all 17 actions + 3 triggers |
| `packages/connector-google-workspace/tests/connector.test.ts` | **NEW** — Tests with mocked googleapis |

---

## Phase B: OAuth2 + Token Storage

### OAuth2 Flow

1. User clicks "Connect Google" in dashboard
2. Dashboard calls `GET /api/v1/dashboard/connectors/google-workspace/auth`
3. Server generates Google OAuth consent URL with CSRF `state` token
4. User redirected to Google, approves scopes
5. Google redirects to `GET /api/v1/dashboard/connectors/google-workspace/callback`
6. Server exchanges authorization code for access + refresh tokens
7. Tokens encrypted and stored in vault under `connectors.google-workspace.tokens`
8. User redirected to dashboard with success indicator

### Dashboard routes (added to `router.ts`)

```typescript
// POST /connectors/:id/credentials — store client ID + secret
router.post('/connectors/:connectorId/credentials', requireAuth, async (req, res) => {
  const { clientId, clientSecret } = req.body;
  await vault.set(`connectors.${connectorId}.credentials`, { clientId, clientSecret });
  res.json({ success: true });
});

// GET /connectors/:id/auth — start OAuth flow
router.get('/connectors/:connectorId/auth', requireAuth, (req, res) => {
  const creds = await vault.get(`connectors.${connectorId}.credentials`);
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret, callbackUrl);
  const state = crypto.randomUUID();
  // Store state in session for CSRF validation
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: connector.auth.oauth2.scopes,
    state,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

// GET /connectors/:id/callback — handle OAuth callback
router.get('/connectors/:connectorId/callback', async (req, res) => {
  // Validate state for CSRF protection
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret, callbackUrl);
  const { tokens } = await oauth2.getToken(req.query.code);
  await vault.set(`connectors.${connectorId}.tokens`, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date,
  });
  res.redirect('/dashboard/settings/connections?connected=google-workspace');
});
```

### Real token refresh in `AuthManager`

```typescript
async refreshToken(instanceId: string, authConfig: AuthConfig): Promise<StoredToken> {
  const existing = this.tokens.get(instanceId);
  if (!existing?.refreshToken) throw new Error('No refresh token');

  const creds = await this.vault?.get(`connectors.${instanceId}.credentials`);
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2.setCredentials({ refresh_token: existing.refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();

  const refreshed: StoredToken = {
    accessToken: credentials.access_token!,
    refreshToken: credentials.refresh_token ?? existing.refreshToken,
    expiresAt: credentials.expiry_date ?? Date.now() + 3600_000,
    tokenType: 'Bearer',
  };
  this.tokens.set(instanceId, refreshed);
  await this.vault?.set(`connectors.${instanceId}.tokens`, refreshed);
  return refreshed;
}
```

### Setup wizard: Connections step

New page: `SetupConnections.tsx`

```
┌──────────────────────────────────────────┐
│          Connect Your Accounts           │
│                                          │
│  Auxiora can read your email & calendar  │
│  to give you morning briefings and       │
│  smart notifications.                    │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Google Workspace                  │  │
│  │  Gmail, Calendar, Drive            │  │
│  │                                    │  │
│  │  Client ID:  [_______________]     │  │
│  │  Client Secret: [_______________]  │  │
│  │                                    │  │
│  │  [Connect Google Account]          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [Skip for now]        [Continue →]      │
└──────────────────────────────────────────┘
```

### Files

| File | Action |
|------|--------|
| `packages/connectors/src/auth-manager.ts` | **MODIFY** — Real `refreshToken()` with vault persistence |
| `packages/dashboard/src/router.ts` | **MODIFY** — OAuth routes, credential endpoints |
| `packages/dashboard/ui/src/api.ts` | **MODIFY** — Connector API methods |
| `packages/dashboard/ui/src/pages/SetupConnections.tsx` | **NEW** — Setup wizard connections step |
| `packages/dashboard/ui/src/App.tsx` | **MODIFY** — Route for `/setup/connections` |

---

## Phase C: Ambient Scheduler + Briefing

### New: `packages/ambient/src/scheduler.ts`

```typescript
export interface AmbientSchedulerDeps {
  scheduler: Scheduler;
  connectorRegistry: ConnectorRegistry;
  triggerManager: TriggerManager;
  briefingGenerator: BriefingGenerator;
  emailIntelligence?: EmailIntelligence;
  calendarIntelligence?: CalendarIntelligence;
  deliveryChannel: (message: string) => Promise<void>;
  userId: string;
  config: AmbientSchedulerConfig;
}

export interface AmbientSchedulerConfig {
  morningCron: string;    // default: '0 7 * * *'
  eveningCron: string;    // default: '0 18 * * *'
  emailPollCron: string;  // default: '*/2 * * * *'
  calendarPollCron: string; // default: '*/5 * * * *'
  enabled: boolean;
  categories: string[];   // default: ['calendar', 'email', 'tasks']
}

export class AmbientScheduler {
  constructor(deps: AmbientSchedulerDeps) { ... }

  start(): void {
    this.scheduler.schedule('email-poll', this.config.emailPollCron,
      () => this.triggerManager.pollAll());

    this.scheduler.schedule('calendar-poll', this.config.calendarPollCron,
      () => this.pollCalendar());

    this.scheduler.schedule('morning-briefing', this.config.morningCron,
      () => this.generateAndDeliverBriefing('morning'));

    this.scheduler.schedule('evening-summary', this.config.eveningCron,
      () => this.generateAndDeliverBriefing('evening'));
  }

  stop(): void { ... }

  private async generateAndDeliverBriefing(time: 'morning' | 'evening') {
    const events = await this.fetchCalendarEvents(time);
    const emailSummary = await this.fetchEmailSummary();
    const briefing = this.briefingGenerator.generateBriefing(
      this.userId, time, { calendarEvents: events, notifications: emailSummary }
    );
    const formatted = formatBriefingAsText(briefing);
    await this.deliveryChannel(formatted);
  }
}
```

### Modified: `packages/ambient/src/briefing.ts`

Add `formatBriefingAsText()` function:

```typescript
export function formatBriefingAsText(briefing: Briefing): string {
  const greeting = briefing.timeOfDay === 'morning'
    ? 'Good morning! Here\'s your day:'
    : 'Here\'s your evening summary:';

  const sections = briefing.sections.map(s => {
    const items = s.items.map(i => `  ${i}`).join('\n');
    return `${s.title}\n${items}`;
  }).join('\n\n');

  return `${greeting}\n\n${sections}`;
}
```

### Files

| File | Action |
|------|--------|
| `packages/ambient/src/scheduler.ts` | **NEW** — `AmbientScheduler` with cron jobs |
| `packages/ambient/src/briefing.ts` | **MODIFY** — Add `formatBriefingAsText()` |
| `packages/ambient/src/index.ts` | **MODIFY** — Re-export `AmbientScheduler` |
| `packages/ambient/tests/scheduler.test.ts` | **NEW** — Scheduler tests |

---

## Phase D: Runtime Wiring

### Modified: `packages/runtime/src/index.ts`

In the `initialize()` method, after ambient intelligence setup:

```typescript
// Wire ambient scheduler if Google Workspace is connected
if (this.connectorRegistry.has('google-workspace') &&
    this.authManager.hasToken('google-workspace')) {
  this.ambientScheduler = new AmbientScheduler({
    scheduler: this.behaviorScheduler,
    connectorRegistry: this.connectorRegistry,
    triggerManager: this.triggerManager,
    briefingGenerator: this.briefingGenerator,
    emailIntelligence: this.emailIntelligence,
    calendarIntelligence: this.calendarIntelligence,
    deliveryChannel: async (msg) => {
      // Send to webchat
      this.gateway.broadcastSystem(msg);
      // Send to all connected channels
      for (const channel of this.channelManager.getConnected()) {
        await channel.sendSystemMessage(msg);
      }
    },
    userId: 'default',
    config: await this.config.get('ambient') ?? DEFAULT_AMBIENT_CONFIG,
  });
  this.ambientScheduler.start();
}
```

Also wire connector token restoration on startup:

```typescript
// Restore connector tokens from vault
for (const connector of this.connectorRegistry.list()) {
  const tokens = await this.vault.get(`connectors.${connector.id}.tokens`);
  if (tokens) {
    await this.authManager.authenticate(connector.id, connector.auth, tokens);
    // Subscribe to triggers
    for (const trigger of connector.triggers) {
      this.triggerManager.subscribe(connector.id, trigger.id, connector.id,
        (events) => this.handleTriggerEvents(connector.id, trigger.id, events));
    }
  }
}
```

### Files

| File | Action |
|------|--------|
| `packages/runtime/src/index.ts` | **MODIFY** — Wire ambient scheduler, restore tokens |
| `packages/runtime/tests/ambient-wiring.test.ts` | **NEW** — Integration tests |

---

## Phase E: Dashboard UI

### New: Settings > Ambient page

Briefing configuration with enable/disable, time, categories:

```
┌──────────────────────────────────────────┐
│          Morning Briefing                │
│                                          │
│  Enabled:     [✓]                        │
│  Time:        [07:00] ▾                  │
│  Categories:  [✓] Calendar               │
│               [✓] Email                  │
│               [✓] Tasks                  │
│               [ ] Patterns               │
│                                          │
│  Evening Summary                         │
│  Enabled:     [✓]                        │
│  Time:        [18:00] ▾                  │
│                                          │
│  Delivery:    [All connected channels] ▾ │
│                                          │
│  [Save Changes]                          │
└──────────────────────────────────────────┘
```

### Files

| File | Action |
|------|--------|
| `packages/dashboard/ui/src/pages/SettingsAmbient.tsx` | **NEW** — Briefing config page |
| `packages/dashboard/ui/src/components/Layout.tsx` | **MODIFY** — Add "Ambient" nav link |
| `packages/dashboard/ui/src/styles/global.css` | **MODIFY** — Styles for new pages |
| `packages/dashboard/src/router.ts` | **MODIFY** — GET/POST `/ambient/config` endpoints |

---

## Summary

| Metric | Count |
|--------|-------|
| New files | 7 |
| Modified files | 10 |
| Phases | 5 (A → B → C → D, E parallel) |
| New npm dependency | 1 (`googleapis`) |

### Build order

1. **Phase A** (Google APIs) — testable independently with manual access token
2. **Phase B** (OAuth) — depends on A; testable with real Google account
3. **Phase C** (Scheduler) — depends on B; testable with mock connectors, then real
4. **Phase D** (Runtime wiring) — depends on A+B+C; integration test
5. **Phase E** (Dashboard UI) — depends on B (OAuth UI) and D (settings endpoints); UI work can start during C

### Verification

1. `pnpm build` — compiles
2. `pnpm test` — all tests pass
3. Manual: connect Google account through setup wizard
4. Manual: see morning briefing delivered to webchat with real calendar + email data
5. Manual: configure briefing time and categories in Settings > Ambient
