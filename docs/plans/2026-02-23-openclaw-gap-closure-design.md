# OpenClaw Gap Closure — Marketplace UI & Group Chat Awareness

**Date**: 2026-02-23
**Status**: Approved

## Context

Feature comparison against OpenClaw revealed two genuine gaps where OpenClaw wins:

1. **Community skill marketplace** — backend registry exists (SQLite, Fastify routes, client SDK) but no browsable web UI
2. **Group chat awareness** — group messages work across adapters but the bot has no concept of being in a group

Several other listed gaps (chat channels, multi-channel, desktop app, one-liner install) already exist in the codebase and the comparison table was outdated.

## Feature 1: Group Chat Awareness

### Approach

Lightweight group context injection — detect groups at the adapter layer, thread metadata through to enrichment, let the LLM naturally adapt. No shared group sessions (per-sender sessions remain).

### Changes

#### 1. Extend `InboundMessage` (`packages/channels/src/types.ts`)

Add optional group fields:

```typescript
groupContext?: {
  isGroup: boolean;
  groupName?: string;
  participantCount?: number;
};
```

#### 2. Populate in adapters (`packages/channels/src/adapters/`)

Each adapter that can detect groups fills `groupContext`:

| Adapter | Detection | Name | Count |
|---|---|---|---|
| Signal | `!!dataMessage.groupInfo` (already computed) | N/A (not in API) | N/A |
| Discord | `channel.type !== ChannelType.DM` | `channel.name` | `channel.memberCount` |
| Telegram | `chat.type === 'group' \|\| 'supergroup'` | `chat.title` | `getChatMemberCount()` |
| Slack | `!channel.is_im` | `channel.name` | N/A |
| Teams | `conversation.isGroup` | `conversation.name` | N/A |
| Matrix | `room.joined_members > 2` | room name from state | member count |
| WhatsApp | group detection from webhook payload | group subject | N/A |
| Others | Best-effort from platform API | Where available | Where available |

#### 3. Extend `EnrichmentContext` (`packages/runtime/src/enrichment/types.ts`)

```typescript
readonly groupContext?: {
  readonly isGroup: boolean;
  readonly groupName?: string;
  readonly participantCount?: number;
};
```

#### 4. Pass through in `handleChannelMessage` (`packages/runtime/src/index.ts`)

Populate `enrichCtx.groupContext` from `inbound.groupContext`.

#### 5. New `GroupContextStage` (order 150)

File: `packages/runtime/src/enrichment/group-context-stage.ts`

When `ctx.groupContext?.isGroup` is true, prepend a system instruction:

```
You are in a group chat called "{groupName}" with ~{participantCount} participants.
The current speaker is {senderName}. Address them by name.
Keep responses concise — group chats move fast.
```

Omit fields that are undefined (e.g., no participantCount on Signal).

## Feature 2: Marketplace UI

### Approach

Integrated dashboard app — a new floating window in the macOS-style DesktopShell, using existing patterns (React 19, vanilla CSS, `useApi`, glassmorphism cards).

### Architecture

#### Gateway Reverse Proxy

The marketplace runs as a separate Fastify sidecar on port 18801. The dashboard can only reach the gateway on 18800.

Add an Express middleware in `packages/gateway/src/server.ts` that proxies `/api/v1/marketplace/*` to `http://127.0.0.1:{marketplacePort}/api/v1/*`. The gateway's existing auth middleware protects these routes — no raw API keys exposed to the browser.

#### Dashboard API Layer

New functions in `packages/dashboard/ui/src/api.ts`:

```typescript
searchPlugins(params: { q?, author?, keywords?, sort?, limit?, offset? }): Promise<SearchResult>
getPlugin(name: string): Promise<PluginListing>
installPlugin(name: string, version?: string): Promise<InstallResult>
searchPersonalities(params: { q?, author?, sort?, limit?, offset? }): Promise<PersonalitySearchResult>
getPersonality(name: string): Promise<PersonalityListing>
installPersonality(name: string, version?: string): Promise<InstallResult>
```

Base path: `/api/v1/marketplace` (proxied through gateway).

#### Dashboard Components

| File | Purpose |
|---|---|
| `Marketplace.tsx` | Root — tab switcher (Plugins/Personalities), search bar, sort dropdown, paginated grid |
| `MarketplaceCard.tsx` | Card — name, author, description, download count, rating stars, install button |
| `MarketplaceDetail.tsx` | Detail overlay — full description, permissions, version, keywords, install/uninstall |

#### DesktopShell Registration

```typescript
{ id: 'marketplace', label: 'Marketplace', icon: '🏪',
  component: () => <Marketplace />, defaultWidth: 900, defaultHeight: 640 }
```

### UI Layout

Browse view: 3-column card grid with search bar and tab switcher at top, sort/pagination at bottom. Cards use `glass-mid` styling with theme-aware colors.

Detail overlay: triggered by clicking a card, shows full metadata with Install/Close actions.

### Styling

Vanilla CSS following existing patterns — CSS custom properties, `glass-mid` backdrop-filter, theme-compatible. No new CSS dependencies.

## Out of Scope

- Public-facing marketplace portal (future — standalone site for discovery without login)
- Shared group sessions / group memory (future — evolve to hybrid per-sender + group transcript)
- Ratings/reviews write endpoints (backend schema has columns, but no UI or API yet)
- Marketplace publish UI (publishers use CLI or direct API)

## Testing

- Group context: unit tests for each adapter's `groupContext` population, enrichment stage test, integration test with mock group message
- Marketplace UI: component tests for Marketplace, MarketplaceCard, MarketplaceDetail; API integration test for proxy route
