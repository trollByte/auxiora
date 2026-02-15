# Multi-Chat System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the sessions package's JSON backend with SQLite and add ChatGPT-style persistent chat threads to the dashboard.

**Architecture:** The `SessionManager` in `packages/sessions` swaps its JSON file persistence for Node 22's built-in `node:sqlite` (`DatabaseSync`). New chat-management methods are added. The dashboard gains REST endpoints for chat CRUD and a sidebar UI for thread management. The WebSocket protocol adds an optional `chatId` field. Auto-migration imports existing JSON sessions on first startup.

**Tech Stack:** Node 22 `node:sqlite` (DatabaseSync), TypeScript strict ESM, vitest, React

---

### Task 1: Add Chat type and update SessionConfig

**Files:**
- Modify: `packages/sessions/src/types.ts`
- Modify: `packages/sessions/src/index.ts`

**Step 1: Add new types to types.ts**

Add the `Chat` interface and `ListChatsOptions` after the existing types. Add `dbPath?: string` to `SessionConfig`.

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

export interface ListChatsOptions {
  archived?: boolean;
  limit?: number;
  offset?: number;
}
```

Add `dbPath?: string` to `SessionConfig`:

```typescript
export interface SessionConfig {
  maxContextTokens: number;
  ttlMinutes: number;
  autoSave: boolean;
  compactionEnabled: boolean;
  dbPath?: string;
}
```

**Step 2: Update the index.ts exports**

Add `Chat` and `ListChatsOptions` to the type export in `packages/sessions/src/index.ts`.

**Step 3: Commit**

Commit message: `feat(sessions): add Chat type and ListChatsOptions`

---

### Task 2: Create SQLite database layer

**Files:**
- Create: `packages/sessions/src/db.ts`
- Create: `packages/sessions/tests/db.test.ts`
- Modify: `packages/sessions/src/index.ts`

**Context:** Node 22's `node:sqlite` provides `DatabaseSync` -- a synchronous SQLite API. Key methods:
- `new DatabaseSync(path)` -- open/create DB file
- `db.exec(sql)` -- execute raw SQL (DDL)
- `db.prepare(sql)` -- create a prepared statement
- `stmt.run(...params)` -- execute with params, returns `{ changes, lastInsertRowid }`
- `stmt.get(...params)` -- return one row as `{ col: val }` object (or undefined)
- `stmt.all(...params)` -- return all rows as array of objects
- `db.close()` -- close the database

All methods are synchronous. Import: `import { DatabaseSync } from 'node:sqlite';`

**Step 1: Write failing tests**

Create `packages/sessions/tests/db.test.ts` with tests for:
- `createChat` -- creates a chat, returns Chat object
- `listChats` -- ordered by updatedAt DESC, filters archived by default
- `listChats({ archived: true })` -- includes archived
- `renameChat` -- updates title
- `deleteChat` -- removes chat and its messages (CASCADE)
- `listChats` with pagination (limit/offset)
- `addMessage` + `getMessages` -- stores and retrieves messages in order
- `addMessage` with token counts
- `addMessage` updates chat's updatedAt
- `getContextMessages` -- returns most recent messages within token budget
- `getOrCreateSessionChat` -- finds by sender+channel or creates new

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionDatabase } from '../src/db.js';

const testDir = path.join(os.tmpdir(), 'auxiora-db-test-' + Date.now());
const dbPath = path.join(testDir, 'test.db');

describe('SessionDatabase', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    db = new SessionDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('chats', () => {
    it('should create a chat', () => {
      const chat = db.createChat('Test Chat', 'webchat');
      expect(chat.id).toBeDefined();
      expect(chat.title).toBe('Test Chat');
      expect(chat.channel).toBe('webchat');
      expect(chat.archived).toBe(false);
    });

    it('should list chats ordered by updatedAt descending', () => {
      const chat1 = db.createChat('First', 'webchat');
      const chat2 = db.createChat('Second', 'webchat');
      db.addMessage(chat1.id, 'msg-1', 'user', 'hello', Date.now() + 1000);

      const chats = db.listChats();
      expect(chats).toHaveLength(2);
      expect(chats[0].id).toBe(chat1.id);
    });

    it('should filter out archived chats by default', () => {
      db.createChat('Active', 'webchat');
      const archived = db.createChat('Archived', 'webchat');
      db.archiveChat(archived.id);

      const chats = db.listChats();
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe('Active');
    });

    it('should include archived chats when requested', () => {
      db.createChat('Active', 'webchat');
      const archived = db.createChat('Archived', 'webchat');
      db.archiveChat(archived.id);

      const chats = db.listChats({ archived: true });
      expect(chats).toHaveLength(2);
    });

    it('should rename a chat', () => {
      const chat = db.createChat('Old Name', 'webchat');
      db.renameChat(chat.id, 'New Name');
      const updated = db.getChat(chat.id);
      expect(updated?.title).toBe('New Name');
    });

    it('should delete a chat and its messages', () => {
      const chat = db.createChat('To Delete', 'webchat');
      db.addMessage(chat.id, 'msg-1', 'user', 'hello', Date.now());
      db.deleteChat(chat.id);
      expect(db.getChat(chat.id)).toBeUndefined();
      expect(db.getMessages(chat.id)).toEqual([]);
    });

    it('should support pagination', () => {
      for (let i = 0; i < 5; i++) {
        db.createChat(`Chat ${i}`, 'webchat');
      }
      const page1 = db.listChats({ limit: 2 });
      expect(page1).toHaveLength(2);
      const page2 = db.listChats({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      const page3 = db.listChats({ limit: 2, offset: 4 });
      expect(page3).toHaveLength(1);
    });
  });

  describe('messages', () => {
    it('should add and retrieve messages', () => {
      const chat = db.createChat('Test', 'webchat');
      db.addMessage(chat.id, 'msg-1', 'user', 'Hello', 1000);
      db.addMessage(chat.id, 'msg-2', 'assistant', 'Hi there', 2000);

      const messages = db.getMessages(chat.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].role).toBe('assistant');
    });

    it('should store token counts', () => {
      const chat = db.createChat('Test', 'webchat');
      db.addMessage(chat.id, 'msg-1', 'assistant', 'response', 1000, 100, 50);
      const messages = db.getMessages(chat.id);
      expect(messages[0].tokens).toEqual({ input: 100, output: 50 });
    });

    it('should update chat updatedAt when adding messages', () => {
      const chat = db.createChat('Test', 'webchat');
      const originalUpdatedAt = chat.updatedAt;
      db.addMessage(chat.id, 'msg-1', 'user', 'Hello', originalUpdatedAt + 5000);
      const updated = db.getChat(chat.id);
      expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });

    it('should get context messages within token budget', () => {
      const chat = db.createChat('Test', 'webchat');
      for (let i = 0; i < 20; i++) {
        db.addMessage(chat.id, `msg-${i}`, 'user', 'x'.repeat(100), i * 1000);
      }
      const context = db.getContextMessages(chat.id, 100);
      expect(context.length).toBeLessThan(20);
      expect(context.length).toBeGreaterThan(0);
      expect(context[context.length - 1].id).toBe('msg-19');
    });
  });

  describe('session compatibility', () => {
    it('should get or create a session-style chat by sender+channel', () => {
      const chat1 = db.getOrCreateSessionChat('user123', 'telegram');
      expect(chat1.id).toBeDefined();
      const chat2 = db.getOrCreateSessionChat('user123', 'telegram');
      expect(chat2.id).toBe(chat1.id);
      const chat3 = db.getOrCreateSessionChat('user456', 'telegram');
      expect(chat3.id).not.toBe(chat1.id);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C packages/sessions vitest run tests/db.test.ts`
Expected: FAIL -- `SessionDatabase` does not exist

**Step 3: Implement SessionDatabase**

Create `packages/sessions/src/db.ts`:

```typescript
import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import type { Message, Chat, ListChatsOptions } from './types.js';

function generateId(): string {
  return crypto.randomUUID();
}

export class SessionDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        channel     TEXT NOT NULL DEFAULT 'webchat',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        archived    INTEGER NOT NULL DEFAULT 0,
        metadata    TEXT,
        sender_id   TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        tokens_in   INTEGER,
        tokens_out  INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chats_sender ON chats(sender_id, channel);
    `);
  }

  createChat(title: string, channel: string, senderId?: string): Chat {
    const id = generateId();
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO chats (id, title, channel, created_at, updated_at, sender_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, title, channel, now, now, senderId ?? null);
    return { id, title, channel, createdAt: now, updatedAt: now, archived: false };
  }

  getChat(id: string): Chat | undefined {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as any;
    return row ? this.rowToChat(row) : undefined;
  }

  listChats(options?: ListChatsOptions): Chat[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    if (options?.archived) {
      return (this.db.prepare('SELECT * FROM chats ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[]).map(r => this.rowToChat(r));
    }
    return (this.db.prepare('SELECT * FROM chats WHERE archived = 0 ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[]).map(r => this.rowToChat(r));
  }

  renameChat(id: string, title: string): void {
    this.db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
  }

  archiveChat(id: string): void {
    this.db.prepare('UPDATE chats SET archived = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  }

  deleteChat(id: string): void {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  }

  addMessage(chatId: string, msgId: string, role: string, content: string, timestamp: number, tokensIn?: number, tokensOut?: number): void {
    this.db.prepare(
      'INSERT INTO messages (id, chat_id, role, content, timestamp, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(msgId, chatId, role, content, timestamp, tokensIn ?? null, tokensOut ?? null);
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(timestamp, chatId);
  }

  getMessages(chatId: string): Message[] {
    return (this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC').all(chatId) as any[]).map(r => this.rowToMessage(r));
  }

  getContextMessages(chatId: string, maxTokens: number): Message[] {
    const rows = this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC').all(chatId) as any[];
    const messages: Message[] = [];
    let tokenCount = 0;
    for (const row of rows) {
      const msg = this.rowToMessage(row);
      const msgTokens = Math.ceil(msg.content.length / 4);
      if (tokenCount + msgTokens > maxTokens) break;
      messages.unshift(msg);
      tokenCount += msgTokens;
    }
    return messages;
  }

  clearMessages(chatId: string): void {
    this.db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), chatId);
  }

  getOrCreateSessionChat(senderId: string, channel: string): Chat {
    const row = this.db.prepare('SELECT * FROM chats WHERE sender_id = ? AND channel = ? ORDER BY updated_at DESC LIMIT 1').get(senderId, channel) as any;
    if (row) {
      this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), row.id);
      return this.rowToChat(row);
    }
    return this.createChat(`${channel} session`, channel, senderId);
  }

  insertChatWithId(id: string, title: string, channel: string, createdAt: number, updatedAt: number, senderId?: string): void {
    this.db.prepare(
      'INSERT INTO chats (id, title, channel, created_at, updated_at, sender_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, title, channel, createdAt, updatedAt, senderId ?? null);
  }

  private rowToChat(row: any): Chat {
    return {
      id: row.id, title: row.title, channel: row.channel,
      createdAt: row.created_at, updatedAt: row.updated_at,
      archived: row.archived === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToMessage(row: any): Message {
    return {
      id: row.id, role: row.role, content: row.content, timestamp: row.timestamp,
      tokens: (row.tokens_in != null || row.tokens_out != null)
        ? { input: row.tokens_in ?? undefined, output: row.tokens_out ?? undefined }
        : undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/sessions/src/index.ts`:
```typescript
export { SessionDatabase } from './db.js';
```

**Step 5: Run tests**

Run: `pnpm -C packages/sessions vitest run tests/db.test.ts`
Expected: ALL PASS

**Step 6: Commit**

Commit message: `feat(sessions): add SQLite database layer for chat persistence`

---

### Task 3: Rewrite SessionManager to use SQLite

**Files:**
- Modify: `packages/sessions/src/manager.ts`
- Modify: `packages/sessions/tests/sessions.test.ts`

**Context:** Replace JSON file I/O with `SessionDatabase`. Keep existing public API. Add new chat-management methods. Key changes:
- Constructor creates `SessionDatabase` from `config.dbPath` or `getSessionsDir() + '/sessions.db'`
- `create()` creates a DB chat row, wraps in Session, caches in Map
- `addMessage()` writes to both in-memory Session and DB
- `getOrCreate()` checks DB via `getOrCreateSessionChat`
- `get()` loads from DB instead of JSON
- New: `createChat`, `listChats`, `renameChat`, `archiveChat`, `deleteChat`, `getChatMessages`
- Remove: `saveQueue`, JSON file reads/writes (the `save()` method becomes a no-op)

**Step 1: Update existing tests**

Rewrite `packages/sessions/tests/sessions.test.ts`:
- Change setup to use `dbPath: path.join(testDir, 'sessions.db')` in config
- Remove JSON file existence assertions
- Add tests for `createChat`, `listChats`, `renameChat`, `archiveChat`, `deleteChat`, `getChatMessages`
- Use synchronous `fs.mkdirSync` / `fs.rmSync` in setup/teardown (no need for async)

**Step 2: Run tests to verify they fail**

Run: `pnpm -C packages/sessions vitest run tests/sessions.test.ts`
Expected: FAIL

**Step 3: Rewrite SessionManager**

Rewrite `packages/sessions/src/manager.ts` to use `SessionDatabase` internally. See the design doc for the full implementation. Key architectural points:
- The in-memory `Map<string, Session>` stays as a hot cache
- DB writes happen immediately in `addMessage` (no save queue)
- `cleanupExpired` only evicts from the in-memory Map, not from SQLite (webchat chats persist forever)
- New methods (`createChat`, `listChats`, etc.) delegate directly to `SessionDatabase`

**Step 4: Run all session tests**

Run: `pnpm -C packages/sessions vitest run`
Expected: ALL PASS

**Step 5: Commit**

Commit message: `feat(sessions): rewrite SessionManager to use SQLite backend`

---

### Task 4: JSON-to-SQLite migration

**Files:**
- Modify: `packages/sessions/src/manager.ts` (the `initialize` method)
- Create: `packages/sessions/tests/migration.test.ts`

**Context:** Users upgrading will have `*.json` files in `~/.auxiora/sessions/`. On first startup, `initialize()` detects them, imports into SQLite, moves originals to `migrated/` subfolder.

**Step 1: Write failing test**

Create `packages/sessions/tests/migration.test.ts`:
- Write a fake JSON session file to temp dir
- Create SessionManager with `dbPath` pointing to same temp dir
- Call `initialize()`
- Verify: session loads from SQLite with correct messages
- Verify: JSON file moved to `migrated/` subfolder
- Verify: no-op when no JSON files exist

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/sessions vitest run tests/migration.test.ts`
Expected: FAIL

**Step 3: Implement migration**

Add a `sessionsDir` field to `SessionManager`. In `initialize()`:
1. Read `this.sessionsDir` for `*.json` files
2. For each: parse JSON, insert chat with original ID via `db.insertChatWithId()`, insert all messages, move file to `migrated/`
3. Wrap each file in try/catch to skip corrupt files

**Step 4: Run tests**

Run: `pnpm -C packages/sessions vitest run`
Expected: ALL PASS

**Step 5: Commit**

Commit message: `feat(sessions): auto-migrate JSON session files to SQLite`

---

### Task 5: Dashboard REST API for chat management

**Files:**
- Modify: `packages/dashboard/src/types.ts`
- Modify: `packages/dashboard/src/router.ts`
- Modify: `packages/runtime/src/index.ts`

**Step 1: Update DashboardDeps type**

In `packages/dashboard/src/types.ts`, expand the `sessions` field to include `listChats`, `createChat`, `renameChat`, `archiveChat`, `deleteChat`, `getChatMessages`.

**Step 2: Add chat endpoints in router.ts**

Add after the existing `GET /session/messages` block (line ~608):
- `GET /chats` -- list chats (filters archived, returns `{ data, total }`)
- `POST /chats` -- create new chat (body: `{ title? }`)
- `GET /chats/:id/messages` -- get messages (filters user/assistant only)
- `PATCH /chats/:id` -- rename (`{ title }`) or archive (`{ archived: true }`)
- `DELETE /chats/:id` -- permanent delete

**Step 3: Wire in the runtime**

In `packages/runtime/src/index.ts`, expand the `sessions` block in the dashboard deps object (line ~641) to delegate `listChats`, `createChat`, `renameChat`, `archiveChat`, `deleteChat`, `getChatMessages` to `this.sessions`.

**Step 4: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 5: Commit**

Commit message: `feat(dashboard): add chat CRUD REST API endpoints`

---

### Task 6: WebSocket chatId support

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Context:** `handleMessage` (line 1481) currently creates sessions by `client.id`. Add optional `chatId` from payload. If provided, load that chat directly. If not, keep current behavior (backward compat).

**Step 1: Update handleMessage**

1. Add `chatId?: string` to the payload type
2. Extract `chatId` from payload
3. If `chatId` provided: `this.sessions.get(chatId)`, create if missing, send `chat_created` event
4. If not provided: use existing `getOrCreate(client.id, ...)` logic

**Step 2: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

Commit message: `feat(runtime): support chatId in WebSocket messages for multi-chat`

---

### Task 7: Frontend API client for chat management

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts`

**Step 1: Add chat API methods to the `api` object**

- `getChats(archived?)` -- `GET /chats`
- `createNewChat(title?)` -- `POST /chats`
- `getChatMessages(chatId)` -- `GET /chats/:id/messages`
- `renameChat(chatId, title)` -- `PATCH /chats/:id`
- `archiveChat(chatId)` -- `PATCH /chats/:id` with `{ archived: true }`
- `deleteChatThread(chatId)` -- `DELETE /chats/:id`

**Step 2: Build the dashboard UI**

Run: `npx vite build --outDir ../dist-ui --emptyOutDir` from `packages/dashboard/ui/`

**Step 3: Commit**

Commit message: `feat(dashboard): add frontend API client for chat thread management`

---

### Task 8: Chat sidebar UI component

**Files:**
- Modify: `packages/dashboard/ui/src/pages/Chat.tsx`

**Context:** The current `Chat.tsx` is a single-pane chat view. Add a sidebar on the left with chat thread list, new chat button, rename/delete via context menu.

**Key changes:**
1. Add state: `chatId`, `chats` array, `sidebarOpen`, `editingChatId`, `contextMenu`
2. Load chat list on mount via `api.getChats()`
3. Load messages when `chatId` changes via `api.getChatMessages(chatId)`
4. Remove old `api.getSessionMessages()` on-mount call
5. "New Chat" button creates chat, switches to it
6. WebSocket `send` includes `chatId` in payload
7. Handle `chat_titled` WebSocket event to update sidebar
8. Right-click context menu for rename/delete
9. Inline rename input on click
10. Add `formatRelativeTime` utility
11. Wrap layout in flex container: sidebar + chat area

**Step 1: Rewrite Chat.tsx**

Major structural changes -- the component gains a `chat-layout` flex wrapper containing `chat-sidebar` + existing `chat-container`.

**Step 2: Build**

Run: `npx vite build --outDir ../dist-ui --emptyOutDir` from `packages/dashboard/ui/`

**Step 3: Commit**

Commit message: `feat(dashboard): add chat sidebar with thread management`

---

### Task 9: CSS for chat sidebar

**Files:**
- Find: the CSS file containing `.chat-container` styles (search `packages/dashboard/ui/src/`)

**Step 1: Find the CSS file**

Search for `.chat-container` in `packages/dashboard/ui/src/**/*.css`.

**Step 2: Add sidebar styles**

Use existing CSS variables (`--bg-surface`, `--text-primary`, `--border`, `--accent`, `--radius`). Key classes:
- `.chat-layout` -- flex, full height
- `.chat-sidebar` / `.chat-sidebar.closed` -- 260px width, collapsible
- `.chat-sidebar-header` -- sticky, contains new chat button
- `.chat-sidebar-item` / `.active` -- list items with hover/active
- `.chat-context-menu` -- fixed-position floating menu
- `.new-chat-btn` -- dashed border, full width
- `.chat-rename-input` -- inline text input
- `.chat-layout .chat-container` -- `flex: 1; min-width: 0;`

**Step 3: Build**

Run: `npx vite build --outDir ../dist-ui --emptyOutDir` from `packages/dashboard/ui/`

**Step 4: Commit**

Commit message: `style(dashboard): add chat sidebar and context menu styles`

---

### Task 10: Auto-title generation

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Context:** After the first assistant response in a webchat chat titled "New Chat", make a lightweight LLM call to generate a 3-6 word title.

**Step 1: Add auto-title logic**

After assistant message is saved in `handleMessage`:
1. Check if this is a webchat chat with <= 3 messages and title "New Chat"
2. If so, call `generateChatTitle()` (fire-and-forget, non-fatal)
3. `generateChatTitle` uses the primary provider with a short prompt: "Generate a very short title (3-6 words, no quotes) for this conversation"
4. On success, call `this.sessions.renameChat(chatId, title)` and send `chat_titled` WebSocket event

**Step 2: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

Commit message: `feat(runtime): auto-generate chat titles after first exchange`

---

### Task 11: Integration test and Docker rebuild

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS. Fix any failures (common: existing tests need `dbPath` in config, runtime tests need mocks for new session methods).

**Step 2: Build dashboard UI**

Run: `npx vite build --outDir ../dist-ui --emptyOutDir` from `packages/dashboard/ui/`

**Step 3: Rebuild Docker image**

Run: `docker compose -f deploy/docker/docker-compose.yml build`

**Step 4: Manual end-to-end test**

1. Start container, open dashboard
2. Verify chat sidebar appears
3. Create new chat, send message, verify auto-title
4. Create second chat, verify switching loads different messages
5. Right-click rename, delete
6. Refresh page -- chats persist

**Step 5: Commit built assets and any fixes**

Commit message: `build(dashboard): rebuild UI with multi-chat sidebar`
