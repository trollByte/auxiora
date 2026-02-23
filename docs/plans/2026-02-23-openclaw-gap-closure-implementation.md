# OpenClaw Gap Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the two remaining gaps vs OpenClaw — add group chat awareness to channel adapters + enrichment pipeline, and build a browsable Marketplace UI in the dashboard.

**Architecture:** Group context flows from channel adapters (new `groupContext` field on `InboundMessage`) through `handleChannelMessage` into a new `GroupContextStage` (order 150) in the enrichment pipeline. Marketplace UI is a new React component in the DesktopShell, hitting marketplace Fastify routes via a gateway reverse proxy at `/api/v1/marketplace/*`.

**Tech Stack:** TypeScript strict ESM, React 19, vanilla CSS with CSS custom properties, vitest, Express 5 (gateway), Fastify (marketplace sidecar)

---

## Part A: Group Chat Awareness

### Task 1: Add `groupContext` to `InboundMessage` type

**Files:**
- Modify: `packages/channels/src/types.ts:3-14`
- Test: `packages/channels/tests/types.test.ts` (create)

**Step 1: Write the failing test**

Create `packages/channels/tests/types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { InboundMessage } from '../src/types.js';

describe('InboundMessage type', () => {
  it('accepts groupContext field', () => {
    const msg: InboundMessage = {
      id: '1',
      channelType: 'discord',
      channelId: 'ch1',
      senderId: 'u1',
      content: 'hello',
      timestamp: Date.now(),
      groupContext: {
        isGroup: true,
        groupName: 'Test Group',
        participantCount: 5,
      },
    };
    expect(msg.groupContext?.isGroup).toBe(true);
    expect(msg.groupContext?.groupName).toBe('Test Group');
    expect(msg.groupContext?.participantCount).toBe(5);
  });

  it('allows groupContext to be undefined', () => {
    const msg: InboundMessage = {
      id: '1',
      channelType: 'discord',
      channelId: 'ch1',
      senderId: 'u1',
      content: 'hello',
      timestamp: Date.now(),
    };
    expect(msg.groupContext).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/channels/tests/types.test.ts`
Expected: FAIL — `groupContext` does not exist on type `InboundMessage`

**Step 3: Add `groupContext` to `InboundMessage`**

In `packages/channels/src/types.ts`, add after the `raw?: unknown;` line (line 13):

```typescript
  groupContext?: {
    isGroup: boolean;
    groupName?: string;
    participantCount?: number;
  };
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/channels/tests/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channels/src/types.ts packages/channels/tests/types.test.ts
git commit -m "feat(channels): add groupContext to InboundMessage type"
```

---

### Task 2: Populate `groupContext` in Discord adapter

**Files:**
- Modify: `packages/channels/src/adapters/discord.ts:111-142`
- Test: `packages/channels/tests/discord.test.ts` (existing — add test case)

**Step 1: Write the failing test**

In the existing `packages/channels/tests/discord.test.ts`, add a test that creates a mock Discord message from a guild text channel and asserts `groupContext` is populated. The Discord adapter's `toInboundMessage` is private, so test via the `onMessage` handler:

```typescript
it('populates groupContext for guild channel messages', async () => {
  // Find the existing test pattern in discord.test.ts that triggers onMessage
  // and assert the resulting InboundMessage has:
  //   groupContext.isGroup === true
  //   groupContext.groupName === channel.name
  //   groupContext.participantCount === channel.memberCount (or guild.memberCount)
});
```

Look at the existing Discord test file to match its mock pattern. The key assertion is that `groupContext` is populated when the message comes from a non-DM channel.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/channels/tests/discord.test.ts`
Expected: FAIL — `groupContext` is undefined

**Step 3: Implement in Discord adapter**

In `packages/channels/src/adapters/discord.ts`, modify `toInboundMessage` (line 111-142). After the `raw: message` line, add `groupContext`:

```typescript
    raw: message,
    groupContext: message.channel.isDMBased?.()
      ? undefined
      : {
          isGroup: true,
          groupName: 'name' in message.channel ? (message.channel as { name: string }).name : undefined,
          participantCount: 'memberCount' in message.channel
            ? (message.channel as { memberCount: number | null }).memberCount ?? undefined
            : undefined,
        },
```

Note: Discord.js `GuildTextChannel` has `name` and `memberCount`. `DMChannel` has `isDMBased() === true`. Use type narrowing carefully — the adapter already imports `DiscordMessage` but channel types vary.

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/channels/tests/discord.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channels/src/adapters/discord.ts packages/channels/tests/discord.test.ts
git commit -m "feat(channels): populate groupContext in Discord adapter"
```

---

### Task 3: Populate `groupContext` in Telegram adapter

**Files:**
- Modify: `packages/channels/src/adapters/telegram.ts:71-88`
- Test: `packages/channels/tests/telegram.test.ts` (existing — add test case)

**Step 1: Write the failing test**

Add a test case in the existing Telegram test file asserting `groupContext` is populated when `chat.type === 'group'` or `'supergroup'`. Match the existing mock pattern.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/channels/tests/telegram.test.ts`
Expected: FAIL

**Step 3: Implement in Telegram adapter**

In `toInboundMessage` (line 71-88), add after `raw: message`:

```typescript
    raw: message,
    groupContext: message.chat.type === 'group' || message.chat.type === 'supergroup'
      ? {
          isGroup: true,
          groupName: 'title' in message.chat ? (message.chat as { title?: string }).title : undefined,
        }
      : undefined,
```

Note: Telegram's `chat.type` is `'private' | 'group' | 'supergroup' | 'channel'`. Group chats have `title`. Participant count requires an API call (`getChatMemberCount`) which is async — skip it for now (the field is optional).

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/channels/tests/telegram.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channels/src/adapters/telegram.ts packages/channels/tests/telegram.test.ts
git commit -m "feat(channels): populate groupContext in Telegram adapter"
```

---

### Task 4: Populate `groupContext` in Signal adapter

**Files:**
- Modify: `packages/channels/src/adapters/signal.ts:200-230`
- Test: `packages/channels/tests/signal.test.ts` (existing — add test case)

**Step 1: Write the failing test**

Add test asserting `groupContext.isGroup === true` when `dataMessage.groupInfo` is present. Signal already computes `isGroup` locally (line 202) but discards it.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/channels/tests/signal.test.ts`
Expected: FAIL

**Step 3: Implement in Signal adapter**

In `toInboundMessage` (line 200-230), add after `raw: msg`:

```typescript
    raw: msg,
    groupContext: isGroup
      ? { isGroup: true }
      : undefined,
```

Note: Signal CLI doesn't provide group name or member count in the message payload. Only `isGroup: true` can be set. The `groupName` and `participantCount` fields remain undefined.

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/channels/tests/signal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channels/src/adapters/signal.ts packages/channels/tests/signal.test.ts
git commit -m "feat(channels): populate groupContext in Signal adapter"
```

---

### Task 5: Populate `groupContext` in Slack adapter

**Files:**
- Modify: `packages/channels/src/adapters/slack.ts:148-165`
- Test: `packages/channels/tests/slack.test.ts` (existing — add test case)

**Step 1: Write the failing test**

Add test asserting `groupContext` is populated. Slack's `app_mention` event (which constructs InboundMessage inline at lines 115-124) also needs the same treatment. Test both paths if both exist.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/channels/tests/slack.test.ts`
Expected: FAIL

**Step 3: Implement in Slack adapter**

The Slack adapter has two InboundMessage construction paths: `toInboundMessage()` and the inline one in the `app_mention` handler. For `toInboundMessage`, the message object doesn't carry channel type info. The `app_mention` handler has `event.channel_type` which is `'im'` for DMs.

For the `app_mention` handler (lines 115-124), add:

```typescript
    groupContext: event.channel_type !== 'im'
      ? { isGroup: true, groupName: event.channel_name }
      : undefined,
```

For `toInboundMessage`, which handles `message` events — check the raw message for `channel_type`:

```typescript
    raw: message,
    groupContext: (message as Record<string, unknown>).channel_type !== 'im'
      ? { isGroup: true }
      : undefined,
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/channels/tests/slack.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channels/src/adapters/slack.ts packages/channels/tests/slack.test.ts
git commit -m "feat(channels): populate groupContext in Slack adapter"
```

---

### Task 6: Populate `groupContext` in remaining adapters (Teams, Matrix, WhatsApp)

**Files:**
- Modify: `packages/channels/src/adapters/teams.ts`
- Modify: `packages/channels/src/adapters/matrix.ts`
- Modify: `packages/channels/src/adapters/whatsapp.ts`
- Test: corresponding test files

Follow the same pattern as Tasks 2-5. For each adapter:

**Teams:** Check `conversation.isGroup` from the Bot Framework activity.

**Matrix:** Check if the room has more than 2 joined members (matrix rooms are always "rooms", but DMs are rooms with 2 members).

**WhatsApp:** Check the webhook payload for group indicators (Meta Graph API uses `entry[].changes[].value.contacts` and the message `from` field — group messages come with a `groupId`).

Each adapter: write failing test, implement minimal groupContext population, verify pass, commit separately per adapter.

**Commits:**
```bash
git commit -m "feat(channels): populate groupContext in Teams adapter"
git commit -m "feat(channels): populate groupContext in Matrix adapter"
git commit -m "feat(channels): populate groupContext in WhatsApp adapter"
```

---

### Task 7: Extend `EnrichmentContext` with group fields

**Files:**
- Modify: `packages/runtime/src/enrichment/types.ts:3-13`
- Test: compile check (type-only change)

**Step 1: No test needed (type-only change) — verify existing tests still pass**

Run: `npx vitest run packages/runtime/`
Expected: All existing tests PASS

**Step 2: Add fields to `EnrichmentContext`**

In `packages/runtime/src/enrichment/types.ts`, add after `readonly config: Config;` (line 12):

```typescript
  readonly senderName?: string;
  readonly groupContext?: {
    readonly isGroup: boolean;
    readonly groupName?: string;
    readonly participantCount?: number;
  };
```

Adding `senderName` too — the GroupContextStage needs it to address participants by name, and it's currently missing from `EnrichmentContext` despite being available on `InboundMessage`.

**Step 3: Verify existing tests still pass**

Run: `npx vitest run packages/runtime/`
Expected: All PASS (new fields are optional, no breakage)

**Step 4: Commit**

```bash
git add packages/runtime/src/enrichment/types.ts
git commit -m "feat(enrichment): add senderName and groupContext to EnrichmentContext"
```

---

### Task 8: Create `GroupContextStage`

**Files:**
- Create: `packages/runtime/src/enrichment/stages/group-context-stage.ts`
- Create: `packages/runtime/tests/enrichment/group-context-stage.test.ts`
- Modify: `packages/runtime/src/enrichment/index.ts:1-7` (add export)

**Step 1: Write the failing test**

Create `packages/runtime/tests/enrichment/group-context-stage.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { GroupContextStage } from '../../src/enrichment/stages/group-context-stage.js';
import type { EnrichmentContext } from '../../src/enrichment/types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'You are a helpful assistant.',
    userMessage: 'Hello everyone',
    history: [],
    channelType: 'discord',
    chatId: 'discord:general',
    sessionId: 'sess1',
    userId: 'user1',
    toolsUsed: [],
    config: {} as never,
    ...overrides,
  };
}

describe('GroupContextStage', () => {
  const stage = new GroupContextStage();

  it('has order 150', () => {
    expect(stage.order).toBe(150);
  });

  it('is disabled when no groupContext', () => {
    expect(stage.enabled(makeCtx())).toBe(false);
  });

  it('is disabled when groupContext.isGroup is false', () => {
    expect(stage.enabled(makeCtx({ groupContext: { isGroup: false } }))).toBe(false);
  });

  it('is enabled when groupContext.isGroup is true', () => {
    expect(stage.enabled(makeCtx({ groupContext: { isGroup: true } }))).toBe(true);
  });

  it('prepends group context instruction with all fields', async () => {
    const ctx = makeCtx({
      senderName: 'Alice',
      groupContext: { isGroup: true, groupName: 'Dev Team', participantCount: 8 },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('group chat');
    expect(result.prompt).toContain('Dev Team');
    expect(result.prompt).toContain('8');
    expect(result.prompt).toContain('Alice');
    expect(result.prompt).toContain('Base prompt.');
  });

  it('omits groupName when not provided', async () => {
    const ctx = makeCtx({
      senderName: 'Bob',
      groupContext: { isGroup: true, participantCount: 3 },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('group chat');
    expect(result.prompt).not.toContain('called');
    expect(result.prompt).toContain('Bob');
  });

  it('omits participantCount when not provided', async () => {
    const ctx = makeCtx({
      groupContext: { isGroup: true, groupName: 'Watercooler' },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('Watercooler');
    expect(result.prompt).not.toContain('participants');
  });

  it('omits senderName when not provided', async () => {
    const ctx = makeCtx({
      groupContext: { isGroup: true },
    });
    const result = await stage.enrich(ctx, 'Base prompt.');
    expect(result.prompt).toContain('group chat');
    expect(result.prompt).not.toContain('speaker');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/runtime/tests/enrichment/group-context-stage.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `GroupContextStage`**

Create `packages/runtime/src/enrichment/stages/group-context-stage.ts`:

```typescript
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class GroupContextStage implements EnrichmentStage {
  readonly name = 'group-context';
  readonly order = 150;

  enabled(ctx: EnrichmentContext): boolean {
    return ctx.groupContext?.isGroup === true;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const parts: string[] = ['You are in a group chat'];

    if (ctx.groupContext?.groupName) {
      parts[0] += ` called "${ctx.groupContext.groupName}"`;
    }

    if (ctx.groupContext?.participantCount) {
      parts.push(`with ~${ctx.groupContext.participantCount} participants`);
    }

    const instruction = [parts.join(' ') + '.'];

    if (ctx.senderName) {
      instruction.push(`The current speaker is ${ctx.senderName}. Address them by name.`);
    }

    instruction.push('Keep responses concise — group chats move fast.');

    const section = '\n\n[Group Context]\n' + instruction.join(' ');
    return { prompt: currentPrompt + section };
  }
}
```

**Step 4: Add barrel export**

In `packages/runtime/src/enrichment/index.ts`, add:

```typescript
export { GroupContextStage } from './stages/group-context-stage.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/runtime/tests/enrichment/group-context-stage.test.ts`
Expected: PASS (all 7 tests)

**Step 6: Commit**

```bash
git add packages/runtime/src/enrichment/stages/group-context-stage.ts packages/runtime/tests/enrichment/group-context-stage.test.ts packages/runtime/src/enrichment/index.ts
git commit -m "feat(enrichment): add GroupContextStage for group chat awareness"
```

---

### Task 9: Wire group context through `handleChannelMessage` and `buildEnrichmentPipeline`

**Files:**
- Modify: `packages/runtime/src/index.ts:2583-2617` (buildEnrichmentPipeline)
- Modify: `packages/runtime/src/index.ts:3850-3865` (EnrichmentContext assembly)

**Step 1: Write integration test**

Add a test (or modify existing enrichment integration test) that sends an `InboundMessage` with `groupContext` and verifies the enriched prompt contains group context instructions. Check existing test patterns in `packages/runtime/tests/` for how `handleChannelMessage` is tested.

**Step 2: Run test to verify it fails**

Expected: FAIL — groupContext not passed to enrichment, GroupContextStage not registered

**Step 3: Wire `buildEnrichmentPipeline`**

In `packages/runtime/src/index.ts`, in `buildEnrichmentPipeline()` (line 2583), add the GroupContextStage after the pipeline is created (line 2584) and before Stage 1:

```typescript
  private buildEnrichmentPipeline(): void {
    this.enrichmentPipeline = new EnrichmentPipeline();

    // Stage 0.5: Group context (order 150) — always enabled, self-gates via enabled()
    this.enrichmentPipeline.addStage(new GroupContextStage());

    // Stage 1: Memory (order 100)
    // ... rest unchanged
```

Import `GroupContextStage` at the top of the file with the other enrichment imports.

**Step 4: Wire `handleChannelMessage` EnrichmentContext**

In `packages/runtime/src/index.ts`, in the EnrichmentContext assembly block (~line 3850-3865), add the new fields:

```typescript
  const enrichCtx: EnrichmentContext = {
    basePrompt: this.systemPrompt,
    userMessage: messageContent,
    history: contextMessages,
    channelType: inbound.channelType,
    chatId: channelChatId,
    sessionId: session.id,
    userId: inbound.senderId ?? 'anonymous',
    senderName: inbound.senderName,
    groupContext: inbound.groupContext,
    toolsUsed: this.lastToolsUsed.get(session.id) ?? [],
    config: this.config,
  };
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/runtime/tests/`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire GroupContextStage into enrichment pipeline"
```

---

## Part B: Marketplace UI

### Task 10: Add gateway reverse proxy for marketplace routes

**Files:**
- Modify: `packages/gateway/src/server.ts:553-570`
- Test: `packages/gateway/tests/marketplace-proxy.test.ts` (create)

**Step 1: Write the failing test**

Create `packages/gateway/tests/marketplace-proxy.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

// Test that the gateway proxies /api/v1/marketplace/* to the marketplace port
// Mock a simple HTTP server on port 18801 that echoes requests, then
// hit the gateway's /api/v1/marketplace/plugins/search and verify it proxies through.

describe('marketplace proxy', () => {
  let mockMarketplace: http.Server;

  beforeAll(async () => {
    mockMarketplace = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ proxied: true, path: req.url }));
    });
    await new Promise<void>((resolve) => mockMarketplace.listen(18801, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockMarketplace.close(() => resolve()));
  });

  it('proxies marketplace requests', async () => {
    // This test verifies the proxy middleware function itself
    // The exact approach depends on how the gateway test harness works
    // Check existing gateway tests for the pattern
    expect(true).toBe(true); // placeholder — adapt to existing test setup
  });
});
```

Adapt this to the existing gateway test pattern. The core logic to test is: requests to `/api/v1/marketplace/*` get forwarded to `http://127.0.0.1:{marketplacePort}/api/v1/*`.

**Step 2: Implement the proxy middleware**

In `packages/gateway/src/server.ts`, after the marketplace sidecar starts successfully (~line 565), store the marketplace port and mount a proxy middleware:

```typescript
      await registryServer.listen({ port: marketplace.port ?? 18801, host: '127.0.0.1' });
      logger.info(`Marketplace registry listening on port ${marketplace.port ?? 18801}`);

      // Reverse proxy: /api/v1/marketplace/* → marketplace sidecar
      const marketplacePort = marketplace.port ?? 18801;
      this.app.all('/api/v1/marketplace/*', (req: Request, res: Response) => {
        const targetPath = '/api/v1' + req.url.replace('/api/v1/marketplace', '');
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: marketplacePort,
            path: targetPath,
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${marketplacePort}` },
          },
          (proxyRes) => {
            res.status(proxyRes.statusCode ?? 502);
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (value) res.setHeader(key, value);
            }
            proxyRes.pipe(res);
          },
        );
        proxyReq.on('error', (err) => {
          logger.warn('Marketplace proxy error', { error: err.message });
          res.status(502).json({ error: 'Marketplace unavailable' });
        });
        if (req.body && typeof req.body === 'object') {
          proxyReq.write(JSON.stringify(req.body));
        }
        proxyReq.end();
      });
```

Import `http` at the top of server.ts (it may already be imported as `createServer`).

**Step 3: Run test to verify it passes**

Run: `npx vitest run packages/gateway/tests/marketplace-proxy.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/gateway/src/server.ts packages/gateway/tests/marketplace-proxy.test.ts
git commit -m "feat(gateway): add reverse proxy for marketplace routes"
```

---

### Task 11: Add marketplace API functions to dashboard

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts`
- Test: `packages/dashboard/ui/tests/api.test.ts` (if exists, add cases)

**Step 1: Add marketplace functions to the `api` object**

At the end of the `api` object in `packages/dashboard/ui/src/api.ts`, add:

```typescript
  // Marketplace
  searchPlugins: (params: { q?: string; author?: string; keywords?: string; sort?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.author) qs.set('author', params.author);
    if (params.keywords) qs.set('keywords', params.keywords);
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return fetchMarketplace<{ plugins: PluginListing[]; total: number; limit: number; offset: number }>(
      `/plugins/search${query ? `?${query}` : ''}`
    );
  },
  getPlugin: (name: string) => fetchMarketplace<PluginListing>(`/plugins/${encodeURIComponent(name)}`),
  installPlugin: (name: string, version?: string) =>
    fetchMarketplace<{ success: boolean; name: string; version: string }>('/plugins/install', {
      method: 'POST',
      body: JSON.stringify({ name, version }),
    }),
  searchPersonalities: (params: { q?: string; author?: string; sort?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.author) qs.set('author', params.author);
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return fetchMarketplace<{ personalities: PersonalityListing[]; total: number; limit: number; offset: number }>(
      `/personalities/search${query ? `?${query}` : ''}`
    );
  },
  getPersonality: (name: string) => fetchMarketplace<PersonalityListing>(`/personalities/${encodeURIComponent(name)}`),
  installPersonality: (name: string, version?: string) =>
    fetchMarketplace<{ success: boolean; name: string; version: string }>('/personalities/install', {
      method: 'POST',
      body: JSON.stringify({ name, version }),
    }),
```

Also add the `fetchMarketplace` helper and type interfaces near the top of the file:

```typescript
const MARKETPLACE_BASE = '/api/v1/marketplace';

async function fetchMarketplace<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${MARKETPLACE_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/dashboard/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

interface PluginListing {
  name: string; version: string; description: string; author: string;
  license: string; permissions: string[]; keywords: string[];
  downloads: number; rating: number; createdAt: string; updatedAt: string;
  homepage?: string; repository?: string;
}

interface PersonalityListing {
  name: string; version: string; description: string; author: string;
  preview: string; tone: { warmth: number; humor: number; formality: number };
  keywords: string[]; downloads: number; rating: number;
  createdAt: string; updatedAt: string;
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit -p packages/dashboard/ui/tsconfig.json` (or however the dashboard typechecks)
Expected: No errors

**Step 3: Commit**

```bash
git add packages/dashboard/ui/src/api.ts
git commit -m "feat(dashboard): add marketplace API functions"
```

---

### Task 12: Create `MarketplaceCard` component

**Files:**
- Create: `packages/dashboard/ui/src/components/MarketplaceCard.tsx`
- Create: `packages/dashboard/ui/tests/components/MarketplaceCard.test.tsx`

**Step 1: Write the failing test**

Create `packages/dashboard/ui/tests/components/MarketplaceCard.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarketplaceCard } from '../../src/components/MarketplaceCard.js';

describe('MarketplaceCard', () => {
  const plugin = {
    name: 'weather-plugin',
    version: '1.2.0',
    description: 'Get real-time weather data',
    author: 'testuser',
    downloads: 1234,
    rating: 4.2,
    keywords: ['weather', 'api'],
  };

  it('renders plugin name and author', () => {
    render(<MarketplaceCard item={plugin} onSelect={() => {}} onInstall={() => {}} />);
    expect(screen.getByText('weather-plugin')).toBeTruthy();
    expect(screen.getByText('testuser')).toBeTruthy();
  });

  it('renders download count', () => {
    render(<MarketplaceCard item={plugin} onSelect={() => {}} onInstall={() => {}} />);
    expect(screen.getByText(/1,234/)).toBeTruthy();
  });

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn();
    render(<MarketplaceCard item={plugin} onSelect={onSelect} onInstall={() => {}} />);
    fireEvent.click(screen.getByText('weather-plugin'));
    expect(onSelect).toHaveBeenCalledWith(plugin);
  });

  it('calls onInstall when install button is clicked', () => {
    const onInstall = vi.fn();
    render(<MarketplaceCard item={plugin} onSelect={() => {}} onInstall={onInstall} />);
    fireEvent.click(screen.getByText('Install'));
    expect(onInstall).toHaveBeenCalledWith(plugin);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/dashboard/ui/tests/components/MarketplaceCard.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement `MarketplaceCard`**

Create `packages/dashboard/ui/src/components/MarketplaceCard.tsx`:

```tsx
interface MarketplaceItem {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  keywords?: string[];
}

interface MarketplaceCardProps {
  item: MarketplaceItem;
  onSelect: (item: MarketplaceItem) => void;
  onInstall: (item: MarketplaceItem) => void;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="marketplace-card-rating" title={`${rating.toFixed(1)} / 5`}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(empty)}
    </span>
  );
}

export function MarketplaceCard({ item, onSelect, onInstall }: MarketplaceCardProps) {
  return (
    <div className="marketplace-card glass-mid" onClick={() => onSelect(item)}>
      <div className="marketplace-card-header">
        <span className="marketplace-card-name">{item.name}</span>
        <span className="marketplace-card-version">v{item.version}</span>
      </div>
      <p className="marketplace-card-author">{item.author}</p>
      <p className="marketplace-card-desc">{item.description}</p>
      <div className="marketplace-card-footer">
        <span className="marketplace-card-stats">
          <StarRating rating={item.rating} />
          <span className="marketplace-card-downloads">↓ {item.downloads.toLocaleString()}</span>
        </span>
        <button
          className="marketplace-card-install"
          onClick={(e) => { e.stopPropagation(); onInstall(item); }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/dashboard/ui/tests/components/MarketplaceCard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/dashboard/ui/src/components/MarketplaceCard.tsx packages/dashboard/ui/tests/components/MarketplaceCard.test.tsx
git commit -m "feat(dashboard): add MarketplaceCard component"
```

---

### Task 13: Create `MarketplaceDetail` component

**Files:**
- Create: `packages/dashboard/ui/src/components/MarketplaceDetail.tsx`
- Create: `packages/dashboard/ui/tests/components/MarketplaceDetail.test.tsx`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarketplaceDetail } from '../../src/components/MarketplaceDetail.js';

describe('MarketplaceDetail', () => {
  const plugin = {
    name: 'weather-plugin',
    version: '1.2.0',
    description: 'Get real-time weather data for any location worldwide.',
    author: 'testuser',
    license: 'MIT',
    permissions: ['network'],
    keywords: ['weather', 'api'],
    downloads: 1234,
    rating: 4.2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-20T00:00:00Z',
  };

  it('renders full detail view', () => {
    render(<MarketplaceDetail item={plugin} onClose={() => {}} onInstall={() => {}} />);
    expect(screen.getByText('weather-plugin')).toBeTruthy();
    expect(screen.getByText(/v1\.2\.0/)).toBeTruthy();
    expect(screen.getByText(/testuser/)).toBeTruthy();
    expect(screen.getByText(/MIT/)).toBeTruthy();
    expect(screen.getByText(/network/)).toBeTruthy();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<MarketplaceDetail item={plugin} onClose={onClose} onInstall={() => {}} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onInstall when Install button clicked', () => {
    const onInstall = vi.fn();
    render(<MarketplaceDetail item={plugin} onClose={() => {}} onInstall={onInstall} />);
    fireEvent.click(screen.getByText('Install'));
    expect(onInstall).toHaveBeenCalledWith(plugin);
  });
});
```

**Step 2: Run test, verify fail. Step 3: Implement.**

Create `packages/dashboard/ui/src/components/MarketplaceDetail.tsx`:

```tsx
interface DetailItem {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  license?: string;
  permissions?: string[];
  keywords?: string[];
  createdAt?: string;
  updatedAt?: string;
  homepage?: string;
  repository?: string;
  preview?: string;
  tone?: { warmth: number; humor: number; formality: number };
}

interface MarketplaceDetailProps {
  item: DetailItem;
  onClose: () => void;
  onInstall: (item: DetailItem) => void;
}

export function MarketplaceDetail({ item, onClose, onInstall }: MarketplaceDetailProps) {
  return (
    <div className="marketplace-detail glass-mid">
      <div className="marketplace-detail-header">
        <div>
          <span className="marketplace-detail-name">{item.name}</span>
          <span className="marketplace-detail-version">v{item.version}</span>
        </div>
        <span className="marketplace-detail-author">by {item.author}</span>
      </div>

      <div className="marketplace-detail-stats">
        <span>{'★'.repeat(Math.floor(item.rating))}{'☆'.repeat(5 - Math.floor(item.rating))} ({item.rating.toFixed(1)})</span>
        <span>↓ {item.downloads.toLocaleString()} downloads</span>
      </div>

      <p className="marketplace-detail-desc">{item.description}</p>

      {item.preview && <p className="marketplace-detail-preview">{item.preview}</p>}

      {item.tone && (
        <div className="marketplace-detail-tone">
          <span>Warmth: {item.tone.warmth}</span>
          <span>Humor: {item.tone.humor}</span>
          <span>Formality: {item.tone.formality}</span>
        </div>
      )}

      <div className="marketplace-detail-meta">
        {item.permissions && item.permissions.length > 0 && (
          <div><strong>Permissions:</strong> {item.permissions.join(', ')}</div>
        )}
        {item.keywords && item.keywords.length > 0 && (
          <div><strong>Keywords:</strong> {item.keywords.join(', ')}</div>
        )}
        {item.license && <div><strong>License:</strong> {item.license}</div>}
      </div>

      <div className="marketplace-detail-actions">
        <button className="btn-primary" onClick={() => onInstall(item)}>Install</button>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify pass. Step 5: Commit.**

```bash
git add packages/dashboard/ui/src/components/MarketplaceDetail.tsx packages/dashboard/ui/tests/components/MarketplaceDetail.test.tsx
git commit -m "feat(dashboard): add MarketplaceDetail component"
```

---

### Task 14: Create `Marketplace` page component

**Files:**
- Create: `packages/dashboard/ui/src/pages/Marketplace.tsx`
- Create: `packages/dashboard/ui/tests/pages/Marketplace.test.tsx`

**Step 1: Write the failing test**

Test that the Marketplace page renders tabs, search input, and fetches plugins on mount. Mock the `api` module.

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Marketplace } from '../../src/pages/Marketplace.js';

vi.mock('../../src/api.js', () => ({
  api: {
    searchPlugins: vi.fn().mockResolvedValue({
      plugins: [
        { name: 'test-plugin', version: '1.0.0', description: 'A test', author: 'me', downloads: 100, rating: 4.0, keywords: [] },
      ],
      total: 1, limit: 20, offset: 0,
    }),
    searchPersonalities: vi.fn().mockResolvedValue({
      personalities: [
        { name: 'friendly', version: '1.0.0', description: 'Friendly', author: 'me', preview: 'Hi!', tone: { warmth: 8, humor: 5, formality: 3 }, downloads: 50, rating: 4.5, keywords: [] },
      ],
      total: 1, limit: 20, offset: 0,
    }),
    installPlugin: vi.fn().mockResolvedValue({ success: true, name: 'test-plugin', version: '1.0.0' }),
    installPersonality: vi.fn().mockResolvedValue({ success: true, name: 'friendly', version: '1.0.0' }),
    getPlugin: vi.fn(),
    getPersonality: vi.fn(),
  },
}));

describe('Marketplace', () => {
  it('renders Plugins tab by default and loads plugins', async () => {
    render(<Marketplace />);
    expect(screen.getByText('Plugins')).toBeTruthy();
    expect(screen.getByText('Personalities')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('test-plugin')).toBeTruthy());
  });

  it('switches to Personalities tab', async () => {
    render(<Marketplace />);
    fireEvent.click(screen.getByText('Personalities'));
    await waitFor(() => expect(screen.getByText('friendly')).toBeTruthy());
  });
});
```

**Step 2: Run test, verify fail. Step 3: Implement.**

Create `packages/dashboard/ui/src/pages/Marketplace.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { MarketplaceCard } from '../components/MarketplaceCard.js';
import { MarketplaceDetail } from '../components/MarketplaceDetail.js';

type Tab = 'plugins' | 'personalities';
type SortOption = 'downloads' | 'rating' | 'name' | 'updated';

export function Marketplace() {
  const [tab, setTab] = useState<Tab>('plugins');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('downloads');
  const [plugins, setPlugins] = useState<unknown[]>([]);
  const [personalities, setPersonalities] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(false);
  const limit = 18;

  const search = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'plugins') {
        const result = await api.searchPlugins({ q: query || undefined, sort, limit, offset });
        setPlugins(result.plugins);
        setTotal(result.total);
      } else {
        const result = await api.searchPersonalities({ q: query || undefined, sort, limit, offset });
        setPersonalities(result.personalities);
        setTotal(result.total);
      }
    } catch { /* error handled by fetchMarketplace */ }
    setLoading(false);
  }, [tab, query, sort, offset]);

  useEffect(() => { search(); }, [search]);

  const handleInstall = async (item: { name: string; version?: string }) => {
    try {
      if (tab === 'plugins') {
        await api.installPlugin(item.name, item.version);
      } else {
        await api.installPersonality(item.name, item.version);
      }
      search(); // refresh to update download counts
    } catch { /* error handled */ }
  };

  const items = tab === 'plugins' ? plugins : personalities;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="marketplace">
      <div className="marketplace-toolbar">
        <div className="marketplace-tabs">
          <button className={`marketplace-tab ${tab === 'plugins' ? 'active' : ''}`} onClick={() => { setTab('plugins'); setOffset(0); }}>Plugins</button>
          <button className={`marketplace-tab ${tab === 'personalities' ? 'active' : ''}`} onClick={() => { setTab('personalities'); setOffset(0); }}>Personalities</button>
        </div>
        <input
          className="marketplace-search"
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOffset(0); }}
        />
      </div>

      {loading ? (
        <div className="marketplace-loading">Loading...</div>
      ) : (
        <div className="marketplace-grid">
          {(items as Array<{ name: string; version: string; description: string; author: string; downloads: number; rating: number; keywords?: string[] }>).map((item) => (
            <MarketplaceCard key={item.name} item={item} onSelect={setSelected} onInstall={handleInstall} />
          ))}
          {items.length === 0 && <div className="marketplace-empty">No results found.</div>}
        </div>
      )}

      <div className="marketplace-footer">
        <select className="marketplace-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
          <option value="downloads">Downloads</option>
          <option value="rating">Rating</option>
          <option value="name">Name</option>
          <option value="updated">Recently Updated</option>
        </select>
        {totalPages > 1 && (
          <div className="marketplace-pagination">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}>Next</button>
          </div>
        )}
      </div>

      {selected && (
        <div className="marketplace-overlay" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <MarketplaceDetail item={selected as never} onClose={() => setSelected(null)} onInstall={handleInstall} />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify pass. Step 5: Commit.**

```bash
git add packages/dashboard/ui/src/pages/Marketplace.tsx packages/dashboard/ui/tests/pages/Marketplace.test.tsx
git commit -m "feat(dashboard): add Marketplace page component"
```

---

### Task 15: Add marketplace CSS styles

**Files:**
- Modify: `packages/dashboard/ui/src/styles/global.css`

Add marketplace styles at the end of `global.css`, following existing patterns (CSS variables, `glass-mid`, theme-aware):

```css
/* ── Marketplace ─────────────────────────── */

.marketplace { display: flex; flex-direction: column; height: 100%; padding: 1rem; gap: 1rem; }
.marketplace-toolbar { display: flex; align-items: center; gap: 1rem; }
.marketplace-tabs { display: flex; gap: 0.25rem; }
.marketplace-tab {
  padding: 0.5rem 1rem; border: none; background: transparent;
  color: var(--text-secondary); font-family: var(--font-body);
  font-size: 0.875rem; cursor: pointer; border-radius: var(--radius);
  transition: all var(--transition-fast);
}
.marketplace-tab.active { background: var(--accent); color: white; }
.marketplace-tab:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
.marketplace-search {
  flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-secondary);
  border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text-primary); font-family: var(--font-body); font-size: 0.875rem;
}
.marketplace-search:focus { outline: none; border-color: var(--accent); }
.marketplace-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem; flex: 1; overflow-y: auto;
}
.marketplace-card {
  padding: 1rem; border-radius: var(--radius-lg); cursor: pointer;
  border: 1px solid var(--border); transition: all var(--transition-base);
  display: flex; flex-direction: column; gap: 0.5rem;
}
.marketplace-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.marketplace-card-header { display: flex; align-items: baseline; gap: 0.5rem; }
.marketplace-card-name { font-family: var(--font-display); font-weight: 600; font-size: 0.95rem; color: var(--text-primary); }
.marketplace-card-version { font-size: 0.75rem; color: var(--text-secondary); }
.marketplace-card-author { font-size: 0.8rem; color: var(--text-secondary); }
.marketplace-card-desc { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; flex: 1; }
.marketplace-card-footer { display: flex; align-items: center; justify-content: space-between; }
.marketplace-card-stats { display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; }
.marketplace-card-rating { color: var(--warning); }
.marketplace-card-downloads { color: var(--text-secondary); }
.marketplace-card-install {
  padding: 0.35rem 0.75rem; border: none; background: var(--accent);
  color: white; border-radius: var(--radius); font-size: 0.75rem;
  cursor: pointer; transition: background var(--transition-fast);
}
.marketplace-card-install:hover { background: var(--accent-hover); }
.marketplace-footer { display: flex; align-items: center; justify-content: space-between; }
.marketplace-sort {
  padding: 0.35rem 0.5rem; background: var(--bg-secondary);
  border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text-primary); font-size: 0.8rem;
}
.marketplace-pagination { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary); }
.marketplace-pagination button {
  padding: 0.25rem 0.5rem; border: 1px solid var(--border);
  background: var(--bg-secondary); color: var(--text-primary);
  border-radius: var(--radius); cursor: pointer; font-size: 0.75rem;
}
.marketplace-pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
.marketplace-loading, .marketplace-empty { text-align: center; color: var(--text-secondary); padding: 3rem; }
.marketplace-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.marketplace-detail {
  padding: 1.5rem; border-radius: var(--radius-lg); max-width: 560px;
  width: 100%; border: 1px solid var(--border); display: flex;
  flex-direction: column; gap: 1rem;
}
.marketplace-detail-header { display: flex; flex-direction: column; gap: 0.25rem; }
.marketplace-detail-name { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--text-primary); }
.marketplace-detail-version { font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.5rem; }
.marketplace-detail-author { font-size: 0.85rem; color: var(--text-secondary); }
.marketplace-detail-stats { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--text-secondary); }
.marketplace-detail-desc { font-size: 0.9rem; color: var(--text-primary); line-height: 1.5; }
.marketplace-detail-preview { font-style: italic; color: var(--text-secondary); font-size: 0.85rem; }
.marketplace-detail-tone { display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-secondary); }
.marketplace-detail-meta { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; color: var(--text-secondary); }
.marketplace-detail-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
```

**Commit:**

```bash
git add packages/dashboard/ui/src/styles/global.css
git commit -m "feat(dashboard): add marketplace CSS styles"
```

---

### Task 16: Register Marketplace in DesktopShell

**Files:**
- Modify: `packages/dashboard/ui/src/components/DesktopShell.tsx:10-49`

**Step 1: Add import**

After the existing page imports (line 23), add:

```typescript
import { Marketplace } from '../pages/Marketplace.js';
```

**Step 2: Add to APPS array**

In the APPS array (line 34-49), add before the last entry or after `audit`:

```typescript
  { id: 'marketplace', label: 'Marketplace', icon: '\uD83C\uDFEA', component: () => <Marketplace />, defaultWidth: 900, defaultHeight: 640 },
```

(The emoji `🏪` is U+1F3EA, which is `\uD83C\uDFEA` in JS string escapes if needed — or just use the literal emoji to match the existing pattern.)

**Step 3: Verify build**

Run: `npx tsc --noEmit -p packages/dashboard/ui/tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/components/DesktopShell.tsx
git commit -m "feat(dashboard): register Marketplace app in DesktopShell"
```

---

### Task 17: Run full test suite

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass, including the new ones from Tasks 1-16.

**Step 2: Fix any failures**

If any tests fail, investigate and fix. Common issues:
- Import paths missing `.js` extension
- Mock patterns not matching existing test infrastructure
- CSS class mismatches in component tests using snapshot assertions

**Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve test failures from marketplace and group context features"
```
