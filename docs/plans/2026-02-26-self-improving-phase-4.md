# Self-Improving System Phase 4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add 4 high-value capabilities: agent callgraph DAG tracking, global event bus, active LLM-based oversight, and meta-improvement reasoning structure.

**Architecture:** Phase 4 adds 2 new packages (`callgraph`, `event-bus`) and extends 2 existing packages (`overseer`, `reasoning`). All cross-package dependencies use structural types (`FooLike` interfaces). New SQLite stores follow the established WAL pattern. The event bus enables decoupled communication between all subsystems. The LLM overseer wraps the existing heuristic monitor and adds LLM judgment. The meta-improvement structure uses `StepRegistry` to drive a self-modification loop.

**Tech Stack:** TypeScript strict ESM, node:sqlite WAL, vitest, structural typing

---

## Context

### Existing Modules (Phase 1-3)
- `packages/orchestrator/src/engine.ts` — OrchestrationEngine with 5 patterns, yields AgentEvent
- `packages/orchestrator/src/types.ts` — AgentEvent discriminated union, AgentTask, Workflow
- `packages/overseer/src/monitor.ts` — OverseerMonitor (heuristic: loop/stall/budget)
- `packages/overseer/src/alert-store.ts` — AlertStore (SQLite WAL, alerts table)
- `packages/overseer/src/types.ts` — AgentSnapshot, OverseerAlert, AlertType, OverseerConfig
- `packages/reasoning/src/step-registry.ts` — StepRegistry (ordered step state machine)
- `packages/reasoning/src/step-tools.ts` — StepToolGenerator (ephemeral tool generation)
- `packages/reasoning/src/types.ts` — ReasoningStep, StepState, StepProgress
- `packages/react-loop/` — ReActLoop (think-act-observe), StepTracker (loop detection)
- `packages/notification-hub/` — NotificationHub (priority-based notification routing)
- `packages/observability/` — TraceManager (distributed tracing, OTel export)
- `packages/review-committee/` — ReviewCommittee (weighted critic aggregation)
- `packages/benchmark/` — BenchmarkStore + BenchmarkRunner
- `packages/telemetry/` — TelemetryTracker, LearningStore, ChangeLog

### Key Patterns
- **Structural types**: Every cross-package dep uses a `FooLike` interface defined locally — never import the actual package
- **Enrichment stages**: `{ name, order, enabled(ctx), enrich(ctx, prompt) }` — constructor takes getter functions
- **SQLite stores**: `node:sqlite` `DatabaseSync`, WAL mode, `busy_timeout=5000`, `if (this.closed)` guards, `close()` method
- **All imports** use `.js` extensions; type imports use `type` keyword
- **Tests**: vitest, `tests/` directory at package root, `describe/it/expect`
- **Package setup**: `package.json` with `"exports": { ".": "./src/index.ts" }`, `tsconfig.json` extends root

---

### Task 1: Callgraph Tracker — Core DAG Data Structure

**Files:**
- Create: `packages/callgraph/package.json`
- Create: `packages/callgraph/tsconfig.json`
- Create: `packages/callgraph/src/types.ts`
- Create: `packages/callgraph/src/tracker.ts`
- Create: `packages/callgraph/src/index.ts`
- Create: `packages/callgraph/tests/tracker.test.ts`

**Context:** The callgraph tracks parent→child agent spawning as a directed acyclic graph. Each node represents an agent (with id, name, status, token usage). Each edge represents a "spawned by" relationship. The tracker maintains an in-memory DAG with cycle detection, depth limiting, and topological ordering. This is the foundation for visualizing agent hierarchies and detecting runaway spawning.

**Step 1: Write the failing test**

Create `packages/callgraph/tests/tracker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CallgraphTracker } from '../src/tracker.js';
import type { AgentNode } from '../src/types.js';

describe('CallgraphTracker', () => {
  it('tracks root agent with no parent', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'orchestrator', startedAt: Date.now() });

    const nodes = tracker.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('root');
    expect(nodes[0].depth).toBe(0);
  });

  it('tracks parent-child edges', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'supervisor', startedAt: Date.now() });
    tracker.addAgent({ id: 'worker-1', name: 'coder', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'worker-2', name: 'reviewer', startedAt: Date.now(), parentId: 'root' });

    const edges = tracker.getEdges();
    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual({ parentId: 'root', childId: 'worker-1' });
    expect(edges[1]).toEqual({ parentId: 'root', childId: 'worker-2' });

    const children = tracker.getChildren('root');
    expect(children.map((c) => c.id)).toEqual(['worker-1', 'worker-2']);
  });

  it('computes depth correctly for nested agents', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'a', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'b', name: 'mid', startedAt: Date.now(), parentId: 'a' });
    tracker.addAgent({ id: 'c', name: 'leaf', startedAt: Date.now(), parentId: 'b' });

    const leaf = tracker.getNode('c');
    expect(leaf?.depth).toBe(2);
    expect(tracker.getMaxDepth()).toBe(2);
  });

  it('rejects agents exceeding max depth', () => {
    const tracker = new CallgraphTracker({ maxDepth: 2 });
    tracker.addAgent({ id: 'a', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'b', name: 'mid', startedAt: Date.now(), parentId: 'a' });
    tracker.addAgent({ id: 'c', name: 'leaf', startedAt: Date.now(), parentId: 'b' });

    expect(() =>
      tracker.addAgent({ id: 'd', name: 'too-deep', startedAt: Date.now(), parentId: 'c' }),
    ).toThrow('depth limit');
  });

  it('updates agent status and token usage', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'a', name: 'worker', startedAt: Date.now() });
    tracker.updateAgent('a', { status: 'completed', tokenUsage: 1500, completedAt: Date.now() });

    const node = tracker.getNode('a');
    expect(node?.status).toBe('completed');
    expect(node?.tokenUsage).toBe(1500);
  });

  it('returns topological order', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'child-1', name: 'c1', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'child-2', name: 'c2', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'grandchild', name: 'gc', startedAt: Date.now(), parentId: 'child-1' });

    const order = tracker.topologicalOrder();
    const rootIdx = order.indexOf('root');
    const c1Idx = order.indexOf('child-1');
    const gcIdx = order.indexOf('grandchild');
    expect(rootIdx).toBeLessThan(c1Idx);
    expect(c1Idx).toBeLessThan(gcIdx);
  });

  it('computes aggregate token usage for subtree', () => {
    const tracker = new CallgraphTracker({ maxDepth: 10 });
    tracker.addAgent({ id: 'root', name: 'root', startedAt: Date.now() });
    tracker.addAgent({ id: 'c1', name: 'c1', startedAt: Date.now(), parentId: 'root' });
    tracker.addAgent({ id: 'c2', name: 'c2', startedAt: Date.now(), parentId: 'root' });
    tracker.updateAgent('root', { tokenUsage: 100 });
    tracker.updateAgent('c1', { tokenUsage: 200 });
    tracker.updateAgent('c2', { tokenUsage: 300 });

    expect(tracker.getSubtreeTokenUsage('root')).toBe(600);
    expect(tracker.getSubtreeTokenUsage('c1')).toBe(200);
  });
});
```

**Step 2: Make the test pass**

Create `packages/callgraph/src/types.ts`:

```typescript
export interface CallgraphConfig {
  maxDepth: number;
}

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentNodeInput {
  id: string;
  name: string;
  startedAt: number;
  parentId?: string;
}

export interface AgentNode {
  id: string;
  name: string;
  parentId?: string;
  depth: number;
  status: AgentStatus;
  startedAt: number;
  completedAt?: number;
  tokenUsage: number;
}

export interface AgentNodeUpdate {
  status?: AgentStatus;
  completedAt?: number;
  tokenUsage?: number;
}

export interface CallgraphEdge {
  parentId: string;
  childId: string;
}

export interface CallgraphSnapshot {
  nodes: AgentNode[];
  edges: CallgraphEdge[];
  maxDepth: number;
  totalTokenUsage: number;
}
```

Create `packages/callgraph/src/tracker.ts`:

```typescript
import type { CallgraphConfig, AgentNode, AgentNodeInput, AgentNodeUpdate, CallgraphEdge } from './types.js';

export class CallgraphTracker {
  private readonly nodes = new Map<string, AgentNode>();
  private readonly edges: CallgraphEdge[] = [];
  private readonly children = new Map<string, string[]>();
  private readonly config: CallgraphConfig;

  constructor(config: CallgraphConfig) {
    this.config = config;
  }

  addAgent(input: AgentNodeInput): void {
    if (this.nodes.has(input.id)) {
      throw new Error(`Agent ${input.id} already exists in callgraph`);
    }

    let depth = 0;
    if (input.parentId) {
      const parent = this.nodes.get(input.parentId);
      if (!parent) {
        throw new Error(`Parent agent ${input.parentId} not found`);
      }
      depth = parent.depth + 1;
      if (depth > this.config.maxDepth) {
        throw new Error(`Agent ${input.id} exceeds depth limit (${depth} > ${this.config.maxDepth})`);
      }
      this.edges.push({ parentId: input.parentId, childId: input.id });
      const siblings = this.children.get(input.parentId) ?? [];
      siblings.push(input.id);
      this.children.set(input.parentId, siblings);
    }

    this.nodes.set(input.id, {
      id: input.id,
      name: input.name,
      parentId: input.parentId,
      depth,
      status: 'running',
      startedAt: input.startedAt,
      tokenUsage: 0,
    });
  }

  updateAgent(id: string, update: AgentNodeUpdate): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Agent ${id} not found`);
    }
    if (update.status !== undefined) node.status = update.status;
    if (update.completedAt !== undefined) node.completedAt = update.completedAt;
    if (update.tokenUsage !== undefined) node.tokenUsage = update.tokenUsage;
  }

  getNode(id: string): AgentNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): AgentNode[] {
    return [...this.nodes.values()];
  }

  getEdges(): CallgraphEdge[] {
    return [...this.edges];
  }

  getChildren(parentId: string): AgentNode[] {
    const childIds = this.children.get(parentId) ?? [];
    return childIds.map((id) => this.nodes.get(id)!);
  }

  getMaxDepth(): number {
    let max = 0;
    for (const node of this.nodes.values()) {
      if (node.depth > max) max = node.depth;
    }
    return max;
  }

  topologicalOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      result.push(id);
      const childIds = this.children.get(id) ?? [];
      for (const childId of childIds) {
        visit(childId);
      }
    };

    // Start from roots (no parent)
    for (const node of this.nodes.values()) {
      if (!node.parentId) {
        visit(node.id);
      }
    }

    return result;
  }

  getSubtreeTokenUsage(rootId: string): number {
    const node = this.nodes.get(rootId);
    if (!node) return 0;

    let total = node.tokenUsage;
    const childIds = this.children.get(rootId) ?? [];
    for (const childId of childIds) {
      total += this.getSubtreeTokenUsage(childId);
    }
    return total;
  }

  getSnapshot(): { nodes: AgentNode[]; edges: CallgraphEdge[]; maxDepth: number; totalTokenUsage: number } {
    let totalTokens = 0;
    for (const node of this.nodes.values()) {
      totalTokens += node.tokenUsage;
    }
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
      maxDepth: this.getMaxDepth(),
      totalTokenUsage: totalTokens,
    };
  }
}
```

Create `packages/callgraph/src/index.ts`:

```typescript
export { CallgraphTracker } from './tracker.js';
export type {
  AgentNode,
  AgentNodeInput,
  AgentNodeUpdate,
  AgentStatus,
  CallgraphConfig,
  CallgraphEdge,
  CallgraphSnapshot,
} from './types.js';
```

Create `packages/callgraph/package.json`:

```json
{
  "name": "@auxiora/callgraph",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `packages/callgraph/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Run tests**

Run: `cd packages/callgraph && npx vitest run tests/tracker.test.ts`
Expected: 7 tests passing

**Step 4: Commit**

```bash
git add packages/callgraph/
git commit -m "feat(callgraph): add CallgraphTracker DAG data structure"
```

---

### Task 2: Callgraph Store — SQLite Persistence

**Files:**
- Create: `packages/callgraph/src/store.ts`
- Modify: `packages/callgraph/src/index.ts`
- Create: `packages/callgraph/tests/store.test.ts`

**Context:** Persists callgraph snapshots to SQLite so agent hierarchies survive restarts and can be queried historically. Follows the same SQLite WAL pattern as `AlertStore` and `BenchmarkStore`. Stores both nodes and edges in separate tables with foreign key relationships.

**Step 1: Write the failing test**

Create `packages/callgraph/tests/store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { CallgraphStore } from '../src/store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CallgraphStore', () => {
  let store: CallgraphStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves agent nodes', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({
      id: 'agent-1',
      workflowId: 'wf-1',
      name: 'supervisor',
      depth: 0,
      status: 'running',
      startedAt: Date.now(),
      tokenUsage: 0,
    });

    const nodes = store.getNodesByWorkflow('wf-1');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('supervisor');
    expect(nodes[0].depth).toBe(0);
  });

  it('stores and retrieves edges', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({ id: 'p', workflowId: 'wf-1', name: 'parent', depth: 0, status: 'running', startedAt: Date.now(), tokenUsage: 0 });
    store.recordNode({ id: 'c', workflowId: 'wf-1', name: 'child', depth: 1, status: 'running', startedAt: Date.now(), tokenUsage: 0, parentId: 'p' });
    store.recordEdge({ workflowId: 'wf-1', parentId: 'p', childId: 'c' });

    const edges = store.getEdgesByWorkflow('wf-1');
    expect(edges).toHaveLength(1);
    expect(edges[0].parentId).toBe('p');
    expect(edges[0].childId).toBe('c');
  });

  it('retrieves full snapshot for a workflow', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({ id: 'root', workflowId: 'wf-2', name: 'root', depth: 0, status: 'completed', startedAt: 1000, tokenUsage: 500 });
    store.recordNode({ id: 'w1', workflowId: 'wf-2', name: 'worker', depth: 1, status: 'completed', startedAt: 2000, tokenUsage: 300, parentId: 'root' });
    store.recordEdge({ workflowId: 'wf-2', parentId: 'root', childId: 'w1' });

    const snapshot = store.getSnapshot('wf-2');
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.totalTokenUsage).toBe(800);
  });

  it('lists workflows with node counts', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-'));
    store = new CallgraphStore(join(tmpDir, 'callgraph.db'));

    store.recordNode({ id: 'a', workflowId: 'wf-1', name: 'a', depth: 0, status: 'completed', startedAt: 1000, tokenUsage: 0 });
    store.recordNode({ id: 'b', workflowId: 'wf-1', name: 'b', depth: 1, status: 'completed', startedAt: 2000, tokenUsage: 0, parentId: 'a' });
    store.recordNode({ id: 'c', workflowId: 'wf-2', name: 'c', depth: 0, status: 'running', startedAt: 3000, tokenUsage: 0 });

    const workflows = store.listWorkflows();
    expect(workflows).toHaveLength(2);
    const wf1 = workflows.find((w) => w.workflowId === 'wf-1');
    expect(wf1?.nodeCount).toBe(2);
  });
});
```

**Step 2: Make the test pass**

Create `packages/callgraph/src/store.ts`:

```typescript
import { DatabaseSync } from 'node:sqlite';
import type { AgentStatus } from './types.js';

export interface StoredNode {
  id: string;
  workflowId: string;
  name: string;
  parentId?: string;
  depth: number;
  status: AgentStatus;
  startedAt: number;
  completedAt?: number;
  tokenUsage: number;
}

export interface StoredEdge {
  workflowId: string;
  parentId: string;
  childId: string;
}

export interface WorkflowSummary {
  workflowId: string;
  nodeCount: number;
  firstStartedAt: number;
}

export interface StoredSnapshot {
  nodes: StoredNode[];
  edges: StoredEdge[];
  totalTokenUsage: number;
}

export class CallgraphStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA busy_timeout=5000');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS callgraph_nodes (
        id TEXT NOT NULL,
        workflowId TEXT NOT NULL,
        name TEXT NOT NULL,
        parentId TEXT,
        depth INTEGER NOT NULL,
        status TEXT NOT NULL,
        startedAt INTEGER NOT NULL,
        completedAt INTEGER,
        tokenUsage INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (id, workflowId)
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS callgraph_edges (
        workflowId TEXT NOT NULL,
        parentId TEXT NOT NULL,
        childId TEXT NOT NULL,
        PRIMARY KEY (workflowId, parentId, childId)
      )
    `);
  }

  recordNode(node: StoredNode): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO callgraph_nodes (id, workflowId, name, parentId, depth, status, startedAt, completedAt, tokenUsage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(node.id, node.workflowId, node.name, node.parentId ?? null, node.depth, node.status, node.startedAt, node.completedAt ?? null, node.tokenUsage);
  }

  recordEdge(edge: StoredEdge): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO callgraph_edges (workflowId, parentId, childId) VALUES (?, ?, ?)',
    );
    stmt.run(edge.workflowId, edge.parentId, edge.childId);
  }

  getNodesByWorkflow(workflowId: string): StoredNode[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM callgraph_nodes WHERE workflowId = ? ORDER BY depth ASC, startedAt ASC');
    const rows = stmt.all(workflowId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      workflowId: r.workflowId as string,
      name: r.name as string,
      parentId: (r.parentId as string) || undefined,
      depth: r.depth as number,
      status: r.status as AgentStatus,
      startedAt: r.startedAt as number,
      completedAt: (r.completedAt as number) || undefined,
      tokenUsage: r.tokenUsage as number,
    }));
  }

  getEdgesByWorkflow(workflowId: string): StoredEdge[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM callgraph_edges WHERE workflowId = ?');
    const rows = stmt.all(workflowId) as Record<string, unknown>[];
    return rows.map((r) => ({
      workflowId: r.workflowId as string,
      parentId: r.parentId as string,
      childId: r.childId as string,
    }));
  }

  getSnapshot(workflowId: string): StoredSnapshot {
    const nodes = this.getNodesByWorkflow(workflowId);
    const edges = this.getEdgesByWorkflow(workflowId);
    let totalTokenUsage = 0;
    for (const node of nodes) {
      totalTokenUsage += node.tokenUsage;
    }
    return { nodes, edges, totalTokenUsage };
  }

  listWorkflows(): WorkflowSummary[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT workflowId, COUNT(*) as nodeCount, MIN(startedAt) as firstStartedAt FROM callgraph_nodes GROUP BY workflowId ORDER BY firstStartedAt DESC',
    );
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => ({
      workflowId: r.workflowId as string,
      nodeCount: r.nodeCount as number,
      firstStartedAt: r.firstStartedAt as number,
    }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
```

Update `packages/callgraph/src/index.ts`:

```typescript
export { CallgraphTracker } from './tracker.js';
export { CallgraphStore } from './store.js';
export type { StoredNode, StoredEdge, StoredSnapshot, WorkflowSummary } from './store.js';
export type {
  AgentNode,
  AgentNodeInput,
  AgentNodeUpdate,
  AgentStatus,
  CallgraphConfig,
  CallgraphEdge,
  CallgraphSnapshot,
} from './types.js';
```

**Step 3: Run tests**

Run: `cd packages/callgraph && npx vitest run tests/`
Expected: 11 tests passing (7 tracker + 4 store)

**Step 4: Commit**

```bash
git add packages/callgraph/
git commit -m "feat(callgraph): add CallgraphStore for SQLite persistence"
```

---

### Task 3: Event Bus — Core Pub/Sub with Agent-Keyed Storage

**Files:**
- Create: `packages/event-bus/package.json`
- Create: `packages/event-bus/tsconfig.json`
- Create: `packages/event-bus/src/types.ts`
- Create: `packages/event-bus/src/bus.ts`
- Create: `packages/event-bus/src/index.ts`
- Create: `packages/event-bus/tests/bus.test.ts`

**Context:** The event bus provides decoupled communication between all subsystems. Events are typed, have a source agent ID, and can be subscribed to by topic. The bus also maintains agent-keyed storage — a per-agent key-value store that allows subsystems to attach metadata to agents without direct coupling. This replaces ad-hoc inter-module communication with a centralized, observable channel.

**Step 1: Write the failing test**

Create `packages/event-bus/tests/bus.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/bus.js';

describe('EventBus', () => {
  it('publishes events and notifies subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe('agent.started', handler);
    bus.publish({ topic: 'agent.started', agentId: 'a1', payload: { name: 'coder' } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'agent.started', agentId: 'a1', payload: { name: 'coder' } }),
    );
  });

  it('supports wildcard subscriptions', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe('agent.*', handler);
    bus.publish({ topic: 'agent.started', agentId: 'a1', payload: {} });
    bus.publish({ topic: 'agent.completed', agentId: 'a1', payload: {} });
    bus.publish({ topic: 'workflow.started', agentId: 'w1', payload: {} });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes handlers', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe('test.event', handler);
    bus.publish({ topic: 'test.event', agentId: 'a1', payload: {} });
    unsub();
    bus.publish({ topic: 'test.event', agentId: 'a1', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('manages agent-keyed storage', () => {
    const bus = new EventBus();

    bus.setAgentData('agent-1', 'role', 'coder');
    bus.setAgentData('agent-1', 'depth', 2);
    bus.setAgentData('agent-2', 'role', 'reviewer');

    expect(bus.getAgentData('agent-1', 'role')).toBe('coder');
    expect(bus.getAgentData('agent-1', 'depth')).toBe(2);
    expect(bus.getAgentData('agent-2', 'role')).toBe('reviewer');
    expect(bus.getAgentData('agent-3', 'role')).toBeUndefined();
  });

  it('retrieves all data for an agent', () => {
    const bus = new EventBus();

    bus.setAgentData('agent-1', 'role', 'coder');
    bus.setAgentData('agent-1', 'status', 'running');

    const data = bus.getAllAgentData('agent-1');
    expect(data).toEqual({ role: 'coder', status: 'running' });
  });

  it('clears agent data', () => {
    const bus = new EventBus();

    bus.setAgentData('agent-1', 'role', 'coder');
    bus.clearAgentData('agent-1');

    expect(bus.getAgentData('agent-1', 'role')).toBeUndefined();
  });

  it('returns event history', () => {
    const bus = new EventBus({ maxHistory: 3 });

    bus.publish({ topic: 'e1', agentId: 'a', payload: {} });
    bus.publish({ topic: 'e2', agentId: 'a', payload: {} });
    bus.publish({ topic: 'e3', agentId: 'a', payload: {} });
    bus.publish({ topic: 'e4', agentId: 'a', payload: {} });

    const history = bus.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].topic).toBe('e2');
  });

  it('filters history by agent', () => {
    const bus = new EventBus();

    bus.publish({ topic: 'e1', agentId: 'a1', payload: {} });
    bus.publish({ topic: 'e2', agentId: 'a2', payload: {} });
    bus.publish({ topic: 'e3', agentId: 'a1', payload: {} });

    const history = bus.getHistory({ agentId: 'a1' });
    expect(history).toHaveLength(2);
  });
});
```

**Step 2: Make the test pass**

Create `packages/event-bus/src/types.ts`:

```typescript
export interface BusEvent {
  topic: string;
  agentId: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

export interface StoredEvent extends BusEvent {
  timestamp: number;
}

export type EventHandler = (event: StoredEvent) => void;

export interface EventBusConfig {
  maxHistory?: number;
}

export interface HistoryFilter {
  agentId?: string;
  topic?: string;
}
```

Create `packages/event-bus/src/bus.ts`:

```typescript
import type { BusEvent, StoredEvent, EventHandler, EventBusConfig, HistoryFilter } from './types.js';

interface Subscription {
  pattern: string;
  handler: EventHandler;
}

export class EventBus {
  private readonly subscriptions: Subscription[] = [];
  private readonly history: StoredEvent[] = [];
  private readonly agentData = new Map<string, Map<string, unknown>>();
  private readonly maxHistory: number;

  constructor(config?: EventBusConfig) {
    this.maxHistory = config?.maxHistory ?? 1000;
  }

  subscribe(topicPattern: string, handler: EventHandler): () => void {
    const sub: Subscription = { pattern: topicPattern, handler };
    this.subscriptions.push(sub);
    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) this.subscriptions.splice(idx, 1);
    };
  }

  publish(event: BusEvent): void {
    const stored: StoredEvent = { ...event, timestamp: event.timestamp ?? Date.now() };

    this.history.push(stored);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    for (const sub of this.subscriptions) {
      if (this.matches(sub.pattern, stored.topic)) {
        sub.handler(stored);
      }
    }
  }

  setAgentData(agentId: string, key: string, value: unknown): void {
    let data = this.agentData.get(agentId);
    if (!data) {
      data = new Map();
      this.agentData.set(agentId, data);
    }
    data.set(key, value);
  }

  getAgentData(agentId: string, key: string): unknown {
    return this.agentData.get(agentId)?.get(key);
  }

  getAllAgentData(agentId: string): Record<string, unknown> {
    const data = this.agentData.get(agentId);
    if (!data) return {};
    return Object.fromEntries(data);
  }

  clearAgentData(agentId: string): void {
    this.agentData.delete(agentId);
  }

  getHistory(filter?: HistoryFilter): StoredEvent[] {
    let result = [...this.history];
    if (filter?.agentId) {
      result = result.filter((e) => e.agentId === filter.agentId);
    }
    if (filter?.topic) {
      result = result.filter((e) => e.topic === filter.topic);
    }
    return result;
  }

  private matches(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return topic.startsWith(prefix + '.');
    }
    if (pattern === '*') return true;
    return false;
  }
}
```

Create `packages/event-bus/src/index.ts`:

```typescript
export { EventBus } from './bus.js';
export type { BusEvent, StoredEvent, EventHandler, EventBusConfig, HistoryFilter } from './types.js';
```

Create `packages/event-bus/package.json`:

```json
{
  "name": "@auxiora/event-bus",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `packages/event-bus/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Run tests**

Run: `cd packages/event-bus && npx vitest run tests/bus.test.ts`
Expected: 8 tests passing

**Step 4: Commit**

```bash
git add packages/event-bus/
git commit -m "feat(event-bus): add EventBus with pub/sub and agent-keyed storage"
```

---

### Task 4: Event Bus Store — SQLite Event Log

**Files:**
- Create: `packages/event-bus/src/event-store.ts`
- Modify: `packages/event-bus/src/index.ts`
- Create: `packages/event-bus/tests/event-store.test.ts`

**Context:** Persists events to SQLite for historical queries, debugging, and analytics. The in-memory EventBus handles real-time pub/sub; the EventStore provides durable history. Follows the same WAL pattern as all other stores.

**Step 1: Write the failing test**

Create `packages/event-bus/tests/event-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { EventStore } from '../src/event-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('EventStore', () => {
  let store: EventStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves events', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    store.record({ topic: 'agent.started', agentId: 'a1', payload: { name: 'coder' }, timestamp: 1000 });
    store.record({ topic: 'agent.completed', agentId: 'a1', payload: { result: 'done' }, timestamp: 2000 });

    const events = store.getByAgent('a1');
    expect(events).toHaveLength(2);
    expect(events[0].topic).toBe('agent.started');
    expect(events[1].topic).toBe('agent.completed');
  });

  it('filters by topic prefix', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    store.record({ topic: 'agent.started', agentId: 'a1', payload: {}, timestamp: 1000 });
    store.record({ topic: 'workflow.started', agentId: 'w1', payload: {}, timestamp: 2000 });
    store.record({ topic: 'agent.completed', agentId: 'a1', payload: {}, timestamp: 3000 });

    const agentEvents = store.getByTopicPrefix('agent.');
    expect(agentEvents).toHaveLength(2);
  });

  it('retrieves recent events with limit', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    for (let i = 0; i < 10; i++) {
      store.record({ topic: 'tick', agentId: 'a1', payload: { i }, timestamp: i * 1000 });
    }

    const recent = store.getRecent(3);
    expect(recent).toHaveLength(3);
    expect((recent[0].payload as Record<string, number>).i).toBe(9);
  });

  it('counts events by topic', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ebs-'));
    store = new EventStore(join(tmpDir, 'events.db'));

    store.record({ topic: 'agent.started', agentId: 'a1', payload: {}, timestamp: 1000 });
    store.record({ topic: 'agent.started', agentId: 'a2', payload: {}, timestamp: 2000 });
    store.record({ topic: 'agent.completed', agentId: 'a1', payload: {}, timestamp: 3000 });

    const counts = store.countByTopic();
    expect(counts).toContainEqual({ topic: 'agent.started', count: 2 });
    expect(counts).toContainEqual({ topic: 'agent.completed', count: 1 });
  });
});
```

**Step 2: Make the test pass**

Create `packages/event-bus/src/event-store.ts`:

```typescript
import { DatabaseSync } from 'node:sqlite';
import type { StoredEvent } from './types.js';

export interface TopicCount {
  topic: string;
  count: number;
}

export class EventStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA busy_timeout=5000');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS bus_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        agentId TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_events_agent ON bus_events (agentId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_events_topic ON bus_events (topic)');
  }

  record(event: StoredEvent): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT INTO bus_events (topic, agentId, payload, timestamp) VALUES (?, ?, ?, ?)',
    );
    stmt.run(event.topic, event.agentId, JSON.stringify(event.payload), event.timestamp);
  }

  getByAgent(agentId: string): StoredEvent[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM bus_events WHERE agentId = ? ORDER BY timestamp ASC');
    return this.mapRows(stmt.all(agentId) as Record<string, unknown>[]);
  }

  getByTopicPrefix(prefix: string): StoredEvent[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM bus_events WHERE topic LIKE ? ORDER BY timestamp ASC');
    return this.mapRows(stmt.all(prefix + '%') as Record<string, unknown>[]);
  }

  getRecent(limit = 50): StoredEvent[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM bus_events ORDER BY timestamp DESC LIMIT ?');
    return this.mapRows(stmt.all(limit) as Record<string, unknown>[]);
  }

  countByTopic(): TopicCount[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT topic, COUNT(*) as count FROM bus_events GROUP BY topic ORDER BY count DESC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => ({ topic: r.topic as string, count: r.count as number }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRows(rows: Record<string, unknown>[]): StoredEvent[] {
    return rows.map((r) => ({
      topic: r.topic as string,
      agentId: r.agentId as string,
      payload: JSON.parse(r.payload as string) as Record<string, unknown>,
      timestamp: r.timestamp as number,
    }));
  }
}
```

Update `packages/event-bus/src/index.ts`:

```typescript
export { EventBus } from './bus.js';
export { EventStore } from './event-store.js';
export type { TopicCount } from './event-store.js';
export type { BusEvent, StoredEvent, EventHandler, EventBusConfig, HistoryFilter } from './types.js';
```

**Step 3: Run tests**

Run: `cd packages/event-bus && npx vitest run tests/`
Expected: 12 tests passing (8 bus + 4 store)

**Step 4: Commit**

```bash
git add packages/event-bus/
git commit -m "feat(event-bus): add EventStore for SQLite event persistence"
```

---

### Task 5: Active LLM Overseer — LLM-Based Assessment

**Files:**
- Create: `packages/overseer/src/llm-overseer.ts`
- Modify: `packages/overseer/src/types.ts`
- Modify: `packages/overseer/src/index.ts`
- Create: `packages/overseer/tests/llm-overseer.test.ts`

**Context:** The Active LLM Overseer wraps the existing heuristic `OverseerMonitor` and adds LLM-based judgment. When the heuristic monitor detects an alert, the LLM overseer can optionally assess the situation more deeply using an LLM call to determine severity, suggest interventions, and decide whether to inject a notification into the agent's context or cancel the task entirely.

The LLM is injected as a structural type (`LLMCallerLike`) so this package has zero cross-package imports. When no LLM is available, the overseer falls back to heuristic-only mode.

**Step 1: Write the failing test**

Create `packages/overseer/tests/llm-overseer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ActiveOverseer } from '../src/llm-overseer.js';
import type { AgentSnapshot, OverseerConfig } from '../src/types.js';

const defaultConfig: OverseerConfig = {
  loopThreshold: 3,
  stallTimeoutMs: 30_000,
  maxTokenBudget: 50_000,
  checkIntervalMs: 5_000,
};

const makeSnapshot = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot => ({
  agentId: 'test-agent',
  toolCalls: [],
  tokenUsage: 0,
  lastActivityAt: Date.now(),
  startedAt: Date.now() - 10_000,
  ...overrides,
});

describe('ActiveOverseer', () => {
  it('returns heuristic alerts when no LLM is provided', async () => {
    const overseer = new ActiveOverseer(defaultConfig);

    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'read', timestamp: 3 },
      ],
    });

    const result = await overseer.assess(snapshot);
    expect(result.heuristicAlerts.length).toBeGreaterThan(0);
    expect(result.llmAssessment).toBeUndefined();
    expect(result.action).toBe('alert');
  });

  it('calls LLM for assessment when provided and heuristic triggers', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      severity: 'critical',
      reasoning: 'Agent is stuck in a read loop',
      suggestedAction: 'cancel',
      notification: 'You appear to be repeating the same action. Please try a different approach.',
    });

    const overseer = new ActiveOverseer(defaultConfig, { assessWithLLM: mockLLM });

    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'read', timestamp: 3 },
      ],
    });

    const result = await overseer.assess(snapshot);
    expect(mockLLM).toHaveBeenCalledTimes(1);
    expect(result.llmAssessment).toBeDefined();
    expect(result.llmAssessment?.suggestedAction).toBe('cancel');
    expect(result.action).toBe('cancel');
    expect(result.notification).toBe('You appear to be repeating the same action. Please try a different approach.');
  });

  it('skips LLM when heuristic finds no issues', async () => {
    const mockLLM = vi.fn();
    const overseer = new ActiveOverseer(defaultConfig, { assessWithLLM: mockLLM });

    const snapshot = makeSnapshot();
    const result = await overseer.assess(snapshot);

    expect(mockLLM).not.toHaveBeenCalled();
    expect(result.heuristicAlerts).toHaveLength(0);
    expect(result.action).toBe('none');
  });

  it('falls back to heuristic action when LLM fails', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    const overseer = new ActiveOverseer(defaultConfig, { assessWithLLM: mockLLM });

    const snapshot = makeSnapshot({
      tokenUsage: 60_000,
    });

    const result = await overseer.assess(snapshot);
    expect(result.heuristicAlerts.length).toBeGreaterThan(0);
    expect(result.llmAssessment).toBeUndefined();
    expect(result.action).toBe('alert');
  });

  it('records assessments in history', async () => {
    const overseer = new ActiveOverseer(defaultConfig);

    await overseer.assess(makeSnapshot({ tokenUsage: 60_000 }));
    await overseer.assess(makeSnapshot());

    const history = overseer.getAssessmentHistory();
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe('alert');
    expect(history[1].action).toBe('none');
  });
});
```

**Step 2: Make the test pass**

Update `packages/overseer/src/types.ts` — add these types at the end:

```typescript
// (keep all existing types above)

export type OverseerAction = 'none' | 'alert' | 'notify' | 'cancel';

export interface LLMAssessment {
  severity: 'warning' | 'critical';
  reasoning: string;
  suggestedAction: OverseerAction;
  notification?: string;
}

export interface AssessmentResult {
  agentId: string;
  heuristicAlerts: OverseerAlert[];
  llmAssessment?: LLMAssessment;
  action: OverseerAction;
  notification?: string;
  assessedAt: number;
}

export interface LLMCallerLike {
  assessWithLLM(alerts: OverseerAlert[], snapshot: AgentSnapshot): Promise<LLMAssessment>;
}
```

Create `packages/overseer/src/llm-overseer.ts`:

```typescript
import { OverseerMonitor } from './monitor.js';
import type {
  OverseerConfig,
  AgentSnapshot,
  OverseerAlert,
  AssessmentResult,
  LLMAssessment,
  LLMCallerLike,
  OverseerAction,
} from './types.js';

export class ActiveOverseer {
  private readonly monitor: OverseerMonitor;
  private readonly llmCaller?: LLMCallerLike;
  private readonly history: AssessmentResult[] = [];

  constructor(config: OverseerConfig, llmCaller?: LLMCallerLike) {
    this.monitor = new OverseerMonitor(config);
    this.llmCaller = llmCaller;
  }

  async assess(snapshot: AgentSnapshot): Promise<AssessmentResult> {
    const heuristicAlerts = this.monitor.analyze(snapshot);

    let llmAssessment: LLMAssessment | undefined;
    let action: OverseerAction = 'none';
    let notification: string | undefined;

    if (heuristicAlerts.length > 0) {
      action = 'alert';

      if (this.llmCaller) {
        try {
          llmAssessment = await this.llmCaller.assessWithLLM(heuristicAlerts, snapshot);
          action = llmAssessment.suggestedAction;
          notification = llmAssessment.notification;
        } catch {
          // LLM failed — fall back to heuristic action
        }
      }
    }

    const result: AssessmentResult = {
      agentId: snapshot.agentId,
      heuristicAlerts,
      llmAssessment,
      action,
      notification,
      assessedAt: Date.now(),
    };

    this.history.push(result);
    return result;
  }

  getAssessmentHistory(): AssessmentResult[] {
    return [...this.history];
  }
}
```

Update `packages/overseer/src/index.ts`:

```typescript
export { AlertStore } from './alert-store.js';
export type { StoredAlert } from './alert-store.js';
export { OverseerMonitor } from './monitor.js';
export { ActiveOverseer } from './llm-overseer.js';
export type {
  AgentSnapshot,
  AlertType,
  AssessmentResult,
  LLMAssessment,
  LLMCallerLike,
  OverseerAction,
  OverseerAlert,
  OverseerConfig,
  ToolCall,
} from './types.js';
```

**Step 3: Run tests**

Run: `cd packages/overseer && npx vitest run tests/`
Expected: All tests passing (existing 9 + 5 new = 14 total)

**Step 4: Commit**

```bash
git add packages/overseer/
git commit -m "feat(overseer): add ActiveOverseer with LLM-based assessment"
```

---

### Task 6: LLM Assessment Store — Persistent Assessment History

**Files:**
- Create: `packages/overseer/src/assessment-store.ts`
- Modify: `packages/overseer/src/index.ts`
- Create: `packages/overseer/tests/assessment-store.test.ts`

**Context:** Persists LLM overseer assessment results to SQLite so they can be queried for dashboards, debugging, and trend analysis. Follows the same WAL pattern as AlertStore. Records both heuristic alerts and LLM assessments together.

**Step 1: Write the failing test**

Create `packages/overseer/tests/assessment-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { AssessmentStore } from '../src/assessment-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AssessmentResult } from '../src/types.js';

describe('AssessmentStore', () => {
  let store: AssessmentStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves assessments', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    const assessment: AssessmentResult = {
      agentId: 'agent-1',
      heuristicAlerts: [{ type: 'loop_detected', agentId: 'agent-1', message: 'loop', severity: 'warning', detectedAt: 1000 }],
      action: 'alert',
      assessedAt: Date.now(),
    };

    store.record(assessment);
    const results = store.getByAgent('agent-1');
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('alert');
    expect(results[0].heuristicAlerts).toHaveLength(1);
  });

  it('stores assessments with LLM data', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    const assessment: AssessmentResult = {
      agentId: 'agent-2',
      heuristicAlerts: [{ type: 'budget_exceeded', agentId: 'agent-2', message: 'over budget', severity: 'critical', detectedAt: 2000 }],
      llmAssessment: { severity: 'critical', reasoning: 'Agent has used too many tokens', suggestedAction: 'cancel', notification: 'Stop' },
      action: 'cancel',
      notification: 'Stop',
      assessedAt: Date.now(),
    };

    store.record(assessment);
    const results = store.getByAgent('agent-2');
    expect(results[0].llmAssessment?.reasoning).toBe('Agent has used too many tokens');
    expect(results[0].notification).toBe('Stop');
  });

  it('filters by action type', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    store.record({ agentId: 'a', heuristicAlerts: [], action: 'none', assessedAt: 1000 });
    store.record({ agentId: 'b', heuristicAlerts: [{ type: 'stall_detected', agentId: 'b', message: 'stall', severity: 'warning', detectedAt: 2000 }], action: 'alert', assessedAt: 2000 });
    store.record({ agentId: 'c', heuristicAlerts: [{ type: 'loop_detected', agentId: 'c', message: 'loop', severity: 'critical', detectedAt: 3000 }], action: 'cancel', assessedAt: 3000 });

    const cancels = store.getByAction('cancel');
    expect(cancels).toHaveLength(1);
    expect(cancels[0].agentId).toBe('c');
  });

  it('returns recent assessments with limit', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    for (let i = 0; i < 5; i++) {
      store.record({ agentId: `a${i}`, heuristicAlerts: [], action: 'none', assessedAt: i * 1000 });
    }

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].agentId).toBe('a4');
  });
});
```

**Step 2: Make the test pass**

Create `packages/overseer/src/assessment-store.ts`:

```typescript
import { DatabaseSync } from 'node:sqlite';
import type { AssessmentResult, OverseerAction, LLMAssessment, OverseerAlert } from './types.js';

export class AssessmentStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA busy_timeout=5000');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId TEXT NOT NULL,
        heuristicAlertsJson TEXT NOT NULL,
        llmAssessmentJson TEXT,
        action TEXT NOT NULL,
        notification TEXT,
        assessedAt INTEGER NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_assessments_agent ON assessments (agentId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_assessments_action ON assessments (action)');
  }

  record(result: AssessmentResult): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT INTO assessments (agentId, heuristicAlertsJson, llmAssessmentJson, action, notification, assessedAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      result.agentId,
      JSON.stringify(result.heuristicAlerts),
      result.llmAssessment ? JSON.stringify(result.llmAssessment) : null,
      result.action,
      result.notification ?? null,
      result.assessedAt,
    );
  }

  getByAgent(agentId: string): AssessmentResult[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM assessments WHERE agentId = ? ORDER BY assessedAt DESC');
    return this.mapRows(stmt.all(agentId) as Record<string, unknown>[]);
  }

  getByAction(action: OverseerAction): AssessmentResult[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM assessments WHERE action = ? ORDER BY assessedAt DESC');
    return this.mapRows(stmt.all(action) as Record<string, unknown>[]);
  }

  getRecent(limit = 50): AssessmentResult[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM assessments ORDER BY assessedAt DESC LIMIT ?');
    return this.mapRows(stmt.all(limit) as Record<string, unknown>[]);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRows(rows: Record<string, unknown>[]): AssessmentResult[] {
    return rows.map((r) => ({
      agentId: r.agentId as string,
      heuristicAlerts: JSON.parse(r.heuristicAlertsJson as string) as OverseerAlert[],
      llmAssessment: r.llmAssessmentJson ? (JSON.parse(r.llmAssessmentJson as string) as LLMAssessment) : undefined,
      action: r.action as OverseerAction,
      notification: (r.notification as string) || undefined,
      assessedAt: r.assessedAt as number,
    }));
  }
}
```

Update `packages/overseer/src/index.ts` — add:

```typescript
export { AlertStore } from './alert-store.js';
export type { StoredAlert } from './alert-store.js';
export { AssessmentStore } from './assessment-store.js';
export { OverseerMonitor } from './monitor.js';
export { ActiveOverseer } from './llm-overseer.js';
export type {
  AgentSnapshot,
  AlertType,
  AssessmentResult,
  LLMAssessment,
  LLMCallerLike,
  OverseerAction,
  OverseerAlert,
  OverseerConfig,
  ToolCall,
} from './types.js';
```

**Step 3: Run tests**

Run: `cd packages/overseer && npx vitest run tests/`
Expected: All tests passing (14 existing + 4 new = 18 total)

**Step 4: Commit**

```bash
git add packages/overseer/
git commit -m "feat(overseer): add AssessmentStore for persistent LLM assessment history"
```

---

### Task 7: Meta-Improvement Reasoning Structure — Steps + Proposals

**Files:**
- Create: `packages/reasoning/src/meta-improvement.ts`
- Create: `packages/reasoning/src/improvement-types.ts`
- Modify: `packages/reasoning/src/index.ts`
- Create: `packages/reasoning/tests/meta-improvement.test.ts`

**Context:** The meta-improvement reasoning structure defines a fixed sequence of steps that guide the system through self-modification: observe (collect performance data) → reflect (identify patterns) → hypothesize (propose changes) → validate (test proposals). It uses the existing `StepRegistry` and `StepToolGenerator` to provide ephemeral tools for each step. The output of each step feeds into the next, building up an `ImprovementProposal` that can be reviewed before applying.

**Step 1: Write the failing test**

Create `packages/reasoning/tests/meta-improvement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MetaImprovementStructure } from '../src/meta-improvement.js';
import type { ImprovementProposal } from '../src/improvement-types.js';

describe('MetaImprovementStructure', () => {
  it('creates a 4-step reasoning structure', () => {
    const meta = new MetaImprovementStructure();
    const progress = meta.getProgress();

    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(0);
    expect(meta.getCurrentStepName()).toBe('observe');
  });

  it('progresses through steps in order', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', {
      metrics: { accuracy: 0.85, latency_p50: 200 },
      anomalies: ['High error rate on code reviews'],
    });
    expect(meta.getCurrentStepName()).toBe('reflect');

    meta.completeStep('reflect', {
      patterns: ['Code review errors correlate with long inputs'],
      rootCauses: ['Context window truncation on large diffs'],
    });
    expect(meta.getCurrentStepName()).toBe('hypothesize');

    meta.completeStep('hypothesize', {
      proposals: [
        { change: 'Chunk large diffs before review', confidence: 0.8 },
        { change: 'Increase context window budget', confidence: 0.6 },
      ],
    });
    expect(meta.getCurrentStepName()).toBe('validate');
  });

  it('builds improvement proposal from step outputs', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', { metrics: { accuracy: 0.85 } });
    meta.completeStep('reflect', { patterns: ['Error on long inputs'] });
    meta.completeStep('hypothesize', {
      proposals: [{ change: 'Chunk inputs', confidence: 0.8 }],
    });
    meta.completeStep('validate', {
      testResults: [{ proposal: 'Chunk inputs', passed: true, improvement: 0.12 }],
    });

    expect(meta.isComplete()).toBe(true);
    const proposal = meta.buildProposal();
    expect(proposal).toBeDefined();
    expect(proposal!.observations).toBeDefined();
    expect(proposal!.reflections).toBeDefined();
    expect(proposal!.hypotheses).toBeDefined();
    expect(proposal!.validations).toBeDefined();
    expect(proposal!.status).toBe('pending_review');
  });

  it('generates tools for the current step', () => {
    const meta = new MetaImprovementStructure();
    const tools = meta.getCurrentTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toContain('observe');
  });

  it('returns empty tools when all steps are complete', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', { metrics: {} });
    meta.completeStep('reflect', { patterns: [] });
    meta.completeStep('hypothesize', { proposals: [] });
    meta.completeStep('validate', { testResults: [] });

    const tools = meta.getCurrentTools();
    expect(tools).toHaveLength(0);
  });

  it('rejects completing steps out of order', () => {
    const meta = new MetaImprovementStructure();

    expect(() => meta.completeStep('reflect', { patterns: [] })).toThrow();
  });

  it('provides step descriptions for LLM context', () => {
    const meta = new MetaImprovementStructure();
    const descriptions = meta.getStepDescriptions();

    expect(descriptions).toHaveLength(4);
    expect(descriptions[0].name).toBe('observe');
    expect(descriptions[0].description).toBeTruthy();
  });
});
```

**Step 2: Make the test pass**

Create `packages/reasoning/src/improvement-types.ts`:

```typescript
export interface ImprovementProposal {
  observations: Record<string, unknown>;
  reflections: Record<string, unknown>;
  hypotheses: Record<string, unknown>;
  validations: Record<string, unknown>;
  status: 'pending_review' | 'approved' | 'rejected' | 'applied';
  createdAt: number;
}

export interface StepDescription {
  name: string;
  description: string;
  order: number;
  required: boolean;
}
```

Create `packages/reasoning/src/meta-improvement.ts`:

```typescript
import { StepRegistry } from './step-registry.js';
import { StepToolGenerator } from './step-tools.js';
import type { ReasoningStep } from './types.js';
import type { ImprovementProposal, StepDescription } from './improvement-types.js';

const META_STEPS: ReasoningStep[] = [
  {
    name: 'observe',
    description: 'Collect performance metrics, error rates, and anomalies from recent operations. Output should include numeric metrics and notable anomalies.',
    order: 1,
    required: true,
  },
  {
    name: 'reflect',
    description: 'Analyze observations to identify patterns, correlations, and root causes. Output should include identified patterns and hypothesized root causes.',
    order: 2,
    required: true,
  },
  {
    name: 'hypothesize',
    description: 'Propose concrete changes based on reflections. Each proposal should include the change description and confidence level (0-1).',
    order: 3,
    required: true,
  },
  {
    name: 'validate',
    description: 'Test proposed changes against benchmarks or simulations. Output should include test results with pass/fail and measured improvement.',
    order: 4,
    required: true,
  },
];

export class MetaImprovementStructure {
  private readonly registry: StepRegistry;
  private readonly toolGenerator: StepToolGenerator;

  constructor() {
    this.registry = new StepRegistry([...META_STEPS]);
    this.toolGenerator = new StepToolGenerator(this.registry);
  }

  getCurrentStepName(): string | undefined {
    return this.registry.currentStep()?.name;
  }

  completeStep(name: string, output: Record<string, unknown>): void {
    if (!this.registry.isAvailable(name)) {
      throw new Error(`Step "${name}" is not available. Current step: ${this.getCurrentStepName()}`);
    }
    this.registry.complete(name, output);
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    return this.registry.progress();
  }

  isComplete(): boolean {
    return this.registry.isComplete();
  }

  getCurrentTools(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    run(args: Record<string, unknown>): Promise<{ success: boolean; data: Record<string, unknown> }>;
    getPermission(): string;
  }> {
    return this.toolGenerator.getCurrentTools();
  }

  buildProposal(): ImprovementProposal | undefined {
    if (!this.isComplete()) return undefined;
    const outputs = this.registry.getOutputs();

    return {
      observations: outputs.get('observe') ?? {},
      reflections: outputs.get('reflect') ?? {},
      hypotheses: outputs.get('hypothesize') ?? {},
      validations: outputs.get('validate') ?? {},
      status: 'pending_review',
      createdAt: Date.now(),
    };
  }

  getStepDescriptions(): StepDescription[] {
    return META_STEPS.map((s) => ({
      name: s.name,
      description: s.description,
      order: s.order,
      required: s.required,
    }));
  }
}
```

Update `packages/reasoning/src/index.ts`:

```typescript
export { StepRegistry } from './step-registry.js';
export { StepToolGenerator } from './step-tools.js';
export { MetaImprovementStructure } from './meta-improvement.js';
export type { ImprovementProposal, StepDescription } from './improvement-types.js';
export type { ReasoningStep, StepProgress, StepState, StepStatus } from './types.js';
```

**Step 3: Run tests**

Run: `cd packages/reasoning && npx vitest run tests/`
Expected: All tests passing (12 existing + 7 new = 19 total)

**Step 4: Commit**

```bash
git add packages/reasoning/
git commit -m "feat(reasoning): add MetaImprovementStructure for self-modification loop"
```

---

### Task 8: Improvement Store — Persistent Proposals

**Files:**
- Create: `packages/reasoning/src/improvement-store.ts`
- Modify: `packages/reasoning/src/index.ts`
- Create: `packages/reasoning/tests/improvement-store.test.ts`

**Context:** Persists improvement proposals to SQLite so the system can track its self-modification history, review pending proposals, and measure the effectiveness of applied changes over time. Follows the WAL pattern.

**Step 1: Write the failing test**

Create `packages/reasoning/tests/improvement-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { ImprovementStore } from '../src/improvement-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ImprovementProposal } from '../src/improvement-types.js';

describe('ImprovementStore', () => {
  let store: ImprovementStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves proposals', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    const proposal: ImprovementProposal = {
      observations: { accuracy: 0.85 },
      reflections: { patterns: ['error on long inputs'] },
      hypotheses: { proposals: [{ change: 'chunk inputs' }] },
      validations: { testResults: [{ passed: true }] },
      status: 'pending_review',
      createdAt: Date.now(),
    };

    const id = store.record(proposal);
    expect(id).toBeGreaterThan(0);

    const retrieved = store.getById(id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.status).toBe('pending_review');
    expect(retrieved!.observations).toEqual({ accuracy: 0.85 });
  });

  it('updates proposal status', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    const id = store.record({
      observations: {},
      reflections: {},
      hypotheses: {},
      validations: {},
      status: 'pending_review',
      createdAt: Date.now(),
    });

    store.updateStatus(id, 'approved');
    expect(store.getById(id)!.status).toBe('approved');

    store.updateStatus(id, 'applied');
    expect(store.getById(id)!.status).toBe('applied');
  });

  it('lists proposals by status', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    store.record({ observations: {}, reflections: {}, hypotheses: {}, validations: {}, status: 'pending_review', createdAt: 1000 });
    store.record({ observations: {}, reflections: {}, hypotheses: {}, validations: {}, status: 'approved', createdAt: 2000 });
    store.record({ observations: {}, reflections: {}, hypotheses: {}, validations: {}, status: 'pending_review', createdAt: 3000 });

    const pending = store.getByStatus('pending_review');
    expect(pending).toHaveLength(2);

    const approved = store.getByStatus('approved');
    expect(approved).toHaveLength(1);
  });

  it('returns recent proposals', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    for (let i = 0; i < 5; i++) {
      store.record({ observations: { i }, reflections: {}, hypotheses: {}, validations: {}, status: 'pending_review', createdAt: i * 1000 });
    }

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    expect((recent[0].observations as Record<string, number>).i).toBe(4);
  });
});
```

**Step 2: Make the test pass**

Create `packages/reasoning/src/improvement-store.ts`:

```typescript
import { DatabaseSync } from 'node:sqlite';
import type { ImprovementProposal } from './improvement-types.js';

export interface StoredProposal extends ImprovementProposal {
  id: number;
}

export class ImprovementStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA busy_timeout=5000');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS improvement_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observationsJson TEXT NOT NULL,
        reflectionsJson TEXT NOT NULL,
        hypothesesJson TEXT NOT NULL,
        validationsJson TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_proposals_status ON improvement_proposals (status)');
  }

  record(proposal: ImprovementProposal): number {
    if (this.closed) return -1;
    const stmt = this.db.prepare(
      'INSERT INTO improvement_proposals (observationsJson, reflectionsJson, hypothesesJson, validationsJson, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      JSON.stringify(proposal.observations),
      JSON.stringify(proposal.reflections),
      JSON.stringify(proposal.hypotheses),
      JSON.stringify(proposal.validations),
      proposal.status,
      proposal.createdAt,
    );
    const row = this.db.prepare('SELECT last_insert_rowid() as id').get() as Record<string, unknown>;
    return row.id as number;
  }

  getById(id: number): StoredProposal | undefined {
    if (this.closed) return undefined;
    const stmt = this.db.prepare('SELECT * FROM improvement_proposals WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  updateStatus(id: number, status: ImprovementProposal['status']): void {
    if (this.closed) return;
    const stmt = this.db.prepare('UPDATE improvement_proposals SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  getByStatus(status: ImprovementProposal['status']): StoredProposal[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM improvement_proposals WHERE status = ? ORDER BY createdAt DESC');
    return this.mapRows(stmt.all(status) as Record<string, unknown>[]);
  }

  getRecent(limit = 50): StoredProposal[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM improvement_proposals ORDER BY createdAt DESC LIMIT ?');
    return this.mapRows(stmt.all(limit) as Record<string, unknown>[]);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRows(rows: Record<string, unknown>[]): StoredProposal[] {
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(r: Record<string, unknown>): StoredProposal {
    return {
      id: r.id as number,
      observations: JSON.parse(r.observationsJson as string) as Record<string, unknown>,
      reflections: JSON.parse(r.reflectionsJson as string) as Record<string, unknown>,
      hypotheses: JSON.parse(r.hypothesesJson as string) as Record<string, unknown>,
      validations: JSON.parse(r.validationsJson as string) as Record<string, unknown>,
      status: r.status as ImprovementProposal['status'],
      createdAt: r.createdAt as number,
    };
  }
}
```

Update `packages/reasoning/src/index.ts`:

```typescript
export { StepRegistry } from './step-registry.js';
export { StepToolGenerator } from './step-tools.js';
export { MetaImprovementStructure } from './meta-improvement.js';
export { ImprovementStore } from './improvement-store.js';
export type { StoredProposal } from './improvement-store.js';
export type { ImprovementProposal, StepDescription } from './improvement-types.js';
export type { ReasoningStep, StepProgress, StepState, StepStatus } from './types.js';
```

**Step 3: Run tests**

Run: `cd packages/reasoning && npx vitest run tests/`
Expected: All tests passing (19 existing + 4 new = 23 total)

**Step 4: Commit**

```bash
git add packages/reasoning/
git commit -m "feat(reasoning): add ImprovementStore for persistent proposal tracking"
```

---

### Task 9: Integration Wiring Tests

**Files:**
- Create: `packages/runtime/tests/phase4-wiring.test.ts`
- Modify: `packages/runtime/package.json` (add devDependencies)

**Context:** Integration tests verifying that Phase 4 modules wire together correctly: callgraph tracker feeds event bus events, active overseer integrates with callgraph data, and meta-improvement structure produces proposals that can be stored. Uses structural typing — no mocking of internal details, just testing the public interfaces compose correctly.

**Step 1: Write the failing test**

Add to `packages/runtime/package.json` devDependencies:
```json
"@auxiora/callgraph": "workspace:*",
"@auxiora/event-bus": "workspace:*"
```
(Note: `@auxiora/overseer` and `@auxiora/reasoning` are already dev dependencies or can be added.)

Create `packages/runtime/tests/phase4-wiring.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { CallgraphTracker } from '@auxiora/callgraph';
import { EventBus } from '@auxiora/event-bus';
import { ActiveOverseer } from '@auxiora/overseer';
import { MetaImprovementStructure } from '@auxiora/reasoning';

describe('Phase 4 Integration Wiring', () => {
  it('callgraph events flow through event bus', () => {
    const bus = new EventBus();
    const tracker = new CallgraphTracker({ maxDepth: 5 });
    const received: unknown[] = [];

    bus.subscribe('callgraph.*', (event) => received.push(event));

    // Simulate: tracker adds agent then publishes event to bus
    tracker.addAgent({ id: 'root', name: 'supervisor', startedAt: Date.now() });
    bus.publish({ topic: 'callgraph.agent_added', agentId: 'root', payload: { name: 'supervisor', depth: 0 } });

    tracker.addAgent({ id: 'w1', name: 'coder', startedAt: Date.now(), parentId: 'root' });
    bus.publish({ topic: 'callgraph.edge_added', agentId: 'w1', payload: { parentId: 'root', childId: 'w1' } });

    expect(received).toHaveLength(2);
    expect(tracker.getNodes()).toHaveLength(2);
    expect(tracker.getEdges()).toHaveLength(1);
  });

  it('active overseer assessment triggers event bus notification', async () => {
    const bus = new EventBus();
    const notifications: unknown[] = [];
    bus.subscribe('overseer.*', (event) => notifications.push(event));

    const overseer = new ActiveOverseer({
      loopThreshold: 3,
      stallTimeoutMs: 30_000,
      maxTokenBudget: 50_000,
      checkIntervalMs: 5_000,
    });

    const result = await overseer.assess({
      agentId: 'agent-1',
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'read', timestamp: 3 },
      ],
      tokenUsage: 1000,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 5000,
    });

    if (result.action !== 'none') {
      bus.publish({
        topic: 'overseer.alert',
        agentId: result.agentId,
        payload: { action: result.action, alertCount: result.heuristicAlerts.length },
      });
    }

    expect(notifications).toHaveLength(1);
  });

  it('meta-improvement completes and produces storable proposal', () => {
    const meta = new MetaImprovementStructure();

    meta.completeStep('observe', { metrics: { accuracy: 0.85, error_rate: 0.15 } });
    meta.completeStep('reflect', { patterns: ['errors on long inputs'], rootCauses: ['context truncation'] });
    meta.completeStep('hypothesize', { proposals: [{ change: 'chunk inputs', confidence: 0.8 }] });
    meta.completeStep('validate', { testResults: [{ proposal: 'chunk inputs', passed: true, improvement: 0.12 }] });

    const proposal = meta.buildProposal();
    expect(proposal).toBeDefined();
    expect(proposal!.status).toBe('pending_review');

    // Verify proposal is JSON-serializable (required for ImprovementStore)
    const serialized = JSON.stringify(proposal);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.observations.metrics.accuracy).toBe(0.85);
    expect(deserialized.status).toBe('pending_review');
  });
});
```

**Step 2: Run tests**

Run: `cd packages/runtime && npx vitest run tests/phase4-wiring.test.ts`
Expected: 3 tests passing

**Step 3: Commit**

```bash
git add packages/runtime/tests/phase4-wiring.test.ts packages/runtime/package.json
git commit -m "test(runtime): add Phase 4 integration wiring tests"
```

---

### Task 10: Phase 4 Dashboard Routes

**Files:**
- Create: `packages/gateway/src/phase4-routes.ts`
- Modify: `packages/gateway/src/index.ts`
- Create: `packages/gateway/tests/phase4-routes.test.ts`

**Context:** Gateway routes for the Phase 4 dashboard, following the same pattern as `phase3-routes.ts`. Uses structural types (`FooLike` interfaces) to avoid importing Phase 4 packages. Provides endpoints for: callgraph snapshots, event history, overseer assessments, and improvement proposals.

**Step 1: Write the failing test**

Create `packages/gateway/tests/phase4-routes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mountPhase4Routes } from '../src/phase4-routes.js';
import type { Phase4Deps } from '../src/phase4-routes.js';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): void;
}

const makeRes = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
    },
  };
  return res;
};

describe('Phase 4 Routes', () => {
  it('GET /api/v1/callgraph/workflows lists workflows', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      callgraphStore: { listWorkflows: () => [{ workflowId: 'wf-1', nodeCount: 3, firstStartedAt: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/callgraph/workflows')!({}, res);

    expect(res.body).toEqual([{ workflowId: 'wf-1', nodeCount: 3, firstStartedAt: 1000 }]);
  });

  it('GET /api/v1/callgraph/snapshot returns workflow snapshot', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      callgraphStore: {
        listWorkflows: () => [],
        getSnapshot: (wfId: string) => ({ nodes: [{ id: 'r', name: 'root' }], edges: [], totalTokenUsage: 100 }),
      },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/callgraph/snapshot')!({ query: { workflowId: 'wf-1' } }, res);

    expect((res.body as Record<string, unknown>).totalTokenUsage).toBe(100);
  });

  it('GET /api/v1/events/recent returns recent events', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      eventStore: { getRecent: (limit: number) => [{ topic: 'test', agentId: 'a1', payload: {}, timestamp: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/events/recent')!({ query: {} }, res);

    expect(res.body).toHaveLength(1);
  });

  it('GET /api/v1/overseer/assessments returns recent assessments', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      assessmentStore: { getRecent: (limit: number) => [{ agentId: 'a1', action: 'alert', assessedAt: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/overseer/assessments')!({ query: {} }, res);

    expect(res.body).toHaveLength(1);
  });

  it('GET /api/v1/improvements/proposals returns proposals', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      improvementStore: { getRecent: (limit: number) => [{ id: 1, status: 'pending_review', createdAt: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/improvements/proposals')!({ query: {} }, res);

    expect(res.body).toHaveLength(1);
  });

  it('returns 503 when store is not available', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };

    mountPhase4Routes(app, {});
    const res = makeRes();
    routes.get('/api/v1/callgraph/workflows')!({}, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as Record<string, string>).error).toContain('not available');
  });
});
```

**Step 2: Make the test pass**

Create `packages/gateway/src/phase4-routes.ts`:

```typescript
// Structural types — avoids importing Phase 4 packages directly

interface CallgraphStoreLike {
  listWorkflows(): unknown[];
  getSnapshot(workflowId: string): unknown;
}

interface EventStoreLike {
  getRecent(limit: number): unknown[];
}

interface AssessmentStoreLike {
  getRecent(limit: number): unknown[];
}

interface ImprovementStoreLike {
  getRecent(limit: number): unknown[];
}

export interface Phase4Deps {
  callgraphStore?: CallgraphStoreLike;
  eventStore?: EventStoreLike;
  assessmentStore?: AssessmentStoreLike;
  improvementStore?: ImprovementStoreLike;
}

interface RequestLike {
  query?: Record<string, string>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(data: unknown): void;
}

interface AppLike {
  get(path: string, handler: (req: RequestLike, res: ResponseLike) => void): void;
}

export function mountPhase4Routes(app: AppLike, deps: Phase4Deps): void {
  app.get('/api/v1/callgraph/workflows', (_req: RequestLike, res: ResponseLike) => {
    if (!deps.callgraphStore) {
      res.status(503).json({ error: 'Callgraph store not available' });
      return;
    }
    try {
      res.json(deps.callgraphStore.listWorkflows());
    } catch {
      res.status(500).json({ error: 'Failed to list workflows' });
    }
  });

  app.get('/api/v1/callgraph/snapshot', (req: RequestLike, res: ResponseLike) => {
    if (!deps.callgraphStore) {
      res.status(503).json({ error: 'Callgraph store not available' });
      return;
    }
    try {
      const workflowId = req.query?.workflowId ?? '';
      res.json(deps.callgraphStore.getSnapshot(workflowId));
    } catch {
      res.status(500).json({ error: 'Failed to get snapshot' });
    }
  });

  app.get('/api/v1/events/recent', (req: RequestLike, res: ResponseLike) => {
    if (!deps.eventStore) {
      res.status(503).json({ error: 'Event store not available' });
      return;
    }
    try {
      const limit = parseInt(req.query?.limit ?? '50', 10);
      res.json(deps.eventStore.getRecent(limit));
    } catch {
      res.status(500).json({ error: 'Failed to get events' });
    }
  });

  app.get('/api/v1/overseer/assessments', (req: RequestLike, res: ResponseLike) => {
    if (!deps.assessmentStore) {
      res.status(503).json({ error: 'Assessment store not available' });
      return;
    }
    try {
      const limit = parseInt(req.query?.limit ?? '50', 10);
      res.json(deps.assessmentStore.getRecent(limit));
    } catch {
      res.status(500).json({ error: 'Failed to get assessments' });
    }
  });

  app.get('/api/v1/improvements/proposals', (req: RequestLike, res: ResponseLike) => {
    if (!deps.improvementStore) {
      res.status(503).json({ error: 'Improvement store not available' });
      return;
    }
    try {
      const limit = parseInt(req.query?.limit ?? '50', 10);
      res.json(deps.improvementStore.getRecent(limit));
    } catch {
      res.status(500).json({ error: 'Failed to get proposals' });
    }
  });
}
```

Update `packages/gateway/src/index.ts` — add export:

```typescript
export { mountPhase4Routes } from './phase4-routes.js';
export type { Phase4Deps } from './phase4-routes.js';
```

**Step 3: Run tests**

Run: `cd packages/gateway && npx vitest run tests/phase4-routes.test.ts`
Expected: 6 tests passing

**Step 4: Commit**

```bash
git add packages/gateway/src/phase4-routes.ts packages/gateway/src/index.ts packages/gateway/tests/phase4-routes.test.ts
git commit -m "feat(gateway): add Phase 4 dashboard routes"
```
