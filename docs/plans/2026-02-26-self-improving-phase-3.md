# Self-Improving System Phase 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an LLM-powered overseer, multi-agent review committee, guided reasoning structures, and a benchmark suite to give Auxiora autonomous quality control, structured decision-making, and measurable self-improvement.

**Architecture:** Four new capabilities built as independent packages with structural-type integration. The Overseer monitors agent activity asynchronously. The Review Committee runs parallel critic agents via OrchestrationEngine's debate pattern. Reasoning Structures inject ephemeral step-tools into the tool registry. The Benchmark Suite stores evaluation results in SQLite for trend analysis. All cross-package deps use structural `*Like` interfaces — no direct imports.

**Tech Stack:** TypeScript strict ESM, node:sqlite WAL, vitest, structural typing, OrchestrationEngine (debate pattern)

---

## Context

### Existing Modules (Phase 1 + 2)
- `packages/orchestrator/src/engine.ts` — OrchestrationEngine: 5 patterns (parallel, sequential, debate, map-reduce, supervisor), async generator yielding `AgentEvent`, `Semaphore` concurrency, `CostTrackerLike`, `WorkflowCheckpointHandler`
- `packages/orchestrator/src/types.ts` — `Workflow`, `AgentTask`, `AgentEvent`, `AgentResult`, `OrchestrationResult`, `OrchestrationPattern`
- `packages/orchestrator/src/circuit-breaker.ts` — `CircuitBreaker`: states (closed/open/half_open), `failureThreshold=3`, `cooldownMs=30000`
- `packages/tools/src/index.ts` — `Tool` interface (`name`, `description`, `parameters`, `invoke`, `getPermission`), `ToolRegistry` (`register/unregister/get/list`), `ToolRunner` with `ApprovalCallback`
- `packages/introspection/src/health-monitor.ts` — `HealthMonitorImpl`: polling checks, `AutoFixActions` callbacks, `HealthState`
- `packages/telemetry/src/tracker.ts` — TelemetryTracker: SQLite WAL, `recordTool()`, `recordJob()`, `getToolStats()`, `getJobStats()`
- `packages/telemetry/src/change-log.ts` — ChangeLog: append-only SQLite log with `record()`, `recordImpact()`, `getRecent()`
- `packages/telemetry/src/learning-store.ts` — LearningStore: `extractAndStore()`, `getRecent()`, deduplication
- `packages/job-queue/src/queue.ts` — JobQueue: EventEmitter (`job:completed`, `job:failed`, `job:dead`), polling, crash recovery
- `packages/runtime/src/enrichment/` — Pipeline with ordered stages, structural types for deps

### Key Patterns
- **Structural types**: Every cross-package dep uses a `FooLike` interface defined locally (no imports from other packages)
- **Enrichment stages**: `{ name, order, enabled(ctx), enrich(ctx, prompt) }` — constructor takes getter functions
- **SQLite stores**: WAL mode, `if (this.closed)` guards, `close()` method
- **All imports** use `.js` extensions; type imports use `type` keyword

---

### Task 1: Overseer — Core Monitor

**Files:**
- Create: `packages/overseer/src/monitor.ts`
- Create: `packages/overseer/src/types.ts`
- Create: `packages/overseer/tests/monitor.test.ts`
- Create: `packages/overseer/package.json`
- Create: `packages/overseer/tsconfig.json`
- Create: `packages/overseer/src/index.ts`

**Context:** The Overseer is a background supervisor that watches agent activity for anomalies: looping (same tool called repeatedly), stalling (no progress for N seconds), excessive token spend, and security violations. It uses heuristic checks (no LLM needed for detection) — the LLM is used only for generating human-readable explanations when an anomaly is found. This task builds the core detection engine.

**Step 1: Write the failing test**

Create `packages/overseer/tests/monitor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverseerMonitor } from '../src/monitor.js';
import type { OverseerConfig, AgentSnapshot, OverseerAlert } from '../src/types.js';

describe('OverseerMonitor', () => {
  let monitor: OverseerMonitor;
  const defaultConfig: OverseerConfig = {
    loopThreshold: 3,
    stallTimeoutMs: 10_000,
    maxTokenBudget: 50_000,
    checkIntervalMs: 1_000,
  };

  beforeEach(() => {
    monitor = new OverseerMonitor(defaultConfig);
  });

  it('detects tool call looping', () => {
    const snapshot: AgentSnapshot = {
      agentId: 'a1',
      toolCalls: [
        { tool: 'search', timestamp: 1 },
        { tool: 'search', timestamp: 2 },
        { tool: 'search', timestamp: 3 },
      ],
      tokenUsage: 1000,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 5000,
    };
    const alerts = monitor.analyze(snapshot);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('loop_detected');
    expect(alerts[0].agentId).toBe('a1');
  });

  it('detects stalling agent', () => {
    const snapshot: AgentSnapshot = {
      agentId: 'a2',
      toolCalls: [{ tool: 'read', timestamp: 1 }],
      tokenUsage: 500,
      lastActivityAt: Date.now() - 15_000,
      startedAt: Date.now() - 20_000,
    };
    const alerts = monitor.analyze(snapshot);
    expect(alerts.some(a => a.type === 'stall_detected')).toBe(true);
  });

  it('detects token budget exceeded', () => {
    const snapshot: AgentSnapshot = {
      agentId: 'a3',
      toolCalls: [],
      tokenUsage: 60_000,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 1000,
    };
    const alerts = monitor.analyze(snapshot);
    expect(alerts.some(a => a.type === 'budget_exceeded')).toBe(true);
  });

  it('returns empty for healthy agent', () => {
    const snapshot: AgentSnapshot = {
      agentId: 'a4',
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'write', timestamp: 2 },
      ],
      tokenUsage: 1000,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 1000,
    };
    const alerts = monitor.analyze(snapshot);
    expect(alerts).toHaveLength(0);
  });

  it('detects repeated consecutive tool pattern', () => {
    const snapshot: AgentSnapshot = {
      agentId: 'a5',
      toolCalls: [
        { tool: 'search', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'search', timestamp: 3 },
        { tool: 'read', timestamp: 4 },
        { tool: 'search', timestamp: 5 },
        { tool: 'read', timestamp: 6 },
      ],
      tokenUsage: 500,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 1000,
    };
    const alerts = monitor.analyze(snapshot);
    expect(alerts.some(a => a.type === 'loop_detected')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/overseer/tests/monitor.test.ts`
Expected: FAIL — module not found

**Step 3: Create package scaffolding**

Create `packages/overseer/package.json`:
```json
{
  "name": "@auxiora/overseer",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `packages/overseer/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

**Step 4: Write types**

Create `packages/overseer/src/types.ts`:
```typescript
export interface OverseerConfig {
  loopThreshold: number;
  stallTimeoutMs: number;
  maxTokenBudget: number;
  checkIntervalMs: number;
}

export interface ToolCall {
  tool: string;
  timestamp: number;
}

export interface AgentSnapshot {
  agentId: string;
  toolCalls: ToolCall[];
  tokenUsage: number;
  lastActivityAt: number;
  startedAt: number;
}

export type AlertType = 'loop_detected' | 'stall_detected' | 'budget_exceeded';

export interface OverseerAlert {
  type: AlertType;
  agentId: string;
  message: string;
  severity: 'warning' | 'critical';
  detectedAt: number;
}
```

**Step 5: Write minimal implementation**

Create `packages/overseer/src/monitor.ts`:
```typescript
import type { OverseerConfig, AgentSnapshot, OverseerAlert } from './types.js';

export class OverseerMonitor {
  constructor(private config: OverseerConfig) {}

  analyze(snapshot: AgentSnapshot): OverseerAlert[] {
    const alerts: OverseerAlert[] = [];
    const now = Date.now();

    // Check for consecutive same-tool loops
    const tools = snapshot.toolCalls.map(t => t.tool);
    if (tools.length >= this.config.loopThreshold) {
      // Check single-tool repetition
      const last = tools.slice(-this.config.loopThreshold);
      if (last.every(t => t === last[0])) {
        alerts.push({
          type: 'loop_detected',
          agentId: snapshot.agentId,
          message: `Tool "${last[0]}" called ${this.config.loopThreshold}+ times consecutively`,
          severity: 'warning',
          detectedAt: now,
        });
      }

      // Check repeating pattern (e.g. A,B,A,B,A,B)
      if (alerts.length === 0 && tools.length >= 4) {
        for (let patLen = 2; patLen <= 3; patLen++) {
          const reps = Math.floor(tools.length / patLen);
          if (reps >= this.config.loopThreshold) {
            const pattern = tools.slice(0, patLen);
            let matches = 0;
            for (let i = 0; i <= tools.length - patLen; i += patLen) {
              const chunk = tools.slice(i, i + patLen);
              if (chunk.every((t, j) => t === pattern[j])) matches++;
            }
            if (matches >= this.config.loopThreshold) {
              alerts.push({
                type: 'loop_detected',
                agentId: snapshot.agentId,
                message: `Repeating tool pattern [${pattern.join(', ')}] detected ${matches} times`,
                severity: 'warning',
                detectedAt: now,
              });
              break;
            }
          }
        }
      }
    }

    // Check for stalling
    const idleMs = now - snapshot.lastActivityAt;
    if (idleMs > this.config.stallTimeoutMs) {
      alerts.push({
        type: 'stall_detected',
        agentId: snapshot.agentId,
        message: `No activity for ${Math.round(idleMs / 1000)}s (threshold: ${this.config.stallTimeoutMs / 1000}s)`,
        severity: 'warning',
        detectedAt: now,
      });
    }

    // Check token budget
    if (snapshot.tokenUsage > this.config.maxTokenBudget) {
      alerts.push({
        type: 'budget_exceeded',
        agentId: snapshot.agentId,
        message: `Token usage ${snapshot.tokenUsage} exceeds budget ${this.config.maxTokenBudget}`,
        severity: 'critical',
        detectedAt: now,
      });
    }

    return alerts;
  }
}
```

Create `packages/overseer/src/index.ts`:
```typescript
export { OverseerMonitor } from './monitor.js';
export type { OverseerConfig, AgentSnapshot, OverseerAlert, AlertType, ToolCall } from './types.js';
```

**Step 6: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/overseer/tests/monitor.test.ts`
Expected: 5 tests PASS

**Step 7: Commit**

```bash
git add packages/overseer/
git commit -m "feat(overseer): add core anomaly detection monitor"
```

---

### Task 2: Overseer — Alert Store and Polling

**Files:**
- Create: `packages/overseer/src/alert-store.ts`
- Create: `packages/overseer/tests/alert-store.test.ts`
- Modify: `packages/overseer/src/index.ts` (add exports)

**Context:** Alerts need persistence so the dashboard can display them and trends can be analyzed. Uses SQLite WAL like all other stores. Also adds a polling supervisor that periodically collects snapshots and runs analysis.

**Step 1: Write the failing test**

Create `packages/overseer/tests/alert-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { AlertStore } from '../src/alert-store.js';
import type { OverseerAlert } from '../src/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('AlertStore', () => {
  let store: AlertStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves alerts', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'alerts-'));
    store = new AlertStore(join(tmpDir, 'alerts.db'));

    const alert: OverseerAlert = {
      type: 'loop_detected',
      agentId: 'a1',
      message: 'Tool search called 3+ times',
      severity: 'warning',
      detectedAt: Date.now(),
    };

    store.record(alert);
    const all = store.getRecent(10);
    expect(all).toHaveLength(1);
    expect(all[0].agentId).toBe('a1');
    expect(all[0].type).toBe('loop_detected');
  });

  it('filters by agent', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'alerts-'));
    store = new AlertStore(join(tmpDir, 'alerts.db'));

    store.record({ type: 'loop_detected', agentId: 'a1', message: 'm', severity: 'warning', detectedAt: 1 });
    store.record({ type: 'stall_detected', agentId: 'a2', message: 'm', severity: 'warning', detectedAt: 2 });

    const a1 = store.getByAgent('a1');
    expect(a1).toHaveLength(1);
    expect(a1[0].agentId).toBe('a1');
  });

  it('filters by severity', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'alerts-'));
    store = new AlertStore(join(tmpDir, 'alerts.db'));

    store.record({ type: 'loop_detected', agentId: 'a1', message: 'm', severity: 'warning', detectedAt: 1 });
    store.record({ type: 'budget_exceeded', agentId: 'a2', message: 'm', severity: 'critical', detectedAt: 2 });

    const critical = store.getBySeverity('critical');
    expect(critical).toHaveLength(1);
    expect(critical[0].type).toBe('budget_exceeded');
  });

  it('acknowledges alerts', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'alerts-'));
    store = new AlertStore(join(tmpDir, 'alerts.db'));

    store.record({ type: 'loop_detected', agentId: 'a1', message: 'm', severity: 'warning', detectedAt: 1 });
    const alerts = store.getRecent(10);
    store.acknowledge(alerts[0].id!);

    const unacked = store.getUnacknowledged();
    expect(unacked).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/overseer/tests/alert-store.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/overseer/src/alert-store.ts`:
```typescript
import { DatabaseSync } from 'node:sqlite';
import type { OverseerAlert } from './types.js';

interface StoredAlert extends OverseerAlert {
  id: number;
  acknowledged: boolean;
}

export class AlertStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      agentId TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      detectedAt INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    )`);
  }

  record(alert: OverseerAlert): void {
    if (this.closed) return;
    this.db.prepare(
      'INSERT INTO alerts (type, agentId, message, severity, detectedAt) VALUES (?, ?, ?, ?, ?)',
    ).run(alert.type, alert.agentId, alert.message, alert.severity, alert.detectedAt);
  }

  getRecent(limit: number): StoredAlert[] {
    if (this.closed) return [];
    return this.db
      .prepare('SELECT * FROM alerts ORDER BY detectedAt DESC LIMIT ?')
      .all(limit) as StoredAlert[];
  }

  getByAgent(agentId: string): StoredAlert[] {
    if (this.closed) return [];
    return this.db
      .prepare('SELECT * FROM alerts WHERE agentId = ? ORDER BY detectedAt DESC')
      .all(agentId) as StoredAlert[];
  }

  getBySeverity(severity: string): StoredAlert[] {
    if (this.closed) return [];
    return this.db
      .prepare('SELECT * FROM alerts WHERE severity = ? ORDER BY detectedAt DESC')
      .all(severity) as StoredAlert[];
  }

  getUnacknowledged(): StoredAlert[] {
    if (this.closed) return [];
    return this.db
      .prepare('SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY detectedAt DESC')
      .all() as StoredAlert[];
  }

  acknowledge(id: number): void {
    if (this.closed) return;
    this.db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
```

**Step 4: Update barrel export**

Add to `packages/overseer/src/index.ts`:
```typescript
export { AlertStore } from './alert-store.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/overseer/tests/alert-store.test.ts`
Expected: 4 tests PASS

**Step 6: Commit**

```bash
git add packages/overseer/
git commit -m "feat(overseer): add SQLite alert store with filtering and acknowledgment"
```

---

### Task 3: Review Committee — Critic Agents

**Files:**
- Create: `packages/review-committee/src/critic.ts`
- Create: `packages/review-committee/src/types.ts`
- Create: `packages/review-committee/tests/critic.test.ts`
- Create: `packages/review-committee/package.json`
- Create: `packages/review-committee/tsconfig.json`
- Create: `packages/review-committee/src/index.ts`

**Context:** The Review Committee runs multiple critic agents in parallel, each evaluating a proposal from a different perspective (security, performance, maintainability, correctness). Each critic produces structured feedback. This task builds the critic evaluation engine — no LLM calls, just the scoring/aggregation framework. Actual LLM integration will use OrchestrationEngine's debate pattern at wiring time.

**Step 1: Write the failing test**

Create `packages/review-committee/tests/critic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ReviewCommittee } from '../src/critic.js';
import type { CriticRole, CriticReview, ReviewProposal } from '../src/types.js';

describe('ReviewCommittee', () => {
  const roles: CriticRole[] = [
    { name: 'security', perspective: 'Check for security vulnerabilities', weight: 1.5 },
    { name: 'performance', perspective: 'Check for performance issues', weight: 1.0 },
    { name: 'maintainability', perspective: 'Check for code clarity', weight: 1.0 },
  ];

  it('aggregates reviews from multiple critics', () => {
    const committee = new ReviewCommittee(roles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 8, issues: [], approved: true },
      { critic: 'performance', score: 6, issues: [{ description: 'N+1 query', severity: 'warning' }], approved: true },
      { critic: 'maintainability', score: 9, issues: [], approved: true },
    ];
    const result = committee.aggregate(reviews);
    expect(result.approved).toBe(true);
    expect(result.weightedScore).toBeGreaterThan(0);
    expect(result.totalIssues).toBe(1);
  });

  it('rejects when any critic disapproves', () => {
    const committee = new ReviewCommittee(roles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 3, issues: [{ description: 'SQL injection', severity: 'critical' }], approved: false },
      { critic: 'performance', score: 8, issues: [], approved: true },
      { critic: 'maintainability', score: 7, issues: [], approved: true },
    ];
    const result = committee.aggregate(reviews);
    expect(result.approved).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toBe('security');
  });

  it('computes weighted average score', () => {
    const committee = new ReviewCommittee(roles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 10, issues: [], approved: true },
      { critic: 'performance', score: 5, issues: [], approved: true },
      { critic: 'maintainability', score: 5, issues: [], approved: true },
    ];
    // security: 10*1.5=15, perf: 5*1.0=5, maint: 5*1.0=5 => 25/3.5 ~ 7.14
    const result = committee.aggregate(reviews);
    expect(result.weightedScore).toBeCloseTo(7.14, 1);
  });

  it('collects all issues across critics', () => {
    const committee = new ReviewCommittee(roles);
    const reviews: CriticReview[] = [
      { critic: 'security', score: 5, issues: [{ description: 'XSS risk', severity: 'critical' }], approved: true },
      { critic: 'performance', score: 5, issues: [{ description: 'Missing index', severity: 'warning' }], approved: true },
      { critic: 'maintainability', score: 5, issues: [], approved: true },
    ];
    const result = committee.aggregate(reviews);
    expect(result.totalIssues).toBe(2);
    expect(result.allIssues).toHaveLength(2);
  });

  it('builds proposal from code diff context', () => {
    const committee = new ReviewCommittee(roles);
    const proposal = committee.createProposal({
      title: 'Add user auth',
      description: 'JWT-based authentication',
      changes: ['src/auth.ts', 'src/middleware.ts'],
    });
    expect(proposal.title).toBe('Add user auth');
    expect(proposal.changes).toHaveLength(2);
    expect(proposal.createdAt).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/review-committee/tests/critic.test.ts`
Expected: FAIL — module not found

**Step 3: Create package scaffolding**

Create `packages/review-committee/package.json`:
```json
{
  "name": "@auxiora/review-committee",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `packages/review-committee/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

**Step 4: Write types**

Create `packages/review-committee/src/types.ts`:
```typescript
export interface CriticRole {
  name: string;
  perspective: string;
  weight: number;
}

export interface ReviewIssue {
  description: string;
  severity: 'critical' | 'warning' | 'suggestion';
}

export interface CriticReview {
  critic: string;
  score: number;
  issues: ReviewIssue[];
  approved: boolean;
}

export interface ReviewProposal {
  title: string;
  description: string;
  changes: string[];
  createdAt: number;
}

export interface AggregatedReview {
  approved: boolean;
  weightedScore: number;
  totalIssues: number;
  allIssues: Array<ReviewIssue & { critic: string }>;
  blockers: string[];
  reviews: CriticReview[];
}
```

**Step 5: Write minimal implementation**

Create `packages/review-committee/src/critic.ts`:
```typescript
import type {
  CriticRole,
  CriticReview,
  ReviewProposal,
  AggregatedReview,
} from './types.js';

export class ReviewCommittee {
  constructor(private roles: CriticRole[]) {}

  aggregate(reviews: CriticReview[]): AggregatedReview {
    const roleMap = new Map(this.roles.map(r => [r.name, r]));
    const blockers = reviews.filter(r => !r.approved).map(r => r.critic);

    let weightedSum = 0;
    let totalWeight = 0;
    const allIssues: AggregatedReview['allIssues'] = [];

    for (const review of reviews) {
      const role = roleMap.get(review.critic);
      const weight = role?.weight ?? 1.0;
      weightedSum += review.score * weight;
      totalWeight += weight;

      for (const issue of review.issues) {
        allIssues.push({ ...issue, critic: review.critic });
      }
    }

    return {
      approved: blockers.length === 0,
      weightedScore: totalWeight > 0 ? weightedSum / totalWeight : 0,
      totalIssues: allIssues.length,
      allIssues,
      blockers,
      reviews,
    };
  }

  createProposal(input: { title: string; description: string; changes: string[] }): ReviewProposal {
    return {
      title: input.title,
      description: input.description,
      changes: input.changes,
      createdAt: Date.now(),
    };
  }

  getRoles(): CriticRole[] {
    return [...this.roles];
  }
}
```

Create `packages/review-committee/src/index.ts`:
```typescript
export { ReviewCommittee } from './critic.js';
export type {
  CriticRole,
  CriticReview,
  ReviewProposal,
  ReviewIssue,
  AggregatedReview,
} from './types.js';
```

**Step 6: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/review-committee/tests/critic.test.ts`
Expected: 5 tests PASS

**Step 7: Commit**

```bash
git add packages/review-committee/
git commit -m "feat(review-committee): add multi-critic aggregation engine"
```

---

### Task 4: Review Committee — Review Store

**Files:**
- Create: `packages/review-committee/src/review-store.ts`
- Create: `packages/review-committee/tests/review-store.test.ts`
- Modify: `packages/review-committee/src/index.ts` (add exports)

**Context:** Reviews need persistence for trend analysis and dashboard display. Stores the full aggregated review result with all critic feedback per proposal.

**Step 1: Write the failing test**

Create `packages/review-committee/tests/review-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { ReviewStore } from '../src/review-store.js';
import type { AggregatedReview } from '../src/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ReviewStore', () => {
  let store: ReviewStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves reviews', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reviews-'));
    store = new ReviewStore(join(tmpDir, 'reviews.db'));

    const review: AggregatedReview = {
      approved: true,
      weightedScore: 8.5,
      totalIssues: 0,
      allIssues: [],
      blockers: [],
      reviews: [{ critic: 'security', score: 8, issues: [], approved: true }],
    };

    store.record('Add auth', review);
    const all = store.getRecent(10);
    expect(all).toHaveLength(1);
    expect(all[0].proposalTitle).toBe('Add auth');
    expect(all[0].approved).toBe(true);
  });

  it('filters by approval status', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reviews-'));
    store = new ReviewStore(join(tmpDir, 'reviews.db'));

    store.record('Good PR', { approved: true, weightedScore: 9, totalIssues: 0, allIssues: [], blockers: [], reviews: [] });
    store.record('Bad PR', { approved: false, weightedScore: 3, totalIssues: 2, allIssues: [], blockers: ['security'], reviews: [] });

    const rejected = store.getByStatus(false);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].proposalTitle).toBe('Bad PR');
  });

  it('computes approval rate', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reviews-'));
    store = new ReviewStore(join(tmpDir, 'reviews.db'));

    store.record('PR1', { approved: true, weightedScore: 8, totalIssues: 0, allIssues: [], blockers: [], reviews: [] });
    store.record('PR2', { approved: true, weightedScore: 7, totalIssues: 0, allIssues: [], blockers: [], reviews: [] });
    store.record('PR3', { approved: false, weightedScore: 4, totalIssues: 1, allIssues: [], blockers: ['perf'], reviews: [] });

    const rate = store.getApprovalRate();
    expect(rate).toBeCloseTo(0.667, 2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/review-committee/tests/review-store.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/review-committee/src/review-store.ts`:
```typescript
import { DatabaseSync } from 'node:sqlite';
import type { AggregatedReview } from './types.js';

interface StoredReview {
  id: number;
  proposalTitle: string;
  approved: boolean;
  weightedScore: number;
  totalIssues: number;
  blockers: string;
  reviewsJson: string;
  createdAt: number;
}

export class ReviewStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposalTitle TEXT NOT NULL,
      approved INTEGER NOT NULL,
      weightedScore REAL NOT NULL,
      totalIssues INTEGER NOT NULL,
      blockers TEXT NOT NULL DEFAULT '[]',
      reviewsJson TEXT NOT NULL DEFAULT '[]',
      createdAt INTEGER NOT NULL
    )`);
  }

  record(proposalTitle: string, review: AggregatedReview): void {
    if (this.closed) return;
    this.db.prepare(
      'INSERT INTO reviews (proposalTitle, approved, weightedScore, totalIssues, blockers, reviewsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      proposalTitle,
      review.approved ? 1 : 0,
      review.weightedScore,
      review.totalIssues,
      JSON.stringify(review.blockers),
      JSON.stringify(review.reviews),
      Date.now(),
    );
  }

  getRecent(limit: number): StoredReview[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT * FROM reviews ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map(r => ({ ...r, approved: !!r.approved }));
  }

  getByStatus(approved: boolean): StoredReview[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT * FROM reviews WHERE approved = ? ORDER BY createdAt DESC')
      .all(approved ? 1 : 0) as any[];
    return rows.map(r => ({ ...r, approved: !!r.approved }));
  }

  getApprovalRate(): number {
    if (this.closed) return 0;
    const row = this.db.prepare(
      'SELECT COUNT(*) as total, SUM(approved) as approvedCount FROM reviews',
    ).get() as any;
    if (!row || row.total === 0) return 0;
    return Number(row.approvedCount) / row.total;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
```

**Step 4: Update barrel export**

Add to `packages/review-committee/src/index.ts`:
```typescript
export { ReviewStore } from './review-store.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/review-committee/tests/review-store.test.ts`
Expected: 3 tests PASS

**Step 6: Commit**

```bash
git add packages/review-committee/
git commit -m "feat(review-committee): add SQLite review persistence with approval metrics"
```

---

### Task 5: Reasoning Structures — Step Registry

**Files:**
- Create: `packages/reasoning/src/step-registry.ts`
- Create: `packages/reasoning/src/types.ts`
- Create: `packages/reasoning/tests/step-registry.test.ts`
- Create: `packages/reasoning/package.json`
- Create: `packages/reasoning/tsconfig.json`
- Create: `packages/reasoning/src/index.ts`

**Context:** Reasoning Structures enforce that an agent follows a defined sequence of steps before producing a final answer. Think of it as a state machine: step 1 must complete before step 2 becomes available. Each step is an ephemeral tool that validates its inputs, records its output, and unlocks the next step. This task builds the step registry and sequencing logic.

**Step 1: Write the failing test**

Create `packages/reasoning/tests/step-registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StepRegistry } from '../src/step-registry.js';
import type { ReasoningStep } from '../src/types.js';

describe('StepRegistry', () => {
  const steps: ReasoningStep[] = [
    { name: 'analyze', description: 'Analyze the problem', order: 1, required: true },
    { name: 'plan', description: 'Create a plan', order: 2, required: true },
    { name: 'validate', description: 'Validate the plan', order: 3, required: false },
    { name: 'apply', description: 'Apply the plan', order: 4, required: true },
  ];

  it('tracks step completion in order', () => {
    const registry = new StepRegistry(steps);
    expect(registry.currentStep()?.name).toBe('analyze');
    expect(registry.isAvailable('analyze')).toBe(true);
    expect(registry.isAvailable('plan')).toBe(false);

    registry.complete('analyze', { result: 'Problem understood' });
    expect(registry.currentStep()?.name).toBe('plan');
    expect(registry.isAvailable('plan')).toBe(true);
  });

  it('allows skipping optional steps', () => {
    const registry = new StepRegistry(steps);
    registry.complete('analyze', { result: 'done' });
    registry.complete('plan', { result: 'done' });

    // validate is optional — can skip to apply
    expect(registry.isAvailable('validate')).toBe(true);
    expect(registry.canSkip('validate')).toBe(true);

    registry.skip('validate');
    expect(registry.currentStep()?.name).toBe('apply');
  });

  it('rejects out-of-order completion', () => {
    const registry = new StepRegistry(steps);
    expect(() => registry.complete('plan', {})).toThrow(/not available/);
  });

  it('rejects skipping required steps', () => {
    const registry = new StepRegistry(steps);
    expect(() => registry.skip('analyze')).toThrow(/required/);
  });

  it('reports overall progress', () => {
    const registry = new StepRegistry(steps);
    expect(registry.progress()).toEqual({ completed: 0, total: 4, percentage: 0 });

    registry.complete('analyze', {});
    expect(registry.progress()).toEqual({ completed: 1, total: 4, percentage: 25 });
  });

  it('reports completion when all required steps done', () => {
    const registry = new StepRegistry(steps);
    registry.complete('analyze', {});
    registry.complete('plan', {});
    registry.skip('validate');
    registry.complete('apply', {});
    expect(registry.isComplete()).toBe(true);
  });

  it('collects outputs from all completed steps', () => {
    const registry = new StepRegistry(steps);
    registry.complete('analyze', { finding: 'A' });
    registry.complete('plan', { steps: ['1', '2'] });
    const outputs = registry.getOutputs();
    expect(outputs.get('analyze')).toEqual({ finding: 'A' });
    expect(outputs.get('plan')).toEqual({ steps: ['1', '2'] });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/reasoning/tests/step-registry.test.ts`
Expected: FAIL — module not found

**Step 3: Create package scaffolding**

Create `packages/reasoning/package.json`:
```json
{
  "name": "@auxiora/reasoning",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `packages/reasoning/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

**Step 4: Write types**

Create `packages/reasoning/src/types.ts`:
```typescript
export interface ReasoningStep {
  name: string;
  description: string;
  order: number;
  required: boolean;
}

export type StepStatus = 'pending' | 'available' | 'completed' | 'skipped';

export interface StepState {
  step: ReasoningStep;
  status: StepStatus;
  output?: Record<string, unknown>;
  completedAt?: number;
}

export interface StepProgress {
  completed: number;
  total: number;
  percentage: number;
}
```

**Step 5: Write minimal implementation**

Create `packages/reasoning/src/step-registry.ts`:
```typescript
import type { ReasoningStep, StepState, StepProgress } from './types.js';

export class StepRegistry {
  private states: Map<string, StepState>;
  private ordered: ReasoningStep[];

  constructor(steps: ReasoningStep[]) {
    this.ordered = [...steps].sort((a, b) => a.order - b.order);
    this.states = new Map();
    for (const step of this.ordered) {
      this.states.set(step.name, { step, status: 'pending' });
    }
    // First step is available
    if (this.ordered.length > 0) {
      this.states.get(this.ordered[0].name)!.status = 'available';
    }
  }

  currentStep(): ReasoningStep | undefined {
    for (const step of this.ordered) {
      const state = this.states.get(step.name)!;
      if (state.status === 'available') return step;
    }
    return undefined;
  }

  isAvailable(name: string): boolean {
    return this.states.get(name)?.status === 'available';
  }

  canSkip(name: string): boolean {
    const state = this.states.get(name);
    return !!state && !state.step.required && state.status === 'available';
  }

  complete(name: string, output: Record<string, unknown>): void {
    const state = this.states.get(name);
    if (!state || state.status !== 'available') {
      throw new Error(`Step "${name}" is not available`);
    }
    state.status = 'completed';
    state.output = output;
    state.completedAt = Date.now();
    this.advanceNext(name);
  }

  skip(name: string): void {
    const state = this.states.get(name);
    if (!state) throw new Error(`Step "${name}" not found`);
    if (state.step.required) throw new Error(`Step "${name}" is required and cannot be skipped`);
    if (state.status !== 'available') throw new Error(`Step "${name}" is not available`);
    state.status = 'skipped';
    this.advanceNext(name);
  }

  progress(): StepProgress {
    const completed = [...this.states.values()].filter(
      s => s.status === 'completed' || s.status === 'skipped',
    ).length;
    const total = this.ordered.length;
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  isComplete(): boolean {
    for (const step of this.ordered) {
      const state = this.states.get(step.name)!;
      if (step.required && state.status !== 'completed') return false;
      if (!step.required && state.status !== 'completed' && state.status !== 'skipped') return false;
    }
    return true;
  }

  getOutputs(): Map<string, Record<string, unknown>> {
    const outputs = new Map<string, Record<string, unknown>>();
    for (const [name, state] of this.states) {
      if (state.output) outputs.set(name, state.output);
    }
    return outputs;
  }

  private advanceNext(completedName: string): void {
    const idx = this.ordered.findIndex(s => s.name === completedName);
    if (idx >= 0 && idx + 1 < this.ordered.length) {
      const next = this.ordered[idx + 1];
      const nextState = this.states.get(next.name)!;
      if (nextState.status === 'pending') {
        nextState.status = 'available';
      }
    }
  }
}
```

Create `packages/reasoning/src/index.ts`:
```typescript
export { StepRegistry } from './step-registry.js';
export type { ReasoningStep, StepStatus, StepState, StepProgress } from './types.js';
```

**Step 6: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/reasoning/tests/step-registry.test.ts`
Expected: 7 tests PASS

**Step 7: Commit**

```bash
git add packages/reasoning/
git commit -m "feat(reasoning): add step registry with ordered progression and skip logic"
```

---

### Task 6: Reasoning Structures — Step Tools Generator

**Files:**
- Create: `packages/reasoning/src/step-tools.ts`
- Create: `packages/reasoning/tests/step-tools.test.ts`
- Modify: `packages/reasoning/src/index.ts` (add exports)

**Context:** Converts a `StepRegistry` into ephemeral `Tool`-shaped objects that can be registered/unregistered from the ToolRegistry dynamically. Each step becomes a tool whose handler calls `registry.complete()` and whose `getPermission()` returns AUTO_APPROVE (reasoning steps are internal). When a step completes, the tool is unregistered and the next step's tool is registered.

**Step 1: Write the failing test**

Create `packages/reasoning/tests/step-tools.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StepToolGenerator } from '../src/step-tools.js';
import { StepRegistry } from '../src/step-registry.js';
import type { ReasoningStep } from '../src/types.js';

describe('StepToolGenerator', () => {
  const steps: ReasoningStep[] = [
    { name: 'gather', description: 'Gather information', order: 1, required: true },
    { name: 'analyze', description: 'Analyze gathered data', order: 2, required: true },
    { name: 'conclude', description: 'Draw conclusions', order: 3, required: true },
  ];

  it('generates tool for current step only', () => {
    const registry = new StepRegistry(steps);
    const generator = new StepToolGenerator(registry);
    const tools = generator.getCurrentTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('reasoning_gather');
    expect(tools[0].description).toContain('Gather information');
  });

  it('tool invocation completes the step and advances', async () => {
    const registry = new StepRegistry(steps);
    const generator = new StepToolGenerator(registry);

    const [tool] = generator.getCurrentTools();
    const result = await tool.run({ result: 'Found data' });
    expect(result.success).toBe(true);

    // Next step should now be available
    const nextTools = generator.getCurrentTools();
    expect(nextTools).toHaveLength(1);
    expect(nextTools[0].name).toBe('reasoning_analyze');
  });

  it('returns empty tools when all steps complete', async () => {
    const registry = new StepRegistry(steps);
    const generator = new StepToolGenerator(registry);

    for (const step of steps) {
      const [tool] = generator.getCurrentTools();
      await tool.run({ result: 'done' });
    }

    const tools = generator.getCurrentTools();
    expect(tools).toHaveLength(0);
  });

  it('tool has AUTO_APPROVE permission', () => {
    const registry = new StepRegistry(steps);
    const generator = new StepToolGenerator(registry);
    const [tool] = generator.getCurrentTools();
    expect(tool.getPermission()).toBe('AUTO_APPROVE');
  });

  it('includes progress in tool result', async () => {
    const registry = new StepRegistry(steps);
    const generator = new StepToolGenerator(registry);

    const [tool] = generator.getCurrentTools();
    const result = await tool.run({ data: 'test' });
    expect(result.data.progress).toEqual({ completed: 1, total: 3, percentage: 33 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/reasoning/tests/step-tools.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/reasoning/src/step-tools.ts`:
```typescript
import type { StepRegistry } from './step-registry.js';

interface ToolLike {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<{ success: boolean; data: Record<string, unknown> }>;
  getPermission(): string;
}

export class StepToolGenerator {
  constructor(private registry: StepRegistry) {}

  getCurrentTools(): ToolLike[] {
    const current = this.registry.currentStep();
    if (!current) return [];

    const registry = this.registry;

    return [
      {
        name: `reasoning_${current.name}`,
        description: `[Reasoning Step ${current.order}] ${current.description}`,
        parameters: {
          type: 'object',
          properties: {
            result: { type: 'string', description: 'Output from this reasoning step' },
          },
        },
        async run(args: Record<string, unknown>) {
          registry.complete(current.name, args);
          return {
            success: true,
            data: {
              step: current.name,
              progress: registry.progress(),
              nextStep: registry.currentStep()?.name ?? null,
            },
          };
        },
        getPermission() {
          return 'AUTO_APPROVE';
        },
      },
    ];
  }
}
```

**Step 4: Update barrel export**

Add to `packages/reasoning/src/index.ts`:
```typescript
export { StepToolGenerator } from './step-tools.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/reasoning/tests/step-tools.test.ts`
Expected: 5 tests PASS

**Step 6: Commit**

```bash
git add packages/reasoning/
git commit -m "feat(reasoning): add step-to-tool generator for ephemeral reasoning tools"
```

---

### Task 7: Benchmark Suite — Result Store

**Files:**
- Create: `packages/benchmark/src/result-store.ts`
- Create: `packages/benchmark/src/types.ts`
- Create: `packages/benchmark/tests/result-store.test.ts`
- Create: `packages/benchmark/package.json`
- Create: `packages/benchmark/tsconfig.json`
- Create: `packages/benchmark/src/index.ts`

**Context:** The Benchmark Suite evaluates system quality across defined scenarios and stores results for historical comparison. Each benchmark run produces scores per metric (accuracy, latency, token usage, etc.) that can be compared against previous runs to detect regressions or improvements. This task builds the result storage and trend analysis.

**Step 1: Write the failing test**

Create `packages/benchmark/tests/result-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { BenchmarkStore } from '../src/result-store.js';
import type { BenchmarkRun, BenchmarkMetric } from '../src/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('BenchmarkStore', () => {
  let store: BenchmarkStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records and retrieves benchmark runs', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(tmpDir, 'bench.db'));

    const metrics: BenchmarkMetric[] = [
      { name: 'accuracy', value: 0.92, unit: 'ratio' },
      { name: 'latency_p50', value: 150, unit: 'ms' },
    ];
    store.recordRun('code-review', 'v1.10.2', metrics);

    const runs = store.getRunsBySuite('code-review');
    expect(runs).toHaveLength(1);
    expect(runs[0].suite).toBe('code-review');
    expect(runs[0].version).toBe('v1.10.2');
    expect(runs[0].metrics).toHaveLength(2);
  });

  it('compares two runs and detects regression', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(tmpDir, 'bench.db'));

    store.recordRun('code-review', 'v1.10.1', [
      { name: 'accuracy', value: 0.95, unit: 'ratio' },
    ]);
    store.recordRun('code-review', 'v1.10.2', [
      { name: 'accuracy', value: 0.85, unit: 'ratio' },
    ]);

    const comparison = store.compareLatest('code-review');
    expect(comparison).not.toBeNull();
    expect(comparison!.regressions).toHaveLength(1);
    expect(comparison!.regressions[0].metric).toBe('accuracy');
    expect(comparison!.regressions[0].delta).toBeCloseTo(-0.10, 2);
  });

  it('detects improvement', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(tmpDir, 'bench.db'));

    store.recordRun('perf', 'v1', [{ name: 'latency', value: 200, unit: 'ms' }]);
    store.recordRun('perf', 'v2', [{ name: 'latency', value: 150, unit: 'ms' }]);

    const comparison = store.compareLatest('perf');
    expect(comparison!.improvements).toHaveLength(1);
  });

  it('returns null comparison with fewer than 2 runs', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(tmpDir, 'bench.db'));

    store.recordRun('single', 'v1', [{ name: 'score', value: 5, unit: 'points' }]);
    expect(store.compareLatest('single')).toBeNull();
  });

  it('lists all suites', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(tmpDir, 'bench.db'));

    store.recordRun('code-review', 'v1', [{ name: 'score', value: 8, unit: 'points' }]);
    store.recordRun('security-scan', 'v1', [{ name: 'vulns', value: 0, unit: 'count' }]);

    const suites = store.listSuites();
    expect(suites).toEqual(expect.arrayContaining(['code-review', 'security-scan']));
    expect(suites).toHaveLength(2);
  });

  it('computes trend over multiple runs', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
    store = new BenchmarkStore(join(tmpDir, 'bench.db'));

    store.recordRun('perf', 'v1', [{ name: 'latency', value: 200, unit: 'ms' }]);
    store.recordRun('perf', 'v2', [{ name: 'latency', value: 180, unit: 'ms' }]);
    store.recordRun('perf', 'v3', [{ name: 'latency', value: 160, unit: 'ms' }]);

    const trend = store.getTrend('perf', 'latency');
    expect(trend).toHaveLength(3);
    expect(trend[0].value).toBe(200);
    expect(trend[2].value).toBe(160);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/benchmark/tests/result-store.test.ts`
Expected: FAIL — module not found

**Step 3: Create package scaffolding**

Create `packages/benchmark/package.json`:
```json
{
  "name": "@auxiora/benchmark",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `packages/benchmark/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

**Step 4: Write types**

Create `packages/benchmark/src/types.ts`:
```typescript
export interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
}

export interface BenchmarkRun {
  id: number;
  suite: string;
  version: string;
  metrics: BenchmarkMetric[];
  runAt: number;
}

export interface MetricDelta {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  percentChange: number;
}

export interface RunComparison {
  suite: string;
  previousVersion: string;
  currentVersion: string;
  regressions: MetricDelta[];
  improvements: MetricDelta[];
  unchanged: MetricDelta[];
}

export interface TrendPoint {
  version: string;
  value: number;
  runAt: number;
}
```

**Step 5: Write minimal implementation**

Create `packages/benchmark/src/result-store.ts`:
```typescript
import { DatabaseSync } from 'node:sqlite';
import type { BenchmarkMetric, BenchmarkRun, RunComparison, MetricDelta, TrendPoint } from './types.js';

export class BenchmarkStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS benchmark_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suite TEXT NOT NULL,
      version TEXT NOT NULL,
      metricsJson TEXT NOT NULL,
      runAt INTEGER NOT NULL
    )`);
  }

  recordRun(suite: string, version: string, metrics: BenchmarkMetric[]): void {
    if (this.closed) return;
    this.db.prepare(
      'INSERT INTO benchmark_runs (suite, version, metricsJson, runAt) VALUES (?, ?, ?, ?)',
    ).run(suite, version, JSON.stringify(metrics), Date.now());
  }

  getRunsBySuite(suite: string): BenchmarkRun[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT * FROM benchmark_runs WHERE suite = ? ORDER BY runAt DESC')
      .all(suite) as any[];
    return rows.map(r => ({ ...r, metrics: JSON.parse(r.metricsJson) }));
  }

  compareLatest(suite: string): RunComparison | null {
    if (this.closed) return null;
    const rows = this.db
      .prepare('SELECT * FROM benchmark_runs WHERE suite = ? ORDER BY runAt DESC LIMIT 2')
      .all(suite) as any[];
    if (rows.length < 2) return null;

    const current = { ...rows[0], metrics: JSON.parse(rows[0].metricsJson) as BenchmarkMetric[] };
    const previous = { ...rows[1], metrics: JSON.parse(rows[1].metricsJson) as BenchmarkMetric[] };

    const prevMap = new Map(previous.metrics.map((m: BenchmarkMetric) => [m.name, m.value]));
    const regressions: MetricDelta[] = [];
    const improvements: MetricDelta[] = [];
    const unchanged: MetricDelta[] = [];

    for (const metric of current.metrics) {
      const prevVal = prevMap.get(metric.name);
      if (prevVal === undefined) continue;
      const delta = metric.value - prevVal;
      const percentChange = prevVal !== 0 ? (delta / Math.abs(prevVal)) * 100 : 0;
      const entry: MetricDelta = {
        metric: metric.name,
        previous: prevVal,
        current: metric.value,
        delta,
        percentChange,
      };

      const threshold = 0.01;
      if (Math.abs(delta) < threshold) {
        unchanged.push(entry);
      } else if (delta < 0) {
        regressions.push(entry);
      } else {
        improvements.push(entry);
      }
    }

    return {
      suite,
      previousVersion: previous.version,
      currentVersion: current.version,
      regressions,
      improvements,
      unchanged,
    };
  }

  listSuites(): string[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT DISTINCT suite FROM benchmark_runs ORDER BY suite')
      .all() as any[];
    return rows.map(r => r.suite);
  }

  getTrend(suite: string, metricName: string): TrendPoint[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT version, metricsJson, runAt FROM benchmark_runs WHERE suite = ? ORDER BY runAt ASC')
      .all(suite) as any[];

    const points: TrendPoint[] = [];
    for (const row of rows) {
      const metrics = JSON.parse(row.metricsJson) as BenchmarkMetric[];
      const m = metrics.find(m => m.name === metricName);
      if (m) {
        points.push({ version: row.version, value: m.value, runAt: row.runAt });
      }
    }
    return points;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
```

Create `packages/benchmark/src/index.ts`:
```typescript
export { BenchmarkStore } from './result-store.js';
export type {
  BenchmarkMetric,
  BenchmarkRun,
  RunComparison,
  MetricDelta,
  TrendPoint,
} from './types.js';
```

**Step 6: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/benchmark/tests/result-store.test.ts`
Expected: 6 tests PASS

**Step 7: Commit**

```bash
git add packages/benchmark/
git commit -m "feat(benchmark): add result store with comparison and trend analysis"
```

---

### Task 8: Benchmark Suite — Runner

**Files:**
- Create: `packages/benchmark/src/runner.ts`
- Create: `packages/benchmark/tests/runner.test.ts`
- Modify: `packages/benchmark/src/index.ts` (add exports)

**Context:** The benchmark runner carries out a defined set of test scenarios against a handler function, collects metrics, and records results. Each scenario has an input, expected output, and evaluation criteria. The runner is agnostic to the actual handler — it uses a structural type `HandlerLike` so any function matching `(input) => Promise<output>` works.

**Step 1: Write the failing test**

Create `packages/benchmark/tests/runner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../src/runner.js';
import type { BenchmarkScenario, ScenarioResult } from '../src/types.js';

describe('BenchmarkRunner', () => {
  const scenarios: BenchmarkScenario[] = [
    {
      name: 'simple-question',
      input: 'What is 2+2?',
      expectedOutput: '4',
      evaluate: (output: string) => output.includes('4') ? 1.0 : 0.0,
    },
    {
      name: 'greeting',
      input: 'Hello',
      expectedOutput: 'Hi',
      evaluate: (output: string) => output.toLowerCase().includes('hi') ? 1.0 : 0.0,
    },
  ];

  it('runs all scenarios and collects results', async () => {
    const handler = async (input: string) => {
      if (input.includes('2+2')) return 'The answer is 4';
      return 'Hi there!';
    };

    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(handler);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(1.0);
    expect(results[1].score).toBe(1.0);
  });

  it('measures latency per scenario', async () => {
    const handler = async (input: string) => {
      await new Promise(r => setTimeout(r, 10));
      return 'response';
    };

    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(handler);
    for (const r of results) {
      expect(r.latencyMs).toBeGreaterThanOrEqual(5);
    }
  });

  it('handles handler errors gracefully', async () => {
    const handler = async (input: string) => {
      throw new Error('boom');
    };

    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(handler);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0);
    expect(results[0].error).toBe('boom');
  });

  it('computes aggregate metrics', async () => {
    const handler = async (input: string) => {
      if (input.includes('2+2')) return '4';
      return 'nope';
    };

    const runner = new BenchmarkRunner(scenarios);
    const results = await runner.run(handler);
    const metrics = runner.computeMetrics(results);

    expect(metrics.find(m => m.name === 'accuracy')?.value).toBe(0.5);
    expect(metrics.find(m => m.name === 'latency_p50')).toBeDefined();
    expect(metrics.find(m => m.name === 'error_rate')?.value).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/benchmark/tests/runner.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Add to `packages/benchmark/src/types.ts`:
```typescript
export interface BenchmarkScenario {
  name: string;
  input: string;
  expectedOutput: string;
  evaluate: (output: string) => number;
}

export interface ScenarioResult {
  scenario: string;
  output: string;
  score: number;
  latencyMs: number;
  error?: string;
}
```

Create `packages/benchmark/src/runner.ts`:
```typescript
import type { BenchmarkScenario, ScenarioResult, BenchmarkMetric } from './types.js';

export class BenchmarkRunner {
  constructor(private scenarios: BenchmarkScenario[]) {}

  async run(handler: (input: string) => Promise<string>): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of this.scenarios) {
      const start = performance.now();
      try {
        const output = await handler(scenario.input);
        const latencyMs = performance.now() - start;
        const score = scenario.evaluate(output);
        results.push({ scenario: scenario.name, output, score, latencyMs });
      } catch (err) {
        const latencyMs = performance.now() - start;
        results.push({
          scenario: scenario.name,
          output: '',
          score: 0,
          latencyMs,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  computeMetrics(results: ScenarioResult[]): BenchmarkMetric[] {
    if (results.length === 0) return [];

    const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
    const errorRate = results.filter(r => r.error).length / results.length;

    const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    return [
      { name: 'accuracy', value: avgScore, unit: 'ratio' },
      { name: 'latency_p50', value: p50, unit: 'ms' },
      { name: 'latency_p95', value: p95, unit: 'ms' },
      { name: 'error_rate', value: errorRate, unit: 'ratio' },
    ];
  }
}
```

**Step 4: Update barrel export**

Add to `packages/benchmark/src/index.ts`:
```typescript
export { BenchmarkRunner } from './runner.js';
export type { BenchmarkScenario, ScenarioResult } from './types.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/benchmark/tests/runner.test.ts`
Expected: 4 tests PASS

**Step 6: Commit**

```bash
git add packages/benchmark/
git commit -m "feat(benchmark): add scenario runner with latency tracking and metrics computation"
```

---

### Task 9: Integration — Wire Overseer into Health Monitor

**Files:**
- Create: `packages/runtime/tests/overseer-wiring.test.ts`

**Context:** The OverseerMonitor should integrate with Auxiora's existing HealthMonitorImpl as an additional subsystem check. When the overseer detects anomalies, they surface as HealthIssues. This test verifies the structural compatibility and end-to-end wiring.

**Step 1: Write the integration test**

Create `packages/runtime/tests/overseer-wiring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { OverseerMonitor } from '@auxiora/overseer';
import type { AgentSnapshot, OverseerConfig } from '@auxiora/overseer';

describe('Overseer Integration', () => {
  const config: OverseerConfig = {
    loopThreshold: 3,
    stallTimeoutMs: 5_000,
    maxTokenBudget: 10_000,
    checkIntervalMs: 1_000,
  };

  it('overseer alerts map to health issue shape', () => {
    const monitor = new OverseerMonitor(config);
    const snapshot: AgentSnapshot = {
      agentId: 'agent-1',
      toolCalls: [
        { tool: 'search', timestamp: 1 },
        { tool: 'search', timestamp: 2 },
        { tool: 'search', timestamp: 3 },
      ],
      tokenUsage: 15_000,
      lastActivityAt: Date.now() - 10_000,
      startedAt: Date.now() - 20_000,
    };

    const alerts = monitor.analyze(snapshot);
    expect(alerts.length).toBeGreaterThanOrEqual(2); // loop + stall + budget

    // Verify alerts can be mapped to HealthIssue shape
    for (const alert of alerts) {
      const healthIssue = {
        id: `overseer-${alert.agentId}-${alert.type}`,
        subsystem: 'overseer',
        severity: alert.severity,
        description: alert.message,
        detectedAt: new Date(alert.detectedAt).toISOString(),
        suggestedFix: `Investigate agent ${alert.agentId}: ${alert.type}`,
        autoFixable: alert.type === 'stall_detected',
        trustLevelRequired: 3,
      };
      expect(healthIssue.id).toBeDefined();
      expect(healthIssue.subsystem).toBe('overseer');
    }
  });

  it('healthy agents produce no alerts', () => {
    const monitor = new OverseerMonitor(config);
    const snapshot: AgentSnapshot = {
      agentId: 'agent-2',
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'write', timestamp: 2 },
      ],
      tokenUsage: 500,
      lastActivityAt: Date.now(),
      startedAt: Date.now() - 1000,
    };
    expect(monitor.analyze(snapshot)).toHaveLength(0);
  });
});
```

**Step 2: Add `@auxiora/overseer` to runtime devDependencies**

Add to `packages/runtime/package.json` devDependencies:
```json
"@auxiora/overseer": "workspace:*"
```

Then run: `pnpm install`

**Step 3: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/overseer-wiring.test.ts`
Expected: 2 tests PASS

**Step 4: Commit**

```bash
git add packages/runtime/tests/overseer-wiring.test.ts packages/runtime/package.json
git commit -m "test(runtime): add overseer-to-health-monitor integration tests"
```

---

### Task 10: Integration — Wire Benchmark + Review Committee into Dashboard API

**Files:**
- Create: `packages/gateway/src/phase3-routes.ts`
- Create: `packages/gateway/tests/phase3-routes.test.ts`
- Modify: `packages/gateway/src/index.ts` (add exports)

**Context:** Dashboard API endpoints for the new Phase 3 subsystems. Follows the same pattern as `self-improving-routes.ts` from Phase 2: standalone route module, structural types for deps, 503 when stores unavailable, try/catch for resilience.

**Step 1: Write the failing test**

Create `packages/gateway/tests/phase3-routes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mountPhase3Routes } from '../src/phase3-routes.js';

describe('Phase 3 Dashboard Routes', () => {
  const mockApp = () => {
    const routes: Record<string, Function> = {};
    return {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
      routes,
    };
  };

  const mockRes = () => {
    const res: any = {};
    res.json = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);
    return res;
  };

  it('GET /api/v1/overseer/alerts returns recent alerts', () => {
    const app = mockApp();
    const alertStore = {
      getRecent: vi.fn().mockReturnValue([
        { id: 1, type: 'loop_detected', agentId: 'a1', message: 'loop', severity: 'warning' },
      ]),
    };
    mountPhase3Routes(app as any, { alertStore });

    const res = mockRes();
    app.routes['/api/v1/overseer/alerts']({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alerts: expect.any(Array) }));
  });

  it('GET /api/v1/benchmarks/suites lists available suites', () => {
    const app = mockApp();
    const benchmarkStore = {
      listSuites: vi.fn().mockReturnValue(['code-review', 'security']),
    };
    mountPhase3Routes(app as any, { benchmarkStore });

    const res = mockRes();
    app.routes['/api/v1/benchmarks/suites']({}, res);
    expect(res.json).toHaveBeenCalledWith({ suites: ['code-review', 'security'] });
  });

  it('GET /api/v1/reviews/rate returns approval rate', () => {
    const app = mockApp();
    const reviewStore = {
      getApprovalRate: vi.fn().mockReturnValue(0.85),
      getRecent: vi.fn().mockReturnValue([]),
    };
    mountPhase3Routes(app as any, { reviewStore });

    const res = mockRes();
    app.routes['/api/v1/reviews/rate']({}, res);
    expect(res.json).toHaveBeenCalledWith({ approvalRate: 0.85 });
  });

  it('returns 503 when store unavailable', () => {
    const app = mockApp();
    mountPhase3Routes(app as any, {});

    const res = mockRes();
    app.routes['/api/v1/overseer/alerts']({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('GET /api/v1/benchmarks/compare returns comparison', () => {
    const app = mockApp();
    const benchmarkStore = {
      compareLatest: vi.fn().mockReturnValue({
        suite: 'perf',
        regressions: [],
        improvements: [{ metric: 'latency', delta: -10 }],
        unchanged: [],
      }),
    };
    mountPhase3Routes(app as any, { benchmarkStore });

    const res = mockRes();
    app.routes['/api/v1/benchmarks/compare']({ query: { suite: 'perf' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      comparison: expect.objectContaining({ suite: 'perf' }),
    }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/gateway/tests/phase3-routes.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/gateway/src/phase3-routes.ts`:
```typescript
interface AlertStoreLike {
  getRecent(limit: number): unknown[];
}

interface BenchmarkStoreLike {
  listSuites(): string[];
  compareLatest(suite: string): unknown | null;
}

interface ReviewStoreLike {
  getApprovalRate(): number;
  getRecent(limit: number): unknown[];
}

interface Phase3Deps {
  alertStore?: AlertStoreLike;
  benchmarkStore?: BenchmarkStoreLike;
  reviewStore?: ReviewStoreLike;
}

interface AppLike {
  get(path: string, handler: (req: any, res: any) => void): void;
}

export function mountPhase3Routes(app: AppLike, deps: Phase3Deps): void {
  app.get('/api/v1/overseer/alerts', (req, res) => {
    try {
      if (!deps.alertStore) return res.status(503).json({ error: 'Alert store unavailable' });
      const limit = Number(req.query?.limit) || 20;
      res.json({ alerts: deps.alertStore.getRecent(limit) });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.get('/api/v1/benchmarks/suites', (_req, res) => {
    try {
      if (!deps.benchmarkStore) return res.status(503).json({ error: 'Benchmark store unavailable' });
      res.json({ suites: deps.benchmarkStore.listSuites() });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.get('/api/v1/benchmarks/compare', (req, res) => {
    try {
      if (!deps.benchmarkStore) return res.status(503).json({ error: 'Benchmark store unavailable' });
      const suite = req.query?.suite;
      if (!suite) return res.status(400).json({ error: 'suite query parameter required' });
      const comparison = deps.benchmarkStore.compareLatest(suite);
      res.json({ comparison });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.get('/api/v1/reviews/rate', (_req, res) => {
    try {
      if (!deps.reviewStore) return res.status(503).json({ error: 'Review store unavailable' });
      res.json({ approvalRate: deps.reviewStore.getApprovalRate() });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.get('/api/v1/reviews/recent', (req, res) => {
    try {
      if (!deps.reviewStore) return res.status(503).json({ error: 'Review store unavailable' });
      const limit = Number(req.query?.limit) || 20;
      res.json({ reviews: deps.reviewStore.getRecent(limit) });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
```

**Step 4: Update barrel export**

Add to `packages/gateway/src/index.ts`:
```typescript
export { mountPhase3Routes } from './phase3-routes.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/gateway/tests/phase3-routes.test.ts`
Expected: 5 tests PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/phase3-routes.ts packages/gateway/tests/phase3-routes.test.ts packages/gateway/src/index.ts
git commit -m "feat(gateway): add Phase 3 dashboard API routes for overseer, benchmarks, reviews"
```

---

## Summary

| Task | Package | Tests | What it adds |
|------|---------|-------|-------------|
| 1 | `@auxiora/overseer` | 5 | Anomaly detection (loops, stalls, budget) |
| 2 | `@auxiora/overseer` | 4 | Alert persistence with filtering |
| 3 | `@auxiora/review-committee` | 5 | Multi-critic aggregation engine |
| 4 | `@auxiora/review-committee` | 3 | Review persistence with approval metrics |
| 5 | `@auxiora/reasoning` | 7 | Step registry with ordered progression |
| 6 | `@auxiora/reasoning` | 5 | Ephemeral step-to-tool generator |
| 7 | `@auxiora/benchmark` | 6 | Result store with trend analysis |
| 8 | `@auxiora/benchmark` | 4 | Scenario runner with metrics |
| 9 | `@auxiora/runtime` | 2 | Overseer-to-health integration |
| 10 | `@auxiora/gateway` | 5 | Phase 3 dashboard API routes |

**Total: ~46 new tests across 4 new packages + 2 integration modules**

### Parallelization Notes
- Tasks 1-2 (overseer), 3-4 (review committee), 5-6 (reasoning), 7-8 (benchmark) are independent pairs — can run pairs in parallel
- Tasks 9-10 depend on Tasks 1-8 completing but can run in parallel with each other
