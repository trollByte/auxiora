# Remaining Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close out the Auxiora roadmap — memory editing, selective forgetting, data export, sqlite-vec persistence, memory provenance, Honest UX drill-down, and MCP server.

**Architecture:** Four batches of independent work. Batch 1 (small wins) adds REST endpoints for memory/personality data management + a dashboard editing UI. Batch 2 migrates the vector store to sqlite-vec for persistent ANN search and adds source provenance to memories. Batch 3 integrates a "Why did you say that?" provenance drill-down into every chat response. Batch 4 exposes Auxiora tools as an MCP server for external agents.

**Tech Stack:** TypeScript strict ESM, Node 22, vitest, React 19, better-sqlite3, @anthropic-ai/sdk (MCP), pnpm workspaces

---

## Batch 1: Personalization Completeness (Small Wins)

### Task 1: Memory Store REST API

Expose the internal MemoryStore via gateway routes so the dashboard can list, search, edit, and delete memories.

**Files:**
- Modify: `packages/runtime/src/index.ts` (add memory routes after existing vector routes)
- Test: `packages/runtime/src/__tests__/memory-api.test.ts`

**Step 1: Write the failing test**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMemoryStore = {
  getAll: vi.fn().mockResolvedValue([
    { id: 'mem-001', content: 'User prefers dark mode', category: 'preference', importance: 0.8, tags: ['ui'], createdAt: 1000, updatedAt: 1000, accessCount: 3, confidence: 0.9, source: 'explicit' },
  ]),
  search: vi.fn().mockResolvedValue([
    { id: 'mem-001', content: 'User prefers dark mode', category: 'preference', importance: 0.8, tags: ['ui'], createdAt: 1000, updatedAt: 1000, accessCount: 3, confidence: 0.9, source: 'explicit' },
  ]),
  remove: vi.fn().mockResolvedValue(true),
  update: vi.fn().mockResolvedValue({ id: 'mem-001', content: 'Updated', category: 'preference', importance: 0.9, tags: ['ui'], createdAt: 1000, updatedAt: 2000, accessCount: 3, confidence: 0.9, source: 'explicit' }),
  setImportance: vi.fn().mockResolvedValue(undefined),
  getByCategory: vi.fn().mockResolvedValue([]),
  exportAll: vi.fn().mockResolvedValue({ version: 1, memories: [], exportedAt: Date.now() }),
};

describe('Memory REST API', () => {
  it('GET /memories returns all memories', async () => {
    // Test the route handler returns memoryStore.getAll() result
  });
  it('GET /memories/search?q=dark returns search results', async () => {});
  it('DELETE /memories/:id removes a memory', async () => {});
  it('PATCH /memories/:id updates a memory', async () => {});
  it('GET /memories/export returns full export', async () => {});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/runtime/src/__tests__/memory-api.test.ts`
Expected: FAIL (routes don't exist yet)

**Step 3: Implement the memory routes**

Add to `packages/runtime/src/index.ts`, after the vector store routes section. The runtime already has `this.memoryStore` available. Add these routes to the existing personality router (they're personality-adjacent data):

```typescript
// --- Memory store ---

router.get('/memories', async (_req: any, res: any) => {
  if (!guard(_req, res)) return;
  if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
  const category = _req.query?.category as string | undefined;
  const data = category ? await this.memoryStore.getByCategory(category as any) : await this.memoryStore.getAll();
  res.json({ data });
});

router.get('/memories/search', async (req: any, res: any) => {
  if (!guard(req, res)) return;
  if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
  const q = req.query?.q as string;
  if (!q) { res.status(400).json({ error: 'Missing query parameter q' }); return; }
  const data = await this.memoryStore.search(q);
  res.json({ data });
});

router.get('/memories/export', async (_req: any, res: any) => {
  if (!guard(_req, res)) return;
  if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
  const data = await this.memoryStore.exportAll();
  res.json(data);
});

router.patch('/memories/:id', async (req: any, res: any) => {
  if (!guard(req, res)) return;
  if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
  const { content, importance, tags } = req.body ?? {};
  const updated = await this.memoryStore.update(req.params.id, { content, importance, tags });
  if (!updated) { res.status(404).json({ error: 'Memory not found' }); return; }
  res.json({ data: updated });
});

router.delete('/memories/:id', async (req: any, res: any) => {
  if (!guard(req, res)) return;
  if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
  const removed = await this.memoryStore.remove(req.params.id);
  if (!removed) { res.status(404).json({ error: 'Memory not found' }); return; }
  res.json({ success: true });
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/runtime/src/__tests__/memory-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/src/__tests__/memory-api.test.ts
git commit -m "feat(runtime): add memory store REST API endpoints"
```

---

### Task 2: Selective Forgetting API

Add a "forget about topic" endpoint that searches memories, decisions, feedback, and corrections for a topic and deletes matching entries.

**Files:**
- Modify: `packages/runtime/src/index.ts` (add forget route)
- Test: `packages/runtime/src/__tests__/forget-api.test.ts`

**Step 1: Write the failing test**

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

describe('POST /forget', () => {
  it('removes matching memories, decisions, feedback by topic', async () => {
    // Mock memoryStore.search(topic) -> returns 2 memories
    // Mock memoryStore.remove(id) called twice
    // Mock decisionLog.query({ search: topic }) -> returns 1 decision
    // Mock decisionLog.updateDecision(id, { status: 'abandoned' }) called once
    // Response: { removed: { memories: 2, decisions: 1 } }
  });
  it('returns 400 if topic is missing', async () => {});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/runtime/src/__tests__/forget-api.test.ts`

**Step 3: Implement the forget endpoint**

Add to the personality router in `packages/runtime/src/index.ts`:

```typescript
router.post('/forget', async (req: any, res: any) => {
  if (!guard(req, res)) return;
  const { topic } = req.body ?? {};
  if (!topic || typeof topic !== 'string') {
    res.status(400).json({ error: 'Missing required field: topic' });
    return;
  }

  const removed = { memories: 0, decisions: 0 };

  // Remove matching memories
  if (this.memoryStore) {
    const matches = await this.memoryStore.search(topic);
    for (const m of matches) {
      if (await this.memoryStore.remove(m.id)) removed.memories++;
    }
  }

  // Abandon matching decisions
  if (this.architect) {
    try {
      const decisions = this.architect.getDecisionLog().query({ search: topic });
      for (const d of decisions) {
        this.architect.getDecisionLog().updateDecision(d.id, { status: 'abandoned' as any });
        removed.decisions++;
      }
    } catch {}
  }

  res.json({ removed });
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/runtime/src/__tests__/forget-api.test.ts`

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/src/__tests__/forget-api.test.ts
git commit -m "feat(runtime): add selective forgetting endpoint"
```

---

### Task 3: Data Export Endpoint

Add a comprehensive personalization data export that bundles memories, decisions, preferences, feedback, and corrections into a single JSON download.

**Files:**
- Modify: `packages/runtime/src/index.ts` (add export route)
- Test: `packages/runtime/src/__tests__/export-api.test.ts`

**Step 1: Write the failing test**

```typescript
describe('GET /export/personalization', () => {
  it('returns bundled export of all personalization data', async () => {
    // Response includes: { version, exportedAt, memories, decisions, preferences, feedback, corrections, userModel }
  });
});
```

**Step 2-4: Implement and test**

Add route:
```typescript
router.get('/export/personalization', async (_req: any, res: any) => {
  if (!guard(_req, res)) return;
  const exportData: Record<string, unknown> = {
    version: 1,
    exportedAt: Date.now(),
  };

  if (this.memoryStore) {
    exportData.memories = await this.memoryStore.exportAll();
  }

  if (this.architect) {
    exportData.architect = JSON.parse(await this.architect.exportData());
    exportData.userModel = this.getCachedUserModel();
  }

  res.json(exportData);
});
```

**Step 5: Commit**

```bash
git commit -m "feat(runtime): add comprehensive personalization data export"
```

---

### Task 4: Memory Editing Dashboard Page

Extend the dashboard with a Memory Manager page that lists, searches, edits, and deletes memories, and provides selective forgetting + data export.

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts` (add memory API functions)
- Create: `packages/dashboard/ui/src/pages/MemoryManager.tsx`
- Create: `packages/dashboard/ui/tests/pages/MemoryManager.test.tsx`
- Modify: `packages/dashboard/ui/src/App.tsx` (add route)
- Modify: `packages/dashboard/ui/src/components/DesktopShell.tsx` (add app entry)
- Modify: `packages/dashboard/ui/src/styles/global.css` (add CSS)

**Step 1: Add API functions to api.ts**

Add before the `// Jobs` comment:
```typescript
// Memory management
getMemories: (category?: string) => {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return fetchApi<{ data: any[] }>(`/memories${qs}`);
},
searchMemories: (q: string) =>
  fetchApi<{ data: any[] }>(`/memories/search?q=${encodeURIComponent(q)}`),
deleteMemory: (id: string) =>
  fetchApi<{ success: boolean }>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
updateMemory: (id: string, updates: { content?: string; importance?: number; tags?: string[] }) =>
  fetchApi<{ data: any }>(`/memories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }),
exportMemories: () => fetchApi<any>('/memories/export'),
forgetTopic: (topic: string) =>
  fetchApi<{ removed: { memories: number; decisions: number } }>('/forget', {
    method: 'POST',
    body: JSON.stringify({ topic }),
  }),
exportPersonalization: () => fetchApi<any>('/export/personalization'),
```

**Step 2: Create MemoryManager.tsx**

A page with:
- Search bar at top
- Category filter dropdown (all, preference, fact, context, relationship, pattern, personality)
- Memory cards showing: content, category badge, importance bar, tags, timestamps
- Edit button on each card (inline editing of content, importance, tags)
- Delete button with confirmation
- "Forget Topic" section: text input + button that calls forgetTopic
- "Export All Data" button that downloads JSON

**Step 3: Write tests**

```typescript
// @vitest-environment jsdom
describe('MemoryManager', () => {
  it('renders memory cards after loading', async () => {});
  it('searches memories when query entered', async () => {});
  it('deletes memory when delete clicked', async () => {});
  it('shows forget topic input and calls API', async () => {});
  it('downloads export JSON', async () => {});
});
```

**Step 4: Register route and DesktopShell entry**

- App.tsx: `<Route path="memories" element={<MemoryManager />} />` inside DesktopShell
- DesktopShell.tsx: Add `{ id: 'memories', label: 'Memories', icon: '\u{1F9E0}', component: () => <MemoryManager />, defaultWidth: 820, defaultHeight: 600 }` after the 'profile' entry

**Step 5: Add CSS and commit**

```bash
git commit -m "feat(dashboard): add Memory Manager page with editing and selective forgetting"
```

---

## Batch 2: sqlite-vec + Memory Provenance (Medium Effort)

### Task 5: Migrate Vector Store to sqlite-vec

Replace the in-memory VectorStore with sqlite-vec for persistent approximate nearest neighbor search.

**Files:**
- Modify: `packages/vector-store/src/vector-store.ts`
- Modify: `packages/vector-store/src/types.ts` (add provenance fields)
- Test: `packages/vector-store/src/__tests__/sqlite-vec.test.ts`

**Step 1: Add sqlite-vec dependency**

```bash
cd packages/vector-store && pnpm add better-sqlite3 sqlite-vec
```

**Step 2: Write the failing test**

Test that vectors persist across instances by creating a store, adding entries, closing, reopening, and searching.

**Step 3: Implement SqliteVectorStore**

Create a new class `SqliteVecStore` that:
- Opens a SQLite database with `sqlite-vec` extension loaded
- Creates table: `vectors(id TEXT PRIMARY KEY, embedding FLOAT[N], content TEXT, metadata TEXT, source TEXT, created_at INTEGER)`
- Implements same interface as VectorStore (add, search, get, remove, update, size, clear)
- Uses `vec_distance_cosine()` for similarity search
- Falls back to in-memory VectorStore if sqlite-vec is unavailable

**Step 4: Wire into runtime**

Modify `packages/runtime/src/index.ts` to pass a db path when creating the vector store, defaulting to `$XDG_DATA_HOME/auxiora/vectors.db`.

**Step 5: Commit**

```bash
git commit -m "feat(vector-store): migrate to sqlite-vec for persistent ANN search"
```

---

### Task 6: Memory Provenance Tracking

Add source provenance to memory entries so users can see where each memory came from.

**Files:**
- Modify: `packages/memory/src/types.ts` (add provenance fields)
- Modify: `packages/memory/src/store.ts` (populate provenance on add)
- Test: `packages/memory/src/__tests__/provenance.test.ts`

**Step 1: Extend MemoryEntry type**

Add to MemoryEntry in `packages/memory/src/types.ts`:
```typescript
provenance?: {
  source: 'user-stated' | 'inferred' | 'tool-output' | 'correction';
  confidence: number;
  extractedFrom?: string; // message ID or tool name
  createdBy?: string; // channel/session ID
};
```

**Step 2: Write test**

Test that `add()` with provenance metadata stores and returns it, and that `getAll()` includes provenance.

**Step 3: Implement**

Update `MemoryStore.add()` to accept and store provenance. Update serialization to include provenance field. No schema migration needed (JSON file store, new field is optional).

**Step 4: Commit**

```bash
git commit -m "feat(memory): add provenance tracking to memory entries"
```

---

## Batch 3: Honest UX Full Deployment (Large)

### Task 7: "Why did you say that?" Provenance Button

Add a button to each assistant message that opens a detailed provenance panel showing exactly which memories, tools, and personality traits influenced the response.

**Files:**
- Create: `packages/dashboard/ui/src/components/ProvenancePanel.tsx`
- Create: `packages/dashboard/ui/tests/components/ProvenancePanel.test.tsx`
- Modify: `packages/dashboard/ui/src/pages/Chat.tsx` (add button per message)
- Modify: `packages/dashboard/ui/src/styles/global.css` (add CSS)

**Step 1: Create ProvenancePanel component**

A slide-out panel that shows:
- **Why this confidence level?** — Factors from TransparencyMeta.confidence.factors
- **What sources?** — Drill into each source with confidence scores
- **Which memories influenced this?** — List memories used during enrichment (from trace)
- **Which personality traits?** — Active traits with weights and evidence
- **Processing chain** — Visual pipeline: memory → mode → architect → self-awareness → model-identity

Props: `{ meta: TransparencyMeta; onClose: () => void }`

**Step 2: Write tests**

```typescript
describe('ProvenancePanel', () => {
  it('renders confidence factors', () => {});
  it('renders source attributions with icons', () => {});
  it('renders enrichment pipeline stages', () => {});
  it('calls onClose when close button clicked', () => {});
});
```

**Step 3: Wire into Chat.tsx**

Add a "Why?" button next to each assistant message's TransparencyFooter. Clicking opens the ProvenancePanel as a side panel or modal.

**Step 4: Add CSS and commit**

```bash
git commit -m "feat(dashboard): add 'Why did you say that?' provenance drill-down"
```

---

## Batch 4: MCP Server (Large)

### Task 8: MCP Server Package

Create a new package that exposes Auxiora's capabilities as MCP tools and resources, allowing external agents to use vault operations, memory search, session management, and personality queries.

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts` (main server)
- Create: `packages/mcp-server/src/tools.ts` (tool definitions)
- Create: `packages/mcp-server/src/resources.ts` (resource definitions)
- Create: `packages/mcp-server/src/__tests__/mcp-server.test.ts`
- Modify: `packages/runtime/src/index.ts` (optionally start MCP server as sidecar)

**Step 1: Scaffold package**

```json
{
  "name": "@auxiora/mcp-server",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

**Step 2: Define tools**

Expose these tools via MCP:
- `auxiora.memory.search` — Search memory store
- `auxiora.memory.add` — Add a memory
- `auxiora.session.send` — Send a message to a session
- `auxiora.personality.get` — Get current personality config
- `auxiora.decisions.query` — Query decision log
- `auxiora.user_model.get` — Get synthesized user model

**Step 3: Create MCP server using the SDK**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'auxiora', version: '1.0.0' });

  server.tool('memory_search', { query: z.string() }, async ({ query }) => {
    const results = await deps.memoryStore.search(query);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  });

  // ... more tools

  return server;
}
```

**Step 4: Write tests**

Test tool registration and basic request/response cycles using in-memory transport.

**Step 5: Wire into runtime**

Add optional MCP server startup in `packages/runtime/src/index.ts`:
```typescript
if (config.mcpServer?.enabled) {
  const mcpServer = createMcpServer({ memoryStore, architect, ... });
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
```

**Step 6: Commit**

```bash
git commit -m "feat(mcp-server): expose Auxiora capabilities as MCP tools"
```

---

## Execution Order

1. **Tasks 1-4** (Batch 1) — Can be parallelized: Tasks 1-3 are backend routes, Task 4 is dashboard UI
2. **Tasks 5-6** (Batch 2) — Sequential: Task 5 (sqlite-vec) then Task 6 (provenance)
3. **Task 7** (Batch 3) — Depends on TransparencyFooter (already done)
4. **Task 8** (Batch 4) — Independent, can run parallel with Batch 3

## Test Commands

```bash
# Individual task tests
npx vitest run packages/runtime/src/__tests__/memory-api.test.ts
npx vitest run packages/runtime/src/__tests__/forget-api.test.ts
npx vitest run packages/runtime/src/__tests__/export-api.test.ts
npx vitest run packages/dashboard/ui/tests/pages/MemoryManager.test.ts
npx vitest run packages/vector-store/src/__tests__/sqlite-vec.test.ts
npx vitest run packages/memory/src/__tests__/provenance.test.ts
npx vitest run packages/dashboard/ui/tests/components/ProvenancePanel.test.ts
npx vitest run packages/mcp-server/src/__tests__/mcp-server.test.ts

# Full suite
npx vitest run
```
