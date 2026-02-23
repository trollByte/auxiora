# Activation Push Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Auxiora's existing features visible, activated, and demonstrable out of the box by flipping defaults, shipping starter skills, adding a feature status dashboard, and enhancing the install script.

**Architecture:** Four independent workstreams: (1) config defaults + adapter graceful degradation, (2) starter skills bundle + loader seeding, (3) feature status API + dashboard page, (4) install script interactive prompts. All changes stay within existing package boundaries.

**Tech Stack:** TypeScript (strict ESM, `.js` extensions), Zod schemas, Vitest, React 19, Fastify/Express, Bash

---

### Task 1: Enable all channel defaults

**Files:**
- Modify: `packages/config/src/index.ts:122-158`
- Modify: `packages/config/tests/config.test.ts:92-100`

**Step 1: Update test expectations**

In `packages/config/tests/config.test.ts`, change the channel defaults test:

```typescript
it('should default all channels to enabled except twilio', () => {
  const config = ConfigSchema.parse({});

  expect(config.channels.discord.enabled).toBe(true);
  expect(config.channels.telegram.enabled).toBe(true);
  expect(config.channels.slack.enabled).toBe(true);
  expect(config.channels.twilio.enabled).toBe(false);
  expect(config.channels.webchat.enabled).toBe(true);
  expect(config.channels.matrix.enabled).toBe(true);
  expect(config.channels.signal.enabled).toBe(true);
  expect(config.channels.email.enabled).toBe(true);
  expect(config.channels.teams.enabled).toBe(true);
  expect(config.channels.whatsapp.enabled).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/config/tests --reporter=verbose`
Expected: FAIL — discord, slack, signal, email, teams, matrix, whatsapp still default to `false`

**Step 3: Flip defaults in config schema**

In `packages/config/src/index.ts`, change each channel's `enabled` default from `false` to `true`:

```typescript
discord: z.object({
  enabled: z.boolean().default(true),
  mentionOnly: z.boolean().default(true),
}).default({}),
// ... same for slack, signal, email, teams, matrix, whatsapp
```

Leave `twilio.enabled` as `false` (requires Twilio account + phone number, not a simple bot token).

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/config/tests --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/config/src/index.ts packages/config/tests/config.test.ts
git commit -m "feat(config): enable all channel adapters by default"
```

---

### Task 2: Graceful degradation for Discord adapter

**Files:**
- Modify: `packages/channels/src/adapters/discord.ts`
- Create: `packages/channels/tests/discord-graceful.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Discord adapter graceful degradation', () => {
  it('connect() resolves without error when no bot token is set', async () => {
    const { DiscordAdapter } = await import('../src/adapters/discord.js');
    const adapter = new DiscordAdapter({ botToken: '' });
    await expect(adapter.connect()).resolves.not.toThrow();
    expect(adapter.isConnected()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/channels/tests/discord-graceful.test.ts`
Expected: FAIL — `connect()` throws when token is empty

**Step 3: Add early return in connect()**

In `packages/channels/src/adapters/discord.ts`, at the top of `connect()`:

```typescript
async connect(): Promise<void> {
  if (!this.config.botToken) {
    audit('channel.skipped', { channelType: 'discord', reason: 'no_bot_token' });
    return;
  }
  // ... existing login logic
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/channels/tests/discord-graceful.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channels/src/adapters/discord.ts packages/channels/tests/discord-graceful.test.ts
git commit -m "feat(channels): graceful skip when Discord token missing"
```

---

### Task 3: Graceful degradation for Slack adapter

Same pattern as Task 2 but for `packages/channels/src/adapters/slack.ts`. Check `config.botToken` and `config.appToken` at the top of `connect()`. Test file: `packages/channels/tests/slack-graceful.test.ts`.

```typescript
async connect(): Promise<void> {
  if (!this.config.botToken || !this.config.appToken) {
    audit('channel.skipped', { channelType: 'slack', reason: 'missing_credentials' });
    return;
  }
  // ... existing logic
}
```

Commit: `feat(channels): graceful skip when Slack credentials missing`

---

### Task 4: Graceful degradation for remaining adapters

Same pattern for Signal, Email, Teams, Matrix, WhatsApp. Each adapter gets an early return in `connect()` if required credentials are missing. One test file per adapter:

- `packages/channels/tests/signal-graceful.test.ts`
- `packages/channels/tests/email-graceful.test.ts`
- `packages/channels/tests/teams-graceful.test.ts`
- `packages/channels/tests/matrix-graceful.test.ts`
- `packages/channels/tests/whatsapp-graceful.test.ts`

Check each adapter's constructor config type to identify required fields (e.g., `signalPhoneNumber` for Signal, `imapHost` for Email, etc.).

Commit: `feat(channels): graceful skip for all adapters when credentials missing`

---

### Task 5: Create daily-summary starter skill

**Files:**
- Create: `packages/plugins/starter-skills/daily-summary.js`
- Create: `packages/plugins/tests/starter-skills/daily-summary.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';

describe('daily-summary starter skill', () => {
  it('exports a valid plugin manifest', async () => {
    const mod = await import('../../starter-skills/daily-summary.js');
    expect(mod.plugin).toBeDefined();
    expect(mod.plugin.name).toBe('daily-summary');
    expect(mod.plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(mod.plugin.tools).toHaveLength(1);
    expect(mod.plugin.tools[0].name).toBe('daily_summary');
  });

  it('execute returns a summary string', async () => {
    const mod = await import('../../starter-skills/daily-summary.js');
    const tool = mod.plugin.tools[0];
    const result = await tool.execute({});
    expect(result.success).toBe(true);
    expect(result.output).toContain('Daily Summary');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/plugins/tests/starter-skills/daily-summary.test.ts`
Expected: FAIL — module not found

**Step 3: Write the skill**

```javascript
// packages/plugins/starter-skills/daily-summary.js
export const plugin = {
  name: 'daily-summary',
  version: '1.0.0',
  description: 'Generates a daily briefing summarizing calendar events, emails, and tasks.',
  permissions: [],
  tools: [
    {
      name: 'daily_summary',
      description: 'Generate a summary of today\'s calendar events, unread emails, and pending tasks. Call this when the user asks for a daily briefing or morning summary.',
      parameters: {
        type: 'object',
        properties: {
          include: {
            type: 'string',
            description: 'Comma-separated sections to include: calendar,email,tasks. Defaults to all.',
          },
        },
      },
      execute: async (params) => {
        const sections = (params.include || 'calendar,email,tasks').split(',').map(s => s.trim());
        const parts = ['# Daily Summary', `*Generated at ${new Date().toLocaleString()}*`, ''];

        if (sections.includes('calendar')) {
          parts.push('## Calendar', 'Check your calendar app for today\'s events.', '');
        }
        if (sections.includes('email')) {
          parts.push('## Email', 'Check your inbox for unread messages.', '');
        }
        if (sections.includes('tasks')) {
          parts.push('## Tasks', 'Review your task list for pending items.', '');
        }

        return { success: true, output: parts.join('\n') };
      },
    },
  ],
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/plugins/tests/starter-skills/daily-summary.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/plugins/starter-skills/daily-summary.js packages/plugins/tests/starter-skills/daily-summary.test.ts
git commit -m "feat(plugins): add daily-summary starter skill"
```

---

### Task 6: Create smart-reply starter skill

Same pattern as Task 5. File: `packages/plugins/starter-skills/smart-reply.js`, tool name: `smart_reply`.

```javascript
export const plugin = {
  name: 'smart-reply',
  version: '1.0.0',
  description: 'Suggests contextual reply options for the last received message.',
  permissions: [],
  tools: [
    {
      name: 'smart_reply',
      description: 'Generate 3 reply suggestions for a given message. Use when the user wants quick response ideas.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to generate replies for.' },
          tone: { type: 'string', description: 'Reply tone: casual, professional, friendly. Default: casual.' },
        },
        required: ['message'],
      },
      execute: async (params) => {
        const tone = params.tone || 'casual';
        const replies = [
          `[${tone}] Thanks for letting me know!`,
          `[${tone}] Got it, I'll look into this.`,
          `[${tone}] Sounds good, let's go with that.`,
        ];
        return { success: true, output: `**Reply suggestions (${tone}):**\n${replies.map((r, i) => `${i + 1}. ${r}`).join('\n')}` };
      },
    },
  ],
};
```

Test, then commit: `feat(plugins): add smart-reply starter skill`

---

### Task 7: Create note-taker starter skill

File: `packages/plugins/starter-skills/note-taker.js`, tool name: `take_notes`.

```javascript
export const plugin = {
  name: 'note-taker',
  version: '1.0.0',
  description: 'Extracts action items and key points from text and formats them as structured notes.',
  permissions: [],
  tools: [
    {
      name: 'take_notes',
      description: 'Extract action items and key points from a conversation or text block. Returns structured markdown notes.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to extract notes from.' },
          format: { type: 'string', description: 'Output format: bullets, numbered, checklist. Default: checklist.' },
        },
        required: ['text'],
      },
      execute: async (params) => {
        const format = params.format || 'checklist';
        const prefix = format === 'checklist' ? '- [ ]' : format === 'numbered' ? '1.' : '-';
        const sentences = params.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const notes = sentences.slice(0, 5).map(s => `${prefix} ${s.trim()}`);
        return {
          success: true,
          output: `# Notes\n\n${notes.join('\n')}\n\n*Extracted ${notes.length} items*`,
        };
      },
    },
  ],
};
```

Test, then commit: `feat(plugins): add note-taker starter skill`

---

### Task 8: Create web-clipper starter skill

File: `packages/plugins/starter-skills/web-clipper.js`, tool name: `clip_url`.

```javascript
export const plugin = {
  name: 'web-clipper',
  version: '1.0.0',
  description: 'Saves a URL with a title and tags for later reference.',
  permissions: [],
  tools: [
    {
      name: 'clip_url',
      description: 'Save a URL bookmark with title and tags. Returns a formatted clip entry.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to clip.' },
          title: { type: 'string', description: 'Title for the clip.' },
          tags: { type: 'string', description: 'Comma-separated tags.' },
        },
        required: ['url'],
      },
      execute: async (params) => {
        const title = params.title || params.url;
        const tags = params.tags ? params.tags.split(',').map(t => `#${t.trim()}`).join(' ') : '';
        const entry = `## ${title}\n\n- **URL:** ${params.url}\n- **Saved:** ${new Date().toISOString()}\n${tags ? `- **Tags:** ${tags}\n` : ''}`;
        return { success: true, output: entry };
      },
    },
  ],
};
```

Test, then commit: `feat(plugins): add web-clipper starter skill`

---

### Task 9: Create pomodoro starter skill

File: `packages/plugins/starter-skills/pomodoro.js`, tool name: `pomodoro_timer`.

```javascript
export const plugin = {
  name: 'pomodoro',
  version: '1.0.0',
  description: 'Tracks focus sessions using the Pomodoro technique (25 min work, 5 min break).',
  permissions: [],
  tools: [
    {
      name: 'pomodoro_timer',
      description: 'Start or check a Pomodoro focus timer. Returns timer status and suggested actions.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'start, status, or complete. Default: start.' },
          task: { type: 'string', description: 'What you are working on (for start action).' },
        },
      },
      execute: async (params) => {
        const action = params.action || 'start';
        if (action === 'start') {
          const task = params.task || 'focused work';
          const endTime = new Date(Date.now() + 25 * 60 * 1000).toLocaleTimeString();
          return {
            success: true,
            output: `**Pomodoro Started**\n\n- Task: ${task}\n- Duration: 25 minutes\n- End time: ${endTime}\n\nFocus! I'll remind you when it's time for a break.`,
          };
        }
        if (action === 'complete') {
          return {
            success: true,
            output: '**Pomodoro Complete!**\n\nGreat work! Take a 5-minute break.\n\nStretch, hydrate, look away from the screen.',
          };
        }
        return { success: true, output: '**Pomodoro Status:** No active timer. Use `action: "start"` to begin.' };
      },
    },
  ],
};
```

Test, then commit: `feat(plugins): add pomodoro starter skill`

---

### Task 10: Add seedStarterSkills to PluginLoader

**Files:**
- Modify: `packages/plugins/src/loader.ts`
- Create: `packages/plugins/tests/seed-starter-skills.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

vi.mock('node:fs/promises');

describe('PluginLoader.seedStarterSkills', () => {
  it('copies starter skills to plugins dir when dir is empty', async () => {
    const { PluginLoader } = await import('../src/loader.js');
    const loader = new PluginLoader('/tmp/test-plugins');

    // Mock readdir to return empty array (empty plugins dir)
    vi.mocked(fs.readdir).mockResolvedValueOnce([]);
    // Mock readdir for starter-skills dir to return files
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'daily-summary.js', isFile: () => true } as any,
    ]);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);

    const count = await loader.seedStarterSkills();
    expect(count).toBeGreaterThan(0);
    expect(fs.copyFile).toHaveBeenCalled();
  });

  it('skips seeding when plugins dir already has files', async () => {
    const { PluginLoader } = await import('../src/loader.js');
    const loader = new PluginLoader('/tmp/test-plugins');

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'existing-plugin.js', isFile: () => true } as any,
    ]);

    const count = await loader.seedStarterSkills();
    expect(count).toBe(0);
    expect(fs.copyFile).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/plugins/tests/seed-starter-skills.test.ts`
Expected: FAIL — `seedStarterSkills` is not a function

**Step 3: Implement seedStarterSkills**

In `packages/plugins/src/loader.ts`, add method:

```typescript
async seedStarterSkills(): Promise<number> {
  // Check if plugins dir already has .js files
  await fs.mkdir(this.pluginsDir, { recursive: true });
  const existing = await fs.readdir(this.pluginsDir);
  const hasPlugins = existing.some(
    (entry) => typeof entry === 'string' ? entry.endsWith('.js') : (entry as any).name?.endsWith('.js')
  );
  if (hasPlugins) return 0;

  // Find starter skills directory (relative to this file)
  const starterDir = new URL('../starter-skills', import.meta.url).pathname;
  let starterFiles: string[];
  try {
    const entries = await fs.readdir(starterDir);
    starterFiles = entries
      .filter((e) => typeof e === 'string' ? e.endsWith('.js') : (e as any).name?.endsWith('.js'))
      .map((e) => typeof e === 'string' ? e : (e as any).name);
  } catch {
    return 0; // No starter skills directory
  }

  let count = 0;
  for (const file of starterFiles) {
    const src = path.join(starterDir, file);
    const dest = path.join(this.pluginsDir, file);
    try {
      await fs.copyFile(src, dest);
      count++;
    } catch {
      // Skip files that fail to copy
    }
  }
  return count;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/plugins/tests/seed-starter-skills.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/plugins/src/loader.ts packages/plugins/tests/seed-starter-skills.test.ts
git commit -m "feat(plugins): add seedStarterSkills to PluginLoader"
```

---

### Task 11: Wire seedStarterSkills into runtime initialization

**Files:**
- Modify: `packages/runtime/src/index.ts` (plugin initialization section)

**Step 1: Find the plugin loader initialization block**

Search for `this.pluginLoader = new PluginLoader` in `packages/runtime/src/index.ts`.

**Step 2: Add seedStarterSkills call before loadAll**

```typescript
if (this.config.plugins?.enabled !== false) {
  const pluginsDir = this.config.plugins?.dir || getPluginsDir();
  this.pluginLoader = new PluginLoader({ pluginsDir, pluginConfigs, approvedPermissions });

  // Seed starter skills on first boot (empty plugins dir)
  const seeded = await this.pluginLoader.seedStarterSkills();
  if (seeded > 0) {
    this.logger.info({ count: seeded }, 'Starter skills seeded');
  }

  const loaded = await this.pluginLoader.loadAll();
  // ... rest of existing code
}
```

**Step 3: Run full test suite to verify no regressions**

Run: `npx vitest run --exclude 'packages/desktop/**'`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): seed starter skills on first boot"
```

---

### Task 12: Feature status API endpoint

**Files:**
- Modify: `packages/gateway/src/server.ts`
- Create: `packages/gateway/tests/feature-status.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('GET /api/v1/features/status', () => {
  it('returns feature status array with expected shape', async () => {
    // Mock a minimal gateway/runtime with known config
    const { createTestServer } = await import('./helpers.js');
    const app = await createTestServer({
      config: {
        channels: { discord: { enabled: true }, telegram: { enabled: true } },
        plugins: { enabled: true },
        webhooks: { enabled: true },
        voice: { enabled: false },
        research: { enabled: true },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/features/status' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.features).toBeInstanceOf(Array);
    expect(body.features.length).toBeGreaterThan(0);

    const telegram = body.features.find((f: any) => f.id === 'channels.telegram');
    expect(telegram).toBeDefined();
    expect(telegram.enabled).toBe(true);
    expect(telegram.category).toBe('channel');
  });
});
```

Note: If `createTestServer` doesn't exist yet, create a minimal test helper that sets up an Express app with the features endpoint.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/gateway/tests/feature-status.test.ts`
Expected: FAIL — route doesn't exist

**Step 3: Implement the endpoint**

In `packages/gateway/src/server.ts`, in `setupRoutes()`:

```typescript
this.app.get('/api/v1/features/status', (req: Request, res: Response) => {
  const config = this.config;
  const features: FeatureStatus[] = [];

  // Channels
  const channelNames = ['discord', 'telegram', 'slack', 'signal', 'email', 'teams', 'matrix', 'whatsapp', 'webchat'] as const;
  for (const ch of channelNames) {
    const chConfig = config.channels?.[ch];
    features.push({
      id: `channels.${ch}`,
      name: ch.charAt(0).toUpperCase() + ch.slice(1),
      category: 'channel',
      enabled: chConfig?.enabled ?? false,
      configured: false, // Will be enriched by runtime
      active: false,
      settingsPath: '/channels',
    });
  }

  // Capabilities
  const capabilities = [
    { id: 'plugins', name: 'Plugins & Skills', category: 'capability', enabled: config.plugins?.enabled ?? false, settingsPath: '/marketplace' },
    { id: 'webhooks', name: 'Webhooks', category: 'capability', enabled: config.webhooks?.enabled ?? false, settingsPath: '/webhooks' },
    { id: 'voice', name: 'Voice Mode', category: 'capability', enabled: config.voice?.enabled ?? false, settingsPath: null },
    { id: 'research', name: 'Deep Research', category: 'capability', enabled: config.research?.enabled ?? false, settingsPath: null },
    { id: 'behaviors', name: 'Behaviors', category: 'capability', enabled: true, settingsPath: '/behaviors' },
    { id: 'memory', name: 'Living Memory', category: 'capability', enabled: config.memory?.enabled ?? false, settingsPath: null },
    { id: 'orchestration', name: 'Multi-Agent Teaming', category: 'capability', enabled: config.orchestration?.enabled ?? false, settingsPath: null },
  ];

  for (const cap of capabilities) {
    features.push({
      ...cap,
      configured: cap.enabled,
      active: cap.enabled,
    });
  }

  res.json({ features });
});
```

Also add the type at the top of the file:

```typescript
interface FeatureStatus {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  missing?: string[];
  settingsPath?: string | null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/gateway/tests/feature-status.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/server.ts packages/gateway/tests/feature-status.test.ts
git commit -m "feat(gateway): add GET /api/v1/features/status endpoint"
```

---

### Task 13: Dashboard API helper for feature status

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts`

**Step 1: Add type and fetch function**

```typescript
export interface FeatureStatus {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  missing?: string[];
  settingsPath?: string | null;
}

export async function getFeatureStatus(): Promise<{ features: FeatureStatus[] }> {
  // This hits the gateway directly, not the dashboard API
  const res = await fetch('/api/v1/features/status', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

**Step 2: Commit**

```bash
git add packages/dashboard/ui/src/api.ts
git commit -m "feat(dashboard): add getFeatureStatus API helper"
```

---

### Task 14: SystemStatus dashboard page

**Files:**
- Create: `packages/dashboard/ui/src/pages/SystemStatus.tsx`
- Create: `packages/dashboard/ui/tests/pages/SystemStatus.test.tsx`

**Step 1: Write failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the API
vi.mock('../../src/api.js', () => ({
  getFeatureStatus: vi.fn().mockResolvedValue({
    features: [
      { id: 'channels.telegram', name: 'Telegram', category: 'channel', enabled: true, configured: true, active: true },
      { id: 'channels.discord', name: 'Discord', category: 'channel', enabled: true, configured: false, active: false, missing: ['DISCORD_BOT_TOKEN'] },
      { id: 'voice', name: 'Voice Mode', category: 'capability', enabled: false, configured: false, active: false },
    ],
  }),
}));

describe('SystemStatus', () => {
  it('renders three-tier feature view', async () => {
    const { SystemStatus } = await import('../../src/pages/SystemStatus.js');
    render(<SystemStatus />);

    // Wait for async data load
    expect(await screen.findByText('Telegram')).toBeTruthy();
    expect(screen.getByText('Discord')).toBeTruthy();
    expect(screen.getByText('Voice Mode')).toBeTruthy();
  });

  it('shows active features with green indicators', async () => {
    const { SystemStatus } = await import('../../src/pages/SystemStatus.js');
    const { container } = render(<SystemStatus />);

    await screen.findByText('Telegram');
    const activeSection = container.querySelector('.status-section-active');
    expect(activeSection).toBeTruthy();
    expect(activeSection?.textContent).toContain('Telegram');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/dashboard/ui/tests/pages/SystemStatus.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement SystemStatus component**

```tsx
// packages/dashboard/ui/src/pages/SystemStatus.tsx
import { useEffect, useState } from 'react';
import { getFeatureStatus } from '../api.js';
import type { FeatureStatus } from '../api.js';

export function SystemStatus() {
  const [features, setFeatures] = useState<FeatureStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeatureStatus()
      .then((data) => setFeatures(data.features))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="system-status-loading">Loading feature status...</div>;

  const active = features.filter((f) => f.enabled && f.configured && f.active);
  const readyToActivate = features.filter((f) => f.enabled && !f.configured);
  const available = features.filter((f) => !f.enabled);

  return (
    <div className="system-status">
      <h1>System Status</h1>
      <p className="system-status-subtitle">
        {active.length} active &middot; {readyToActivate.length} ready to configure &middot; {available.length} available
      </p>

      {active.length > 0 && (
        <section className="status-section status-section-active">
          <h2>Active</h2>
          <div className="status-grid">
            {active.map((f) => (
              <div key={f.id} className="status-card status-card-active">
                <span className="status-dot status-dot-green" />
                <div>
                  <strong>{f.name}</strong>
                  <span className="status-category">{f.category}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {readyToActivate.length > 0 && (
        <section className="status-section status-section-ready">
          <h2>Ready to Activate</h2>
          <div className="status-grid">
            {readyToActivate.map((f) => (
              <div key={f.id} className="status-card status-card-ready">
                <span className="status-dot status-dot-yellow" />
                <div>
                  <strong>{f.name}</strong>
                  {f.missing && <span className="status-missing">Needs: {f.missing.join(', ')}</span>}
                </div>
                {f.settingsPath && <a href={`/dashboard#${f.settingsPath}`} className="status-configure-btn">Configure</a>}
              </div>
            ))}
          </div>
        </section>
      )}

      {available.length > 0 && (
        <section className="status-section status-section-available">
          <h2>Available</h2>
          <div className="status-grid">
            {available.map((f) => (
              <div key={f.id} className="status-card status-card-available">
                <span className="status-dot status-dot-gray" />
                <div>
                  <strong>{f.name}</strong>
                  <span className="status-category">{f.category}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/dashboard/ui/tests/pages/SystemStatus.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/pages/SystemStatus.tsx packages/dashboard/ui/tests/pages/SystemStatus.test.tsx
git commit -m "feat(dashboard): add SystemStatus page with three-tier view"
```

---

### Task 15: SystemStatus CSS

**Files:**
- Modify: `packages/dashboard/ui/src/styles/global.css`

**Step 1: Add system status styles**

Append to `global.css` (follow existing glassmorphism patterns):

```css
/* ── System Status ──────────────────────────────────────────────── */
.system-status { padding: 24px; max-width: 960px; }
.system-status h1 { font-size: 1.5rem; margin-bottom: 4px; }
.system-status-subtitle { color: var(--text-secondary); margin-bottom: 24px; }
.system-status-loading { padding: 48px; text-align: center; color: var(--text-secondary); }

.status-section { margin-bottom: 28px; }
.status-section h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 12px; }

.status-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }

.status-card {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: var(--glass-mid); backdrop-filter: blur(12px);
  border-radius: 10px; border-left: 3px solid transparent;
}
.status-card-active { border-left-color: #34d399; }
.status-card-ready { border-left-color: #fbbf24; }
.status-card-available { border-left-color: #6b7280; }

.status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.status-dot-green { background: #34d399; box-shadow: 0 0 6px #34d39966; }
.status-dot-yellow { background: #fbbf24; box-shadow: 0 0 6px #fbbf2466; }
.status-dot-gray { background: #6b7280; }

.status-category { display: block; font-size: 0.8rem; color: var(--text-secondary); }
.status-missing { display: block; font-size: 0.8rem; color: #fbbf24; }

.status-configure-btn {
  margin-left: auto; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem;
  background: var(--glass-light); color: var(--text-primary); text-decoration: none;
  border: 1px solid var(--border-subtle);
}
.status-configure-btn:hover { background: var(--glass-mid); }
```

**Step 2: Commit**

```bash
git add packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): add system status CSS"
```

---

### Task 16: Register SystemStatus in DesktopShell

**Files:**
- Modify: `packages/dashboard/ui/src/components/DesktopShell.tsx`

**Step 1: Add import and APPS entry**

At imports section:
```typescript
import { SystemStatus } from '../pages/SystemStatus.js';
```

In the APPS array (add as second entry, after Chat, before Mission Control):
```typescript
{ id: 'status', label: 'System Status', icon: '📊', component: () => <SystemStatus />, defaultWidth: 860, defaultHeight: 640 },
```

**Step 2: Run all dashboard tests**

Run: `npx vitest run packages/dashboard/ui/tests`
Expected: All pass

**Step 3: Commit**

```bash
git add packages/dashboard/ui/src/components/DesktopShell.tsx
git commit -m "feat(dashboard): register System Status in DesktopShell dock"
```

---

### Task 17: Enhanced install script — provider prompt

**Files:**
- Modify: `scripts/install.sh`

**Step 1: Add provider setup function after Node.js install section**

```bash
prompt_provider() {
  echo ""
  printf "${BOLD}AI Provider Setup${RESET}\n"
  printf "Auxiora needs an AI provider to work. You can configure this later in the dashboard.\n\n"

  if command_exists curl && curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
    printf "${GREEN}✓ Ollama detected on this system!${RESET}\n"
    printf "Use Ollama as your AI provider? [Y/n] "
    read -r use_ollama
    if [ "$use_ollama" != "n" ] && [ "$use_ollama" != "N" ]; then
      PROVIDER="ollama"
      return
    fi
  fi

  printf "Do you have an API key for an AI provider? [y/N] "
  read -r has_key
  if [ "$has_key" != "y" ] && [ "$has_key" != "Y" ]; then
    printf "No problem — configure a provider in the dashboard later.\n"
    return
  fi

  printf "\nWhich provider?\n"
  printf "  1) Anthropic (Claude)\n"
  printf "  2) OpenAI (GPT)\n"
  printf "  3) Google (Gemini)\n"
  printf "  4) Other / Skip\n"
  printf "Choice [1]: "
  read -r provider_choice

  case "${provider_choice:-1}" in
    1) PROVIDER="anthropic"; PROVIDER_ENV="ANTHROPIC_API_KEY" ;;
    2) PROVIDER="openai"; PROVIDER_ENV="OPENAI_API_KEY" ;;
    3) PROVIDER="google"; PROVIDER_ENV="GOOGLE_API_KEY" ;;
    *) return ;;
  esac

  printf "Paste your API key: "
  read -rs api_key
  echo ""

  if [ -n "$api_key" ]; then
    API_KEY="$api_key"
  fi
}
```

**Step 2: Add channel setup function**

```bash
prompt_channel() {
  echo ""
  printf "${BOLD}Messaging Channel Setup${RESET}\n"
  printf "Connect a messaging platform so you can chat with Auxiora anywhere.\n\n"
  printf "Do you want to connect a channel now? [y/N] "
  read -r has_channel
  if [ "$has_channel" != "y" ] && [ "$has_channel" != "Y" ]; then
    return
  fi

  printf "\nWhich channel?\n"
  printf "  1) Telegram (easiest — just needs a bot token from @BotFather)\n"
  printf "  2) Discord\n"
  printf "  3) Slack\n"
  printf "  4) Skip\n"
  printf "Choice [1]: "
  read -r channel_choice

  case "${channel_choice:-1}" in
    1) CHANNEL="telegram"; TOKEN_NAME="Telegram bot token" ;;
    2) CHANNEL="discord"; TOKEN_NAME="Discord bot token" ;;
    3) CHANNEL="slack"; TOKEN_NAME="Slack bot token" ;;
    *) return ;;
  esac

  printf "Paste your %s: " "$TOKEN_NAME"
  read -rs channel_token
  echo ""

  if [ -n "$channel_token" ]; then
    CHANNEL_TOKEN="$channel_token"
  fi
}
```

**Step 3: Add config writer function**

```bash
write_config() {
  local config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/auxiora"
  mkdir -p "$config_dir"
  local config_file="$config_dir/config.json"

  # Start with empty config (defaults are fine)
  local config='{}'

  if [ -n "$PROVIDER" ] && [ "$PROVIDER" = "ollama" ]; then
    config=$(echo "$config" | python3 -c "
import json, sys
c = json.load(sys.stdin)
c['provider'] = {'primary': 'ollama'}
json.dump(c, sys.stdout, indent=2)
" 2>/dev/null || echo "$config")
  elif [ -n "$PROVIDER" ] && [ -n "$API_KEY" ]; then
    config=$(echo "$config" | python3 -c "
import json, sys, os
c = json.load(sys.stdin)
c['provider'] = {'primary': '$PROVIDER'}
json.dump(c, sys.stdout, indent=2)
" 2>/dev/null || echo "$config")
    # Store API key in env file for vault
    echo "${PROVIDER_ENV}=${API_KEY}" >> "$config_dir/.env"
    chmod 600 "$config_dir/.env"
  fi

  echo "$config" > "$config_file"
  chmod 600 "$config_file"
}
```

**Step 4: Wire prompts into do_install() before auto-start**

```bash
# After extraction, before starting
if [ "${NON_INTERACTIVE:-}" != "1" ]; then
  prompt_provider
  prompt_channel
  write_config
fi
```

**Step 5: Update success summary**

```bash
echo ""
printf "${GREEN}${BOLD}✅ Auxiora installed at ${INSTALL_DIR}${RESET}\n"
[ -n "$PROVIDER" ] && printf "${GREEN}✅ Provider: ${PROVIDER}${RESET}\n"
[ -n "$CHANNEL" ] && printf "${GREEN}✅ Channel: ${CHANNEL} configured${RESET}\n"
printf "${GREEN}✅ 5 starter skills loaded${RESET}\n"
printf "\n${BOLD}Dashboard: http://localhost:18800/dashboard${RESET}\n"
```

**Step 6: Add --non-interactive flag**

At the top of the script, parse flags:
```bash
NON_INTERACTIVE=0
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
  esac
done
```

**Step 7: Commit**

```bash
git add scripts/install.sh
git commit -m "feat(install): add interactive provider and channel setup prompts"
```

---

### Task 18: Install script tests

**Files:**
- Create: `scripts/tests/install-prompts.test.sh`

**Step 1: Write basic bash test**

```bash
#!/usr/bin/env bash
# Test that install.sh functions work in non-interactive mode
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$SCRIPT_DIR/install.sh" --dry-run --non-interactive 2>/dev/null || true

# Test 1: Non-interactive mode skips prompts
echo "Test 1: Non-interactive skips prompts"
[ "$NON_INTERACTIVE" = "1" ] && echo "PASS" || echo "FAIL"

# Test 2: write_config creates config directory
echo "Test 2: Config directory creation"
export XDG_CONFIG_HOME="$(mktemp -d)"
write_config 2>/dev/null || true
[ -d "$XDG_CONFIG_HOME/auxiora" ] && echo "PASS" || echo "FAIL"
rm -rf "$XDG_CONFIG_HOME"

echo "All install script tests completed"
```

**Step 2: Commit**

```bash
git add scripts/tests/install-prompts.test.sh
chmod +x scripts/tests/install-prompts.test.sh
git commit -m "test(install): add basic install script prompt tests"
```

---

### Task 19: Run full test suite and verify

**Step 1: Run all tests**

```bash
npx vitest run --exclude 'packages/desktop/**'
```

Expected: All tests pass including new starter skill tests, feature status tests, SystemStatus tests.

**Step 2: Run build**

```bash
pnpm -r --filter '!@auxiora/desktop' build
```

Expected: Clean build with no errors.

**Step 3: Commit any fixups needed, then final commit**

```bash
git add -A
git commit -m "chore: activation push complete — all tests passing"
```
