# Multi-Chat System Design

## Goal

Add persistent, ChatGPT-style chat threads to Auxiora's dashboard. Users can create multiple named conversations that persist indefinitely (year+), switch between them, and manage them via a sidebar. Each thread is independent context; cross-thread search is a future enhancement.

## Architecture

Replace the sessions package's JSON file backend with SQLite (Node 22 built-in). The `SessionManager` gains chat-management methods while keeping its existing API for non-webchat channels. The dashboard gets a chat sidebar, new REST endpoints for CRUD, and the WebSocket protocol gains an optional `chatId` field.

## Data Model

### SQLite Schema

```sql
CREATE TABLE chats (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'webchat',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  metadata    TEXT
);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,
  tokens_in   INTEGER,
  tokens_out  INTEGER
);

CREATE INDEX idx_messages_chat_ts ON messages(chat_id, timestamp);
CREATE INDEX idx_chats_updated ON chats(updated_at DESC);
```

### TypeScript Types

```typescript
export interface Chat {
  id: string;
  title: string;
  channel: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  metadata?: Record<string, unknown>;
}
```

The existing `Session`, `Message`, `SessionConfig` types remain unchanged externally.

## SessionManager Changes

### New Methods

- `listChats(options?)` -- paginated chat list, ordered by updated_at DESC
- `createChat(title?)` -- create a new chat thread
- `renameChat(chatId, title)` -- update title
- `archiveChat(chatId)` -- soft-delete
- `deleteChat(chatId)` -- permanent delete (CASCADE)
- `generateTitle(chatId)` -- LLM-generated title after first exchange

### Storage Backend Swap

Constructor gains `dbPath` option (default `~/.auxiora/sessions/sessions.db`). All existing methods (`addMessage`, `getMessages`, `getContextMessages`, etc.) use SQLite internally. The in-memory Map cache stays for hot sessions.

### Auto-Migration

On first startup, `initialize()` detects existing `*.json` files, imports them into SQLite, moves originals to `sessions/migrated/` backup.

## WebSocket Protocol

Message payload gains optional `chatId`:

```typescript
// Send
{ type: 'message', id: '5', payload: { content: 'Hello', chatId: 'abc-123' } }

// New server events
{ type: 'chat_created', payload: { id: string, title: string } }
{ type: 'chat_titled', payload: { chatId: string, title: string } }
```

If `chatId` is omitted, runtime uses/creates a default chat (backward compatible).

## Dashboard API

```
GET    /api/v1/dashboard/chats                  -- list chats (paginated)
POST   /api/v1/dashboard/chats                  -- create new chat
GET    /api/v1/dashboard/chats/:id/messages     -- get messages
PATCH  /api/v1/dashboard/chats/:id              -- rename/archive
DELETE /api/v1/dashboard/chats/:id              -- permanent delete
```

Existing `GET /session/messages` stays for backward compat.

## Dashboard UI

### Chat Sidebar (left panel, collapsible)

- "New Chat" button at top
- Chat list ordered by most recent (title + relative timestamp)
- Active chat highlighted
- Context menu: rename, archive, delete
- Archived chats toggle at bottom

### Chat Area

Same as current -- messages, input, model selector, slash commands. Loads messages for the selected chat. WebSocket messages include `chatId`.

### State Management

`chatId` state in Chat.tsx. Switching chats fetches messages via API, updates WebSocket target.

## What Stays Unchanged

- Memory system (facts/preferences extraction)
- Non-webchat channels (email, telegram, behaviors)
- Mode detection, security floor, prompt assembly (work per-chat)
- Token context windowing (work per-chat)

## Storage Considerations

- SQLite handles year+ of history efficiently
- Messages indexed by (chat_id, timestamp) for fast pagination
- Chats indexed by updated_at for sidebar ordering
- No TTL expiration for webchat chats (only non-webchat channels expire)
