# OpenClaw-Inspired Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four features inspired by OpenClaw: OpenAI-compatible chat endpoint, hybrid BM25+vector search, live canvas WebSocket transport, and tool execution approval flow.

**Architecture:** Each feature is self-contained. Feature 1 adds a gateway route that proxies through the enrichment pipeline. Feature 2 adds FTS5 to the existing SqliteVecStore. Feature 3 adds WebSocket upgrade to the existing canvas REST API. Feature 4 wires the existing ApprovalManager into tool invocations with a dashboard UI.

**Tech Stack:** TypeScript strict ESM, Express 5, node:sqlite (WAL + FTS5), ws (WebSocket), vitest, React

---

## Phase 1: Hybrid BM25+Vector Search

### Task 1: Add FTS5 schema and insert path

**Files:**
- Modify: `packages/vector-store/src/sqlite-vec-store.ts`
- Test: `packages/vector-store/tests/sqlite-vec-store.test.ts`

**Step 1: Write the failing test**

In `packages/vector-store/tests/sqlite-vec-store.test.ts`, add:

```typescript
describe('FTS5 keyword search', () => {
  it('should find entries by exact keyword match', () => {
    const store = new SqliteVecStore({ dbPath: ':memory:', dimensions: 3 });
    store.add('doc1', [1, 0, 0], 'TypeError: Cannot read property foo of undefined');
    store.add('doc2', [0, 1, 0], 'The weather is sunny today');
    store.add('doc3', [0, 0, 1], 'TypeError: foo is not a function');

    const results = store.keywordSearch('TypeError foo', 10);
    expect(results.length).toBe(2);
    expect(results.map(r => r.id)).toContain('doc1');
    expect(results.map(r => r.id)).toContain('doc3');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/vector-store/tests/sqlite-vec-store.test.ts -t "FTS5"`
Expected: FAIL - `keywordSearch` is not a function

**Step 3: Write minimal implementation**

In `packages/vector-store/src/sqlite-vec-store.ts`, update `initSchema()` to add:

```typescript
this.db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    id UNINDEXED,
    content
  )
`);
```

In `add()`, after the existing INSERT, add:

```typescript
this.db.prepare(
  'INSERT OR REPLACE INTO chunks_fts(id, content) VALUES (?, ?)'
).run(id, content);
```

Add `keywordSearch()` method:

```typescript
keywordSearch(query: string, limit = 10): SimilarityResult[] {
  const safeQuery = query.replace(/['"]/g, ' ').trim();
  if (!safeQuery) return [];
  const ftsQuery = safeQuery.split(/\s+/).map(t => `"${t}"`).join(' OR ');
  const rows = this.db.prepare(
    `SELECT id, content, rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`
  ).all(ftsQuery, limit) as Array<{ id: string; content: string; rank: number }>;

  return rows.map(row => {
    const entry = this.db.prepare('SELECT vector, metadata, created_at FROM vectors WHERE id = ?').get(row.id) as any;
    return {
      id: row.id,
      content: row.content,
      score: -row.rank,
      vector: entry ? JSON.parse(entry.vector) : [],
      metadata: entry ? JSON.parse(entry.metadata) : {},
      createdAt: entry?.created_at ?? 0,
    };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/vector-store/tests/sqlite-vec-store.test.ts -t "FTS5"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vector-store/src/sqlite-vec-store.ts packages/vector-store/tests/sqlite-vec-store.test.ts
git commit -m "feat(vector-store): add FTS5 keyword search alongside vector similarity"
```

---

### Task 2: Add hybrid search with Reciprocal Rank Fusion

**Files:**
- Modify: `packages/vector-store/src/sqlite-vec-store.ts`
- Test: `packages/vector-store/tests/sqlite-vec-store.test.ts`

**Step 1: Write the failing test**

```typescript
describe('hybrid search', () => {
  it('should merge vector and keyword results via RRF', () => {
    const store = new SqliteVecStore({ dbPath: ':memory:', dimensions: 3 });
    store.add('doc1', [0.9, 0.1, 0], 'fix the TypeError in auth module');
    store.add('doc2', [0.8, 0.2, 0], 'repair the authentication bug');
    store.add('doc3', [0, 0, 1], 'TypeError: network timeout');

    const results = store.hybridSearch([1, 0, 0], 'TypeError', { limit: 10 });
    expect(results.length).toBe(3);
    expect(results[0].id).toBe('doc1');
  });

  it('should support searchMode option', () => {
    const store = new SqliteVecStore({ dbPath: ':memory:', dimensions: 3 });
    store.add('a', [1, 0, 0], 'hello world');

    const vectorOnly = store.hybridSearch([1, 0, 0], 'hello', { mode: 'vector' });
    expect(vectorOnly.length).toBe(1);

    const keywordOnly = store.hybridSearch([1, 0, 0], 'hello', { mode: 'keyword' });
    expect(keywordOnly.length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/vector-store/tests/sqlite-vec-store.test.ts -t "hybrid"`
Expected: FAIL - `hybridSearch` is not a function

**Step 3: Write minimal implementation**

```typescript
interface HybridSearchOptions {
  limit?: number;
  minScore?: number;
  mode?: 'vector' | 'keyword' | 'hybrid';
}

hybridSearch(
  queryVector: number[],
  queryText: string,
  options: HybridSearchOptions = {},
): SimilarityResult[] {
  const { limit = 10, minScore = 0, mode = 'hybrid' } = options;

  if (mode === 'vector') return this.search(queryVector, limit, minScore);
  if (mode === 'keyword') return this.keywordSearch(queryText, limit);

  const vectorResults = this.search(queryVector, limit * 2, minScore);
  const keywordResults = this.keywordSearch(queryText, limit * 2);

  // Reciprocal Rank Fusion (k=60)
  const k = 60;
  const scores = new Map<string, number>();
  const entries = new Map<string, SimilarityResult>();

  vectorResults.forEach((r, i) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + i + 1));
    entries.set(r.id, r);
  });

  keywordResults.forEach((r, i) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + i + 1));
    if (!entries.has(r.id)) entries.set(r.id, r);
  });

  return Array.from(entries.values())
    .map(e => ({ ...e, score: scores.get(e.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/vector-store/tests/sqlite-vec-store.test.ts -t "hybrid"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vector-store/
git commit -m "feat(vector-store): add hybrid BM25+vector search with Reciprocal Rank Fusion"
```

---

## Phase 2: OpenAI-Compatible Chat Completions Endpoint

### Task 3: Create OpenAI-compat route file

**Files:**
- Create: `packages/gateway/src/openai-compat-routes.ts`
- Test: `packages/gateway/tests/openai-compat-routes.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/openai-compat-routes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mountOpenAICompatRoutes, type OpenAICompatDeps } from '../src/openai-compat-routes.js';

function makeDeps(overrides: Partial<OpenAICompatDeps> = {}): OpenAICompatDeps {
  return {
    complete: overrides.complete ?? vi.fn().mockResolvedValue({
      content: 'Hello!',
      model: 'claude-3-haiku',
      usage: { promptTokens: 10, completionTokens: 5 },
    }),
    authToken: overrides.authToken ?? 'test-token',
  };
}

describe('POST /v1/chat/completions', () => {
  it('returns 401 without auth', async () => {
    const app = express();
    app.use(express.json());
    mountOpenAICompatRoutes(app, makeDeps());

    const res = await request(app).post('/v1/chat/completions').send({
      model: 'auxiora',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.status).toBe(401);
  });

  it('returns completion with valid auth', async () => {
    const app = express();
    app.use(express.json());
    const deps = makeDeps();
    mountOpenAICompatRoutes(app, deps);

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-token')
      .send({
        model: 'auxiora',
        messages: [{ role: 'user', content: 'hi' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content).toBe('Hello!');
    expect(res.body.object).toBe('chat.completion');
  });

  it('returns 400 with missing messages', async () => {
    const app = express();
    app.use(express.json());
    mountOpenAICompatRoutes(app, makeDeps());

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer test-token')
      .send({ model: 'auxiora' });
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/gateway/tests/openai-compat-routes.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `packages/gateway/src/openai-compat-routes.ts`:

```typescript
import type { Express, Request, Response } from 'express';
import { nanoid } from 'nanoid';

export interface CompletionResult {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface OpenAICompatDeps {
  complete: (messages: Array<{ role: string; content: string }>, options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<CompletionResult>;
  stream?: (messages: Array<{ role: string; content: string }>, options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) => AsyncGenerator<{ type: string; text?: string }>;
  authToken?: string;
}

export function mountOpenAICompatRoutes(app: Express, deps: OpenAICompatDeps): void {
  app.post('/v1/chat/completions', async (req: Request, res: Response) => {
    if (deps.authToken) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== deps.authToken) {
        res.status(401).json({ error: { message: 'Invalid API key', type: 'invalid_request_error' } });
        return;
      }
    }

    const { messages, model, temperature, max_tokens, stream } = req.body as {
      messages?: Array<{ role: string; content: string }>;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
      return;
    }

    try {
      if (stream && deps.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const completionId = `chatcmpl-${nanoid(12)}`;
        const created = Math.floor(Date.now() / 1000);

        for await (const chunk of deps.stream(messages, { model, temperature, maxTokens: max_tokens })) {
          if (chunk.type === 'text') {
            res.write(`data: ${JSON.stringify({
              id: completionId, object: 'chat.completion.chunk', created,
              model: model ?? 'auxiora',
              choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }],
            })}\n\n`);
          } else if (chunk.type === 'done') {
            res.write(`data: ${JSON.stringify({
              id: completionId, object: 'chat.completion.chunk', created,
              model: model ?? 'auxiora',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            })}\n\n`);
            res.write('data: [DONE]\n\n');
          }
        }
        res.end();
        return;
      }

      const result = await deps.complete(messages, {
        model, temperature, maxTokens: max_tokens,
      });

      res.json({
        id: `chatcmpl-${nanoid(12)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: result.content },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.promptTokens + result.usage.completionTokens,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: { message: err instanceof Error ? err.message : 'Internal error', type: 'server_error' },
      });
    }
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/gateway/tests/openai-compat-routes.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/gateway/src/openai-compat-routes.ts packages/gateway/tests/openai-compat-routes.test.ts
git commit -m "feat(gateway): add OpenAI-compatible /v1/chat/completions endpoint with streaming"
```

---

### Task 4: Wire OpenAI-compat route into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` (route mount section ~line 1519)

**Step 1: Add the route mount**

After the canvas router mount, add:

```typescript
// OpenAI-compatible Chat Completions API
mountOpenAICompatRoutes(this.gateway.getApp(), {
  complete: async (messages, options) => {
    const provider = options.model?.includes('/')
      ? this.providers.getProvider(options.model.split('/')[0])
      : this.providers.getPrimaryProvider();
    const chatMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
    const result = await provider.complete(chatMessages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
    return {
      content: result.content,
      model: result.model ?? provider.defaultModel,
      usage: result.usage ?? { promptTokens: 0, completionTokens: 0 },
    };
  },
  stream: async function* (messages, options) {
    const provider = options.model?.includes('/')
      ? this.providers.getProvider(options.model.split('/')[0])
      : this.providers.getPrimaryProvider();
    const chatMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
    for await (const chunk of provider.stream(chatMessages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    })) {
      if (chunk.type === 'text') yield { type: 'text', text: chunk.text };
      if (chunk.type === 'done') yield { type: 'done' };
    }
  }.bind(this),
  authToken: this.vault?.get('OPENAI_COMPAT_TOKEN') ?? undefined,
});
```

Add import at top: `import { mountOpenAICompatRoutes } from '@auxiora/gateway/openai-compat-routes';`

Note: Gateway's `getApp()` getter may need to be added if not present. Check `server.ts` line 562 pattern.

**Step 2: Build and verify**

Run: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire OpenAI-compatible endpoint into runtime"
```

---

## Phase 3: Live Canvas WebSocket Transport

### Task 5: Verify canvas event emission works

**Files:**
- Test: `packages/canvas/tests/canvas-ws.test.ts`

**Step 1: Write the test**

Create `packages/canvas/tests/canvas-ws.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CanvasSession } from '../src/canvas-session.js';

describe('CanvasSession event broadcasting', () => {
  it('emits object:added event when addObject is called', () => {
    const session = new CanvasSession();
    const events: any[] = [];
    session.on('object:added', (evt) => events.push(evt));

    session.addObject({ type: 'text', x: 0, y: 0, width: 100, height: 50, visible: true, content: 'hi', fontSize: 16, fontFamily: 'sans', color: '#fff' });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('object:added');
  });

  it('emits object:updated event when updateObject is called', () => {
    const session = new CanvasSession();
    const obj = session.addObject({ type: 'text', x: 0, y: 0, width: 100, height: 50, visible: true, content: 'hi', fontSize: 16, fontFamily: 'sans', color: '#fff' });

    const events: any[] = [];
    session.on('object:updated', (evt) => events.push(evt));
    session.updateObject(obj.id, { x: 50 });

    expect(events.length).toBe(1);
  });

  it('emits object:removed event when removeObject is called', () => {
    const session = new CanvasSession();
    const obj = session.addObject({ type: 'text', x: 0, y: 0, width: 100, height: 50, visible: true, content: 'hi', fontSize: 16, fontFamily: 'sans', color: '#fff' });

    const events: any[] = [];
    session.on('object:removed', (evt) => events.push(evt));
    session.removeObject(obj.id);

    expect(events.length).toBe(1);
  });
});
```

**Step 2: Run test**

Run: `pnpm vitest run packages/canvas/tests/canvas-ws.test.ts`
Expected: PASS (canvas already has event emission). If FAIL, add `this.emit(type, event)` calls to the relevant methods.

**Step 3: Commit**

```bash
git add packages/canvas/tests/canvas-ws.test.ts
git commit -m "test(canvas): verify event emission for WebSocket transport"
```

---

### Task 6: Add WebSocket upgrade to canvas router

**Files:**
- Modify: `packages/runtime/src/index.ts` (in `createCanvasRouter` ~line 6774)

**Step 1: Add WebSocket upgrade endpoint**

In `createCanvasRouter()`, before `return router;`, add:

```typescript
// GET /sessions — list all sessions
router.get('/sessions', (_req: any, res: any) => {
  const sessions = Array.from(this.canvasSessions.entries()).map(([id, s]) => ({
    id,
    objectCount: s.getObjects().length,
    size: s.getSize(),
    createdAt: s.createdAt,
  }));
  res.json({ sessions });
});
```

For the WebSocket upgrade, add a handler in the gateway's WebSocket server setup that checks the URL path `/api/v1/canvas/sessions/:id/ws` and upgrades:

```typescript
// In the gateway's HTTP server 'upgrade' handler:
this.server.on('upgrade', (req, socket, head) => {
  const match = req.url?.match(/^\/api\/v1\/canvas\/sessions\/([^/]+)\/ws$/);
  if (match) {
    const sessionId = match[1];
    const session = this.canvasSessions.get(sessionId);
    if (!session) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Send initial snapshot
      ws.send(JSON.stringify({
        type: 'canvas:snapshot',
        sessionId: session.id,
        data: { objects: session.getObjects(), size: session.getSize() },
        timestamp: new Date().toISOString(),
      }));

      // Subscribe to session events
      const eventTypes = ['object:added', 'object:updated', 'object:removed', 'canvas:cleared', 'canvas:resized'] as const;
      const handler = (event: any) => {
        if (ws.readyState === 1) ws.send(JSON.stringify(event));
      };
      for (const t of eventTypes) session.on(t, handler);
      ws.on('close', () => {
        for (const t of eventTypes) session.off?.(t, handler);
      });
    });
    return;
  }
});
```

**Step 2: Build and verify**

Run: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(canvas): add WebSocket upgrade for live canvas event streaming"
```

---

### Task 7: Add LiveCanvas dashboard page

**Files:**
- Create: `packages/dashboard/ui/src/pages/LiveCanvas.tsx`
- Modify: `packages/dashboard/ui/src/components/DesktopShell.tsx`
- Modify: `packages/dashboard/ui/src/styles/global.css`

**Step 1: Create LiveCanvas component**

Create `packages/dashboard/ui/src/pages/LiveCanvas.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react';

interface CanvasObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  content?: string;
  src?: string;
  alt?: string;
  [key: string]: unknown;
}

export function LiveCanvas() {
  const [sessions, setSessions] = useState<Array<{ id: string; objectCount: number }>>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch('/api/v1/canvas/sessions')
      .then(r => r.json())
      .then(data => setSessions(data.sessions ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/v1/canvas/sessions/${activeSession}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === 'canvas:snapshot') {
        setObjects(event.data.objects ?? []);
      } else if (event.type === 'object:added') {
        setObjects(prev => [...prev, event.data]);
      } else if (event.type === 'object:updated') {
        setObjects(prev => prev.map(o => o.id === event.objectId ? { ...o, ...event.data } : o));
      } else if (event.type === 'object:removed') {
        setObjects(prev => prev.filter(o => o.id !== event.objectId));
      } else if (event.type === 'canvas:cleared') {
        setObjects([]);
      }
    };

    return () => { ws.close(); wsRef.current = null; };
  }, [activeSession]);

  const renderObject = (obj: CanvasObject) => {
    if (!obj.visible) return null;
    const style: React.CSSProperties = {
      position: 'absolute', left: obj.x, top: obj.y, width: obj.width, height: obj.height,
    };
    switch (obj.type) {
      case 'text':
        return <div key={obj.id} className="lc-obj lc-text" style={style}>{obj.content}</div>;
      case 'image':
        return <img key={obj.id} className="lc-obj lc-image" style={style} src={obj.src} alt={obj.alt ?? ''} />;
      default:
        return <div key={obj.id} className="lc-obj" style={style}>{obj.type}: {obj.id}</div>;
    }
  };

  return (
    <div className="page">
      <h2>Live Canvas</h2>
      <div className="lc-status">
        {connected ? <span className="lc-connected">Connected</span> : <span className="lc-disconnected">Disconnected</span>}
      </div>
      {!activeSession ? (
        <div className="lc-sessions">
          {sessions.length === 0 ? (
            <div className="lc-empty">No active canvas sessions.</div>
          ) : (
            sessions.map(s => (
              <button key={s.id} className="btn-sm" onClick={() => setActiveSession(s.id)}>
                Session {s.id} ({s.objectCount} objects)
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="lc-canvas" style={{ position: 'relative', minHeight: 400 }}>
          <button className="btn-sm" onClick={() => { setActiveSession(null); setObjects([]); }}>Back</button>
          {objects.map(renderObject)}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add to DesktopShell APPS array**

In `packages/dashboard/ui/src/components/DesktopShell.tsx`:
- Add import: `import { LiveCanvas } from '../pages/LiveCanvas.js';`
- Add APPS entry: `{ id: 'canvas', label: 'Canvas', icon: '\u{1F3A8}', component: () => <LiveCanvas />, defaultWidth: 900, defaultHeight: 640 },`

**Step 3: Add CSS to `packages/dashboard/ui/src/styles/global.css`**

```css
/* -- Live Canvas -- */
.lc-status { margin-bottom: 12px; }
.lc-connected { color: var(--success); }
.lc-disconnected { color: var(--text-secondary); }
.lc-empty { color: var(--text-secondary); padding: 24px 0; }
.lc-sessions { display: flex; gap: 8px; flex-wrap: wrap; }
.lc-canvas { background: rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden; }
.lc-obj { padding: 4px; border-radius: 4px; }
.lc-text { color: var(--text-primary); white-space: pre-wrap; }
.lc-image { object-fit: contain; }
```

**Step 4: Build dashboard**

Run: `cd packages/dashboard/ui && npx vite build`
Expected: Clean build

**Step 5: Commit**

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): add LiveCanvas page with WebSocket connection"
```

---

## Phase 4: Tool Execution Approval Flow

### Task 8: Create ToolApprovalGate

**Files:**
- Create: `packages/runtime/src/tool-approval-gate.ts`
- Test: `packages/runtime/tests/tool-approval-gate.test.ts`

**Step 1: Write the failing test**

Create `packages/runtime/tests/tool-approval-gate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ToolApprovalGate } from '../src/tool-approval-gate.js';

describe('ToolApprovalGate', () => {
  it('allows tools not in the approval list', async () => {
    const gate = new ToolApprovalGate({ requireApproval: ['run_shell'] });
    const result = await gate.check('search', { query: 'test' });
    expect(result.allowed).toBe(true);
  });

  it('blocks tools in the approval list when no approval given', async () => {
    const gate = new ToolApprovalGate({
      requireApproval: ['run_shell'],
      timeoutMs: 100,
    });
    const result = await gate.check('run_shell', { command: 'ls' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('timeout');
  });

  it('allows when approval is granted', async () => {
    const gate = new ToolApprovalGate({
      requireApproval: ['run_shell'],
      timeoutMs: 5000,
    });

    const promise = gate.check('run_shell', { command: 'ls' });
    const pending = gate.getPending();
    expect(pending.length).toBe(1);

    gate.resolve(pending[0].id, true);
    const result = await promise;
    expect(result.allowed).toBe(true);
  });

  it('blocks when approval is rejected', async () => {
    const gate = new ToolApprovalGate({
      requireApproval: ['run_shell'],
      timeoutMs: 5000,
    });

    const promise = gate.check('run_shell', { command: 'ls' });
    const pending = gate.getPending();
    gate.resolve(pending[0].id, false, 'Not safe');

    const result = await promise;
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Not safe');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/tests/tool-approval-gate.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `packages/runtime/src/tool-approval-gate.ts`:

```typescript
import { nanoid } from 'nanoid';

export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  description: string;
  createdAt: number;
  resolvedAt?: number;
  comment?: string;
}

export interface ApprovalCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ToolApprovalGateOptions {
  requireApproval: string[];
  timeoutMs?: number;
}

export class ToolApprovalGate {
  private requireApproval: Set<string>;
  private timeoutMs: number;
  private pending = new Map<string, {
    request: ToolApprovalRequest;
    resolve: (result: ApprovalCheckResult) => void;
  }>();

  constructor(options: ToolApprovalGateOptions) {
    this.requireApproval = new Set(options.requireApproval);
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<ApprovalCheckResult> {
    if (!this.requireApproval.has(toolName)) {
      return { allowed: true };
    }

    const request: ToolApprovalRequest = {
      id: `apr_${nanoid(10)}`,
      toolName,
      args,
      status: 'pending',
      description: `Tool: ${toolName}(${JSON.stringify(args).slice(0, 200)})`,
      createdAt: Date.now(),
    };

    return new Promise<ApprovalCheckResult>((resolvePromise) => {
      this.pending.set(request.id, { request, resolve: resolvePromise });

      setTimeout(() => {
        if (this.pending.has(request.id)) {
          this.pending.delete(request.id);
          request.status = 'expired';
          resolvePromise({ allowed: false, reason: `Approval timeout after ${this.timeoutMs}ms` });
        }
      }, this.timeoutMs);
    });
  }

  resolve(id: string, approved: boolean, comment?: string): ToolApprovalRequest | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;

    entry.request.status = approved ? 'approved' : 'rejected';
    entry.request.resolvedAt = Date.now();
    entry.request.comment = comment;
    this.pending.delete(id);

    entry.resolve({
      allowed: approved,
      reason: approved ? undefined : comment ?? 'Rejected by user',
    });

    return entry.request;
  }

  getPending(): ToolApprovalRequest[] {
    return Array.from(this.pending.values()).map(e => e.request);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/tests/tool-approval-gate.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-approval-gate.ts packages/runtime/tests/tool-approval-gate.test.ts
git commit -m "feat(runtime): add ToolApprovalGate for interactive tool approval"
```

---

### Task 9: Add approval gateway routes

**Files:**
- Create: `packages/gateway/src/approval-routes.ts`
- Test: `packages/gateway/tests/approval-routes.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/approval-routes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mountApprovalRoutes, type ApprovalRoutesDeps } from '../src/approval-routes.js';

function makeDeps(): ApprovalRoutesDeps {
  return {
    getPending: vi.fn().mockResolvedValue([
      { id: 'apr_1', toolName: 'run_shell', description: 'Tool: run_shell(ls)', status: 'pending', createdAt: Date.now() },
    ]),
    resolve: vi.fn().mockResolvedValue({ id: 'apr_1', status: 'approved' }),
  };
}

describe('approval routes', () => {
  it('GET /pending returns pending approvals', async () => {
    const app = express();
    app.use(express.json());
    const deps = makeDeps();
    mountApprovalRoutes(app, deps);

    const res = await request(app).get('/api/v1/tool-approvals/pending');
    expect(res.status).toBe(200);
    expect(res.body.approvals.length).toBe(1);
  });

  it('POST /resolve approves a request', async () => {
    const app = express();
    app.use(express.json());
    const deps = makeDeps();
    mountApprovalRoutes(app, deps);

    const res = await request(app)
      .post('/api/v1/tool-approvals/apr_1/resolve')
      .send({ approved: true });
    expect(res.status).toBe(200);
    expect(deps.resolve).toHaveBeenCalledWith('apr_1', true, undefined);
  });

  it('POST /resolve rejects with comment', async () => {
    const app = express();
    app.use(express.json());
    const deps = makeDeps();
    mountApprovalRoutes(app, deps);

    const res = await request(app)
      .post('/api/v1/tool-approvals/apr_1/resolve')
      .send({ approved: false, comment: 'Too dangerous' });
    expect(res.status).toBe(200);
    expect(deps.resolve).toHaveBeenCalledWith('apr_1', false, 'Too dangerous');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/gateway/tests/approval-routes.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `packages/gateway/src/approval-routes.ts`:

```typescript
import type { Express, Request, Response } from 'express';

export interface ApprovalRoutesDeps {
  getPending: () => Promise<Array<{ id: string; [key: string]: unknown }>>;
  resolve: (id: string, approved: boolean, comment?: string) => Promise<{ id: string; [key: string]: unknown } | undefined>;
}

export function mountApprovalRoutes(app: Express, deps: ApprovalRoutesDeps): void {
  app.get('/api/v1/tool-approvals/pending', async (_req: Request, res: Response) => {
    try {
      const approvals = await deps.getPending();
      res.json({ approvals });
    } catch {
      res.status(500).json({ error: 'Failed to fetch approvals' });
    }
  });

  app.post('/api/v1/tool-approvals/:id/resolve', async (req: Request, res: Response) => {
    const { approved, comment } = req.body as { approved?: boolean; comment?: string };
    if (typeof approved !== 'boolean') {
      res.status(400).json({ error: '"approved" boolean is required' });
      return;
    }
    try {
      const result = await deps.resolve(req.params.id, approved, comment);
      if (!result) {
        res.status(404).json({ error: 'Approval not found' });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to resolve approval' });
    }
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/gateway/tests/approval-routes.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/gateway/src/approval-routes.ts packages/gateway/tests/approval-routes.test.ts
git commit -m "feat(gateway): add tool approval REST routes"
```

---

### Task 10: Add ApprovalBanner dashboard component

**Files:**
- Create: `packages/dashboard/ui/src/components/ApprovalBanner.tsx`
- Modify: `packages/dashboard/ui/src/components/DesktopShell.tsx`
- Modify: `packages/dashboard/ui/src/styles/global.css`

**Step 1: Create ApprovalBanner**

Create `packages/dashboard/ui/src/components/ApprovalBanner.tsx`:

```typescript
import { useState, useEffect } from 'react';

interface ToolApproval {
  id: string;
  toolName: string;
  description: string;
  status: string;
  createdAt: number;
}

export function ApprovalBanner() {
  const [approvals, setApprovals] = useState<ToolApproval[]>([]);

  useEffect(() => {
    const poll = setInterval(() => {
      fetch('/api/v1/tool-approvals/pending')
        .then(r => r.json())
        .then(data => setApprovals(data.approvals ?? []))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  const handleResolve = async (id: string, approved: boolean) => {
    await fetch(`/api/v1/tool-approvals/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    });
    setApprovals(prev => prev.filter(a => a.id !== id));
  };

  if (approvals.length === 0) return null;

  return (
    <div className="approval-banner">
      {approvals.map(a => (
        <div key={a.id} className="approval-item">
          <div className="approval-desc">{a.description}</div>
          <div className="approval-actions">
            <button className="btn-sm" onClick={() => handleResolve(a.id, true)}>Approve</button>
            <button className="btn-sm btn-danger" onClick={() => handleResolve(a.id, false)}>Deny</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Mount in DesktopShell**

In `packages/dashboard/ui/src/components/DesktopShell.tsx`:
- Add import: `import { ApprovalBanner } from './ApprovalBanner.js';`
- Add `<ApprovalBanner />` after the `</div>` closing the topbar and before the window area div

**Step 3: Add CSS to `packages/dashboard/ui/src/styles/global.css`**

```css
/* -- Approval Banner -- */
.approval-banner {
  position: relative;
  z-index: 9998;
  padding: 8px 12px;
  background: rgba(255, 180, 0, 0.12);
  border-bottom: 1px solid rgba(255, 180, 0, 0.25);
}
.approval-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}
.approval-desc {
  font-size: 0.85em;
  color: var(--text-primary);
  font-family: var(--font-mono, monospace);
}
.approval-actions { display: flex; gap: 6px; }
```

**Step 4: Build dashboard**

Run: `cd packages/dashboard/ui && npx vite build`
Expected: Clean build

**Step 5: Commit**

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): add ApprovalBanner for tool approval UI"
```

---

### Task 11: Wire approval gate + routes into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Wire everything together**

In `packages/runtime/src/index.ts`:

1. Import:
```typescript
import { ToolApprovalGate } from './tool-approval-gate.js';
import { mountApprovalRoutes } from '@auxiora/gateway/approval-routes';
```

2. Add property: `private toolApprovalGate?: ToolApprovalGate;`

3. In `initialize()`, create the gate:
```typescript
this.toolApprovalGate = new ToolApprovalGate({
  requireApproval: this.config.security?.requireApproval ?? [],
});
```

4. Mount routes after other route mounts:
```typescript
mountApprovalRoutes(this.gateway.getApp(), {
  getPending: async () => this.toolApprovalGate?.getPending() ?? [],
  resolve: async (id, approved, comment) => this.toolApprovalGate?.resolve(id, approved, comment),
});
```

**Step 2: Build and verify**

Run: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire ToolApprovalGate and approval routes into runtime"
```

---

### Task 12: Final verification

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: All existing + new tests pass

**Step 2: Full build**

Run: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
Expected: Clean build

**Step 3: Build dashboard**

Run: `cd packages/dashboard/ui && npx vite build`
Expected: Clean build

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: final cleanup for OpenClaw-inspired features"
```
