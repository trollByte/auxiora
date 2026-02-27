# OpenClaw-Inspired Features Design

**Date**: 2026-02-27
**Status**: Approved
**Context**: Analysis of OpenClaw (~/git/openclaw) revealed 6 high-value features Auxiora could adopt. Two already exist (ProfileRotator key rotation, mobile device node system). Two are partial (canvas package exists but no push transport, workflow approvals exist but not wired to tool execution). Two are missing entirely (OpenAI-compatible gateway endpoint, hybrid BM25+vector search).

---

## Feature 1: OpenAI-Compatible Chat Completions Endpoint

### Problem
Auxiora has no way for external tools (Cursor, Continue, Aider, custom apps) to use it as an AI backend. The only interface is the dashboard web UI and messaging channels.

### Design
New route file `packages/gateway/src/openai-compat-routes.ts` exposing `POST /v1/chat/completions` on the existing gateway port (18800).

**Request format**: Standard OpenAI Chat Completions API
- `messages`: array of `{role, content}` objects
- `model`: `"auxiora"` (uses primary provider), `"auxiora:openai/gpt-4o"` (routes to specific provider/model)
- `stream`: boolean (SSE when true)
- `temperature`, `max_tokens`, `tools`: passed through to provider
- `user`: optional string for persistent session key

**Response format**: Standard OpenAI response with `id`, `object`, `created`, `model`, `choices`, `usage`.

**Auth**: Bearer token via `Authorization` header. Token stored in vault as `OPENAI_COMPAT_TOKEN` or reuses existing gateway auth.

**Pipeline**: Request → enrichment pipeline → model router → provider → stream/complete → response. Same pipeline as dashboard chat, ensuring personality, memory, and all enrichment stages apply.

**Scope**: ~200 lines. No new packages.

---

## Feature 2: Hybrid BM25+Vector Memory Search

### Problem
`SqliteVecStore` only supports vector cosine similarity search. Exact keyword queries (error messages, function names, code identifiers) get poor results because semantic embeddings don't capture lexical matches well.

### Design
Add SQLite FTS5 full-text search alongside the existing vector table in `SqliteVecStore`.

**Schema addition**:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content_rowid=id
);
```

**Upsert**: On every `upsert()`, insert content into both the vector table and the FTS5 table.

**Search modes** (new `searchMode` option):
- `'vector'` — existing behavior (cosine similarity only)
- `'keyword'` — FTS5 MATCH with BM25 ranking only
- `'hybrid'` (default) — both, merged via Reciprocal Rank Fusion

**Hybrid merge algorithm** (Reciprocal Rank Fusion):
```
score(doc) = 1/(k + rank_vector) + 1/(k + rank_fts)
```
where k=60. Results deduplicated by ID, sorted by combined score.

**Backward compatible**: Existing `search()` method unchanged. New `hybridSearch()` method added. Callers opt in.

**Scope**: ~150 lines added to `packages/vector-store/src/sqlite-vec-store.ts`. No new packages.

---

## Feature 3: Live Canvas Push Transport

### Problem
The `@auxiora/canvas` package defines sessions, objects, widgets, and events — but there's no real-time delivery path from agent to dashboard. The canvas is inert.

### Design
WebSocket-based live push from gateway to dashboard viewers.

**Gateway routes** (`packages/gateway/src/canvas-routes.ts`):
- `GET /api/v1/canvas/:sessionId/ws` — WebSocket upgrade for live event streaming
- `GET /api/v1/canvas/sessions` — list active canvas sessions
- `POST /api/v1/canvas/:sessionId/push` — HTTP fallback for agent to push content

**Connection management**: Gateway maintains `Map<sessionId, Set<WebSocket>>` for connected viewers. On canvas event (object added/updated/removed, widget interaction), broadcast JSON frame to all connected clients.

**Dashboard component** (`packages/dashboard/ui/src/pages/LiveCanvas.tsx`):
- Connects to canvas WebSocket on window open
- Renders pushed content: text blocks, images, markdown, interactive widgets
- Reconnects on disconnect with exponential backoff
- Shows connection status indicator

**Agent usage**: Agent calls canvas tools during conversation → gateway broadcasts to viewers. Use cases: status dashboards, code previews, data visualizations, rich multi-modal responses.

**DesktopShell**: New APPS entry `{ id: 'canvas', label: 'Canvas', icon: '🎨' }`.

**Scope**: ~300 lines gateway routes, ~200 lines dashboard component. Builds on existing `@auxiora/canvas` package.

---

## Feature 4: Tool Execution Approval Flow

### Problem
The existing `ApprovalRequest` system in `@auxiora/workflows` handles workflow-level approvals, but isn't wired into the tool sandbox. When the agent wants to execute a shell command or modify files, there's no interactive approval mechanism.

### Design
Wire workflow approvals into the tool execution path with real-time UI.

**Tool sandbox integration** (in `packages/runtime/`):
- Tools tagged `requiresApproval: true` (configurable list: `exec`, `file_write`, `browser_navigate`, etc.)
- Before execution: create `ApprovalRequest` with tool name, arguments, requesting context
- Emit `tool:approval_requested` event
- Wait for resolution (configurable timeout, default 5 minutes)
- On approval → execute. On rejection/timeout → return error to agent with reason.

**Gateway routes**:
- `GET /api/v1/approvals/pending` — list pending approval requests
- `POST /api/v1/approvals/:id/resolve` — approve or deny (body: `{approved: boolean, comment?: string}`)

**Dashboard component** (`packages/dashboard/ui/src/components/ApprovalBanner.tsx`):
- Polls `/api/v1/approvals/pending` (or receives via existing polling)
- Shows banner/modal when approval is pending: tool name, arguments, context
- Approve/Deny buttons with optional comment
- Auto-dismisses on resolution or timeout

**Channel delivery**: Pending approvals sent as a message to the active channel (WhatsApp, Discord, etc.). User can reply with "approve" or "deny" for hands-free approval.

**Scope**: ~100 lines sandbox integration, ~80 lines gateway routes, ~100 lines dashboard component.

---

## Implementation Order

### Phase 1: Search (highest standalone value)
1. Hybrid BM25+Vector search in SqliteVecStore

### Phase 2: API Surface
2. OpenAI-compatible Chat Completions endpoint

### Phase 3: Interactivity
3. Live Canvas push transport
4. Tool execution approval flow

Phase 1 and 2 are independent. Phase 3 features are independent of each other but lower priority.

---

## What Already Exists (No Work Needed)

- **Provider key rotation**: `ProfileRotator` in `packages/providers/src/profile-rotator.ts` — round-robin with cooldown
- **Device node system**: `packages/mobile/src/node.ts` — camera, screen, location, notifications contract
