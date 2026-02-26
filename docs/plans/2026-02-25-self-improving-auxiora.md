# Self-Improving Auxiora Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Auxiora self-improving by adding telemetry tracking, session reflection, telemetry-to-prompt injection, independent job verification, quality gates with regression detection, and a periodic self-review cycle — inspired by BMO's 4-loop architecture and nightwire's autonomous task system.

**Architecture:** Add a `TelemetryStage` to the existing enrichment pipeline (order 50, before all other stages) that injects operational insights into prompts. Add a `@auxiora/telemetry` package for persistent tool/job success tracking. Add a `@auxiora/verification` package for independent job output review. Wire session reflection into the runtime's session close handler. Add a periodic "battery change" behavior for deep self-review.

**Tech Stack:** TypeScript strict ESM, node:sqlite (WAL mode), vitest, structural types (no cross-package imports)

---

### Task 1: Create `@auxiora/telemetry` package — types and tracker

Track tool invocations, job success rates, and execution durations persistently in SQLite. This is the data foundation for all self-improvement loops.

**Files:**
- Create: `packages/telemetry/package.json`
- Create: `packages/telemetry/tsconfig.json`
- Create: `packages/telemetry/src/index.ts`
- Create: `packages/telemetry/src/types.ts`
- Create: `packages/telemetry/src/tracker.ts`
- Create: `packages/telemetry/src/__tests__/tracker.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/telemetry/src/__tests__/tracker.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TelemetryTracker } from '../tracker.js';

describe('TelemetryTracker', () => {
  let dir: string;
  let tracker: TelemetryTracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'telemetry-'));
    tracker = new TelemetryTracker(join(dir, 'telemetry.db'));
  });

  afterEach(() => {
    tracker.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records and retrieves tool stats', () => {
    tracker.record({ tool: 'provider.complete', success: true, durationMs: 1200, context: 'chat' });
    tracker.record({ tool: 'provider.complete', success: true, durationMs: 800, context: 'chat' });
    tracker.record({ tool: 'provider.complete', success: false, durationMs: 100, context: 'chat', error: 'timeout' });

    const stats = tracker.getToolStats('provider.complete');
    expect(stats.totalCalls).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.667, 2);
    expect(stats.avgDurationMs).toBeCloseTo(700, 0);
    expect(stats.lastError).toBe('timeout');
  });

  it('returns empty stats for unknown tool', () => {
    const stats = tracker.getToolStats('unknown');
    expect(stats.totalCalls).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('lists all tool stats sorted by success rate ascending', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 10 });
    tracker.record({ tool: 'b', success: false, durationMs: 10 });
    tracker.record({ tool: 'b', success: true, durationMs: 10 });

    const all = tracker.getAllStats();
    expect(all.length).toBe(2);
    expect(all[0].tool).toBe('b'); // 50% < 100%
    expect(all[1].tool).toBe('a'); // 100%
  });

  it('gets flagged tools below threshold', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'flaky', success: i < 4, durationMs: 10 });
    }
    tracker.record({ tool: 'solid', success: true, durationMs: 10 });

    const flagged = tracker.getFlaggedTools(0.7, 5);
    expect(flagged.length).toBe(1);
    expect(flagged[0].tool).toBe('flaky');
  });

  it('records job outcomes', () => {
    tracker.recordJob({ type: 'behavior', success: true, durationMs: 5000, jobId: 'j1' });
    tracker.recordJob({ type: 'behavior', success: false, durationMs: 200, jobId: 'j2', error: 'handler error' });

    const stats = tracker.getJobStats('behavior');
    expect(stats.totalJobs).toBe(2);
    expect(stats.successRate).toBe(0.5);
  });

  it('persists across close/reopen', () => {
    tracker.record({ tool: 'x', success: true, durationMs: 100 });
    tracker.close();

    const tracker2 = new TelemetryTracker(join(dir, 'telemetry.db'));
    const stats = tracker2.getToolStats('x');
    expect(stats.totalCalls).toBe(1);
    tracker2.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/src/__tests__/tracker.test.ts`
Expected: FAIL — cannot find module

**Step 3: Create package scaffolding**

```json
// packages/telemetry/package.json
{
  "name": "@auxiora/telemetry",
  "version": "1.10.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=22.0.0" },
  "publishConfig": { "access": "public" },
  "files": ["dist/"]
}
```

```json
// packages/telemetry/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

```typescript
// packages/telemetry/src/types.ts
export interface ToolInvocation {
  readonly tool: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly context?: string;
  readonly error?: string;
}

export interface ToolStats {
  readonly tool: string;
  readonly totalCalls: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly lastError: string;
}

export interface JobOutcome {
  readonly type: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly jobId: string;
  readonly error?: string;
}

export interface JobTypeStats {
  readonly type: string;
  readonly totalJobs: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly lastError: string;
}
```

**Step 4: Implement TelemetryTracker**

```typescript
// packages/telemetry/src/tracker.ts
import { DatabaseSync } from 'node:sqlite';
import type { ToolInvocation, ToolStats, JobOutcome, JobTypeStats } from './types.js';

export class TelemetryTracker {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        context TEXT DEFAULT '',
        error TEXT DEFAULT '',
        timestamp INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS job_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        job_id TEXT NOT NULL,
        error TEXT DEFAULT '',
        timestamp INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tool_inv_tool ON tool_invocations(tool)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_job_out_type ON job_outcomes(type)');
  }

  record(inv: ToolInvocation): void {
    this.db.prepare(
      'INSERT INTO tool_invocations (tool, success, duration_ms, context, error) VALUES (?, ?, ?, ?, ?)'
    ).run(inv.tool, inv.success ? 1 : 0, inv.durationMs, inv.context ?? '', inv.error ?? '');
  }

  recordJob(outcome: JobOutcome): void {
    this.db.prepare(
      'INSERT INTO job_outcomes (type, success, duration_ms, job_id, error) VALUES (?, ?, ?, ?, ?)'
    ).run(outcome.type, outcome.success ? 1 : 0, outcome.durationMs, outcome.jobId, outcome.error ?? '');
  }

  getToolStats(tool: string): ToolStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(success), 0) as successes, AVG(duration_ms) as avg_dur FROM tool_invocations WHERE tool = ?'
    ).get(tool) as { total: number; successes: number; avg_dur: number | null } | undefined;

    const total = row?.total ?? 0;
    const successes = Number(row?.successes ?? 0);

    const errRow = this.db.prepare(
      "SELECT error FROM tool_invocations WHERE tool = ? AND success = 0 AND error != '' ORDER BY timestamp DESC LIMIT 1"
    ).get(tool) as { error: string } | undefined;

    return {
      tool,
      totalCalls: total,
      successCount: successes,
      failureCount: total - successes,
      successRate: total > 0 ? successes / total : 0,
      avgDurationMs: row?.avg_dur ?? 0,
      lastError: errRow?.error ?? '',
    };
  }

  getAllStats(): ToolStats[] {
    const tools = this.db.prepare('SELECT DISTINCT tool FROM tool_invocations').all() as Array<{ tool: string }>;
    return tools
      .map(t => this.getToolStats(t.tool))
      .sort((a, b) => a.successRate - b.successRate);
  }

  getFlaggedTools(threshold: number, minCalls: number): ToolStats[] {
    return this.getAllStats().filter(s => s.totalCalls >= minCalls && s.successRate < threshold);
  }

  getJobStats(type: string): JobTypeStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(success), 0) as successes, AVG(duration_ms) as avg_dur FROM job_outcomes WHERE type = ?'
    ).get(type) as { total: number; successes: number; avg_dur: number | null } | undefined;

    const total = row?.total ?? 0;
    const successes = Number(row?.successes ?? 0);

    const errRow = this.db.prepare(
      "SELECT error FROM job_outcomes WHERE type = ? AND success = 0 AND error != '' ORDER BY timestamp DESC LIMIT 1"
    ).get(type) as { error: string } | undefined;

    return {
      type,
      totalJobs: total,
      successCount: successes,
      failureCount: total - successes,
      successRate: total > 0 ? successes / total : 0,
      avgDurationMs: row?.avg_dur ?? 0,
      lastError: errRow?.error ?? '',
    };
  }

  close(): void {
    this.db.close();
  }
}
```

```typescript
// packages/telemetry/src/index.ts
export type { ToolInvocation, ToolStats, JobOutcome, JobTypeStats } from './types.js';
export { TelemetryTracker } from './tracker.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/src/__tests__/tracker.test.ts`
Expected: PASS (6 tests)

**Step 6: Commit**

```bash
git add packages/telemetry/
git commit -m "feat(telemetry): add persistent tool/job telemetry tracker (BMO-inspired)"
```

---

### Task 2: Create TelemetryStage for the enrichment pipeline

Add a new enrichment stage (order 50) that injects operational warnings into prompts when tools have low success rates. This is the "telemetry to prompt" feedback loop from BMO.

**Files:**
- Create: `packages/runtime/src/enrichment/stages/telemetry-stage.ts`
- Create: `packages/runtime/src/enrichment/__tests__/telemetry-stage.test.ts`
- Modify: `packages/runtime/src/enrichment/index.ts` (add export)

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/telemetry-stage.test.ts
import { describe, it, expect } from 'vitest';
import { TelemetryStage } from '../stages/telemetry-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides?: Partial<EnrichmentContext>): EnrichmentContext {
  return {
    basePrompt: 'You are Auxiora.',
    userMessage: 'hello',
    history: [],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: {} as any,
    ...overrides,
  };
}

describe('TelemetryStage', () => {
  it('has order 50 (before all other stages)', () => {
    const stage = new TelemetryStage(() => []);
    expect(stage.order).toBe(50);
    expect(stage.name).toBe('telemetry');
  });

  it('appends nothing when all tools are healthy', async () => {
    const healthy = [
      { tool: 'provider.complete', totalCalls: 50, successRate: 0.96, lastError: '' },
    ];
    const stage = new TelemetryStage(() => healthy);
    // enabled() checks for flagged — healthy tools won't be flagged
    // The getter here returns all stats, but the stage only fires if there are flagged ones
    // Let's test with a getter that returns empty (no flagged)
    const stage2 = new TelemetryStage(() => []);
    const result = await stage2.enrich(makeCtx(), 'base prompt');
    expect(result.prompt).toBe('base prompt');
  });

  it('appends warning section when a tool is flagged', async () => {
    const flagged = [
      { tool: 'provider.complete', totalCalls: 20, successRate: 0.4, lastError: 'rate limited' },
    ];
    const stage = new TelemetryStage(() => flagged);
    const result = await stage.enrich(makeCtx(), 'base prompt');
    expect(result.prompt).toContain('[Operational Telemetry]');
    expect(result.prompt).toContain('provider.complete');
    expect(result.prompt).toContain('40%');
    expect(result.prompt).toContain('rate limited');
  });

  it('includes metadata with flagged tool names', async () => {
    const flagged = [
      { tool: 'memory.search', totalCalls: 10, successRate: 0.3, lastError: 'timeout' },
    ];
    const stage = new TelemetryStage(() => flagged);
    const result = await stage.enrich(makeCtx(), 'base');
    expect(result.metadata?.flaggedTools).toContain('memory.search');
  });

  it('is disabled when getter returns empty array', () => {
    const stage = new TelemetryStage(() => []);
    expect(stage.enabled(makeCtx())).toBe(false);
  });

  it('is enabled when there are flagged tools', () => {
    const stage = new TelemetryStage(() => [
      { tool: 'x', totalCalls: 10, successRate: 0.3, lastError: '' },
    ]);
    expect(stage.enabled(makeCtx())).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/src/enrichment/__tests__/telemetry-stage.test.ts`
Expected: FAIL

**Step 3: Implement TelemetryStage**

```typescript
// packages/runtime/src/enrichment/stages/telemetry-stage.ts
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

/** Structural type — avoids importing @auxiora/telemetry directly */
export interface TelemetryStatsLike {
  readonly tool: string;
  readonly totalCalls: number;
  readonly successRate: number;
  readonly lastError: string;
}

/**
 * Enrichment stage that injects operational telemetry warnings into prompts.
 *
 * Inspired by BMO's telemetry.json to system prompt injection pattern.
 * When tools have low success rates (below 70% with 5+ calls),
 * the stage prepends a warning section so the model can adapt.
 *
 * Order: 50 (runs before MemoryStage at 100)
 */
export class TelemetryStage implements EnrichmentStage {
  readonly name = 'telemetry';
  readonly order = 50;

  private cachedStats: TelemetryStatsLike[] = [];

  constructor(
    private readonly getFlaggedTools: () => TelemetryStatsLike[],
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    this.cachedStats = this.getFlaggedTools();
    return this.cachedStats.length > 0;
  }

  async enrich(_ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const stats = this.cachedStats;
    if (stats.length === 0) {
      return { prompt: currentPrompt };
    }

    const lines = ['[Operational Telemetry]', 'The following tools have degraded performance:'];
    for (const s of stats) {
      const pct = Math.round(s.successRate * 100);
      let line = `- ${s.tool}: ${pct}% success rate (${s.totalCalls} calls)`;
      if (s.lastError) {
        line += ` — last error: ${s.lastError.slice(0, 150)}`;
      }
      lines.push(line);
    }
    lines.push('Consider alternative approaches if these tools fail.');
    lines.push('');

    const section = lines.join('\n');

    return {
      prompt: currentPrompt + '\n\n' + section,
      metadata: {
        flaggedTools: stats.map(s => s.tool),
      },
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/src/enrichment/__tests__/telemetry-stage.test.ts`
Expected: PASS (6 tests)

**Step 5: Add export to enrichment index**

Add to `packages/runtime/src/enrichment/index.ts`:
```typescript
export { TelemetryStage } from './stages/telemetry-stage.js';
```

**Step 6: Commit**

```bash
git add packages/runtime/src/enrichment/stages/telemetry-stage.ts packages/runtime/src/enrichment/__tests__/telemetry-stage.test.ts packages/runtime/src/enrichment/index.ts
git commit -m "feat(enrichment): add TelemetryStage for operational warning injection (order 50)"
```

---

### Task 3: Create session reflection module

At session close, reflect on what happened — what tools succeeded/failed, how long things took, what patterns recurred. Store reflections for the periodic deep review. Inspired by BMO's Loop 3 (Self-Reflection).

**Files:**
- Create: `packages/telemetry/src/reflection.ts`
- Create: `packages/telemetry/src/__tests__/reflection.test.ts`
- Modify: `packages/telemetry/src/index.ts` (add export)

**Step 1: Write the failing test**

```typescript
// packages/telemetry/src/__tests__/reflection.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionReflector } from '../reflection.js';
import { TelemetryTracker } from '../tracker.js';

describe('SessionReflector', () => {
  let dir: string;
  let tracker: TelemetryTracker;
  let reflector: SessionReflector;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reflect-'));
    tracker = new TelemetryTracker(join(dir, 'telemetry.db'));
    reflector = new SessionReflector(tracker);
  });

  afterEach(() => {
    tracker.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reflects on a successful session', () => {
    tracker.record({ tool: 'provider.complete', success: true, durationMs: 500 });
    tracker.record({ tool: 'memory.search', success: true, durationMs: 200 });

    const reflection = reflector.reflect('session-1');
    expect(reflection.sessionId).toBe('session-1');
    expect(reflection.toolsUsed).toBe(2);
    expect(reflection.overallSuccessRate).toBe(1.0);
    expect(reflection.issues.length).toBe(0);
    expect(reflection.summary).toContain('All tools performing well');
  });

  it('identifies degraded tools in reflection', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'flaky', success: i < 3, durationMs: 100, error: i >= 3 ? 'timeout' : '' });
    }
    tracker.record({ tool: 'solid', success: true, durationMs: 50 });

    const reflection = reflector.reflect('session-2');
    expect(reflection.issues.length).toBeGreaterThan(0);
    expect(reflection.issues[0]).toContain('flaky');
  });

  it('generates a structured 3-question reflection', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 100 });
    tracker.record({ tool: 'b', success: false, durationMs: 5000, error: 'slow' });

    const reflection = reflector.reflect('session-3');
    expect(reflection.whatWorked.length).toBeGreaterThan(0);
    expect(reflection.whatWasSlow.length).toBeGreaterThan(0);
    expect(reflection.whatToChange.length).toBeGreaterThan(0);
  });

  it('persists reflection for later retrieval', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 100 });
    const r = reflector.reflect('session-4');
    reflector.save(r);

    const history = reflector.getRecentReflections(5);
    expect(history.length).toBe(1);
    expect(history[0].sessionId).toBe('session-4');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/src/__tests__/reflection.test.ts`
Expected: FAIL

**Step 3: Implement SessionReflector**

```typescript
// packages/telemetry/src/reflection.ts
import type { TelemetryTracker } from './tracker.js';

export interface SessionReflection {
  readonly sessionId: string;
  readonly timestamp: number;
  readonly toolsUsed: number;
  readonly overallSuccessRate: number;
  readonly issues: string[];
  readonly whatWorked: string[];
  readonly whatWasSlow: string[];
  readonly whatToChange: string[];
  readonly summary: string;
}

const SLOW_THRESHOLD_MS = 3000;
const LOW_SUCCESS_THRESHOLD = 0.7;
const MIN_CALLS_TO_FLAG = 3;

/**
 * Generates structured session reflections (BMO Loop 3).
 *
 * Three questions:
 * 1. What went well?
 * 2. What was slow or awkward?
 * 3. What to do differently next time?
 */
export class SessionReflector {
  constructor(private readonly tracker: TelemetryTracker) {}

  reflect(sessionId: string): SessionReflection {
    const allStats = this.tracker.getAllStats();
    const totalCalls = allStats.reduce((sum, s) => sum + s.totalCalls, 0);
    const totalSuccesses = allStats.reduce((sum, s) => sum + s.successCount, 0);
    const overallRate = totalCalls > 0 ? totalSuccesses / totalCalls : 1.0;

    const issues: string[] = [];
    const whatWorked: string[] = [];
    const whatWasSlow: string[] = [];
    const whatToChange: string[] = [];

    for (const s of allStats) {
      if (s.successRate >= 0.9 && s.totalCalls >= MIN_CALLS_TO_FLAG) {
        whatWorked.push(`${s.tool} performed reliably (${Math.round(s.successRate * 100)}% success)`);
      }

      if (s.avgDurationMs > SLOW_THRESHOLD_MS) {
        whatWasSlow.push(`${s.tool} averaged ${Math.round(s.avgDurationMs)}ms per call`);
      }

      if (s.successRate < LOW_SUCCESS_THRESHOLD && s.totalCalls >= MIN_CALLS_TO_FLAG) {
        const pct = Math.round(s.successRate * 100);
        issues.push(`${s.tool}: ${pct}% success rate (${s.failureCount} failures) — ${s.lastError || 'unknown error'}`);
        whatToChange.push(`Investigate ${s.tool} failures (${s.lastError || 'check logs'})`);
      }
    }

    if (whatWorked.length === 0 && totalCalls > 0) {
      whatWorked.push('Session completed without critical failures');
    }

    const summary = issues.length === 0
      ? `All tools performing well across ${totalCalls} invocations.`
      : `${issues.length} tool(s) degraded across ${totalCalls} invocations: ${issues.map(i => i.split(':')[0]).join(', ')}.`;

    return {
      sessionId,
      timestamp: Date.now(),
      toolsUsed: totalCalls,
      overallSuccessRate: overallRate,
      issues,
      whatWorked,
      whatWasSlow,
      whatToChange,
      summary,
    };
  }

  save(reflection: SessionReflection): void {
    (this.tracker as any).db.exec(`
      CREATE TABLE IF NOT EXISTS session_reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tools_used INTEGER NOT NULL,
        success_rate REAL NOT NULL,
        issues TEXT NOT NULL,
        what_worked TEXT NOT NULL,
        what_was_slow TEXT NOT NULL,
        what_to_change TEXT NOT NULL,
        summary TEXT NOT NULL
      )
    `);
    (this.tracker as any).db.prepare(
      `INSERT INTO session_reflections (session_id, timestamp, tools_used, success_rate, issues, what_worked, what_was_slow, what_to_change, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reflection.sessionId,
      reflection.timestamp,
      reflection.toolsUsed,
      reflection.overallSuccessRate,
      JSON.stringify(reflection.issues),
      JSON.stringify(reflection.whatWorked),
      JSON.stringify(reflection.whatWasSlow),
      JSON.stringify(reflection.whatToChange),
      reflection.summary,
    );
  }

  getRecentReflections(limit: number): SessionReflection[] {
    try {
      const rows = (this.tracker as any).db.prepare(
        'SELECT * FROM session_reflections ORDER BY timestamp DESC LIMIT ?'
      ).all(limit) as any[];
      return rows.map((r: any) => ({
        sessionId: r.session_id,
        timestamp: r.timestamp,
        toolsUsed: r.tools_used,
        overallSuccessRate: r.success_rate,
        issues: JSON.parse(r.issues),
        whatWorked: JSON.parse(r.what_worked),
        whatWasSlow: JSON.parse(r.what_was_slow),
        whatToChange: JSON.parse(r.what_to_change),
        summary: r.summary,
      }));
    } catch {
      return [];
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/src/__tests__/reflection.test.ts`
Expected: PASS (4 tests)

**Step 5: Update index.ts exports**

Add to `packages/telemetry/src/index.ts`:
```typescript
export type { SessionReflection } from './reflection.js';
export { SessionReflector } from './reflection.js';
```

**Step 6: Commit**

```bash
git add packages/telemetry/src/reflection.ts packages/telemetry/src/__tests__/reflection.test.ts packages/telemetry/src/index.ts
git commit -m "feat(telemetry): add session reflection with 3-question BMO template"
```

---

### Task 4: Create `@auxiora/verification` package — independent job verification

Port nightwire's verification agent pattern: after a job completes, a separate verification pass reviews the output for security concerns and logic errors. Verification failures block job completion.

**Files:**
- Create: `packages/verification/package.json`
- Create: `packages/verification/tsconfig.json`
- Create: `packages/verification/src/index.ts`
- Create: `packages/verification/src/types.ts`
- Create: `packages/verification/src/verifier.ts`
- Create: `packages/verification/src/__tests__/verifier.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/verification/src/__tests__/verifier.test.ts
import { describe, it, expect } from 'vitest';
import { JobVerifier } from '../verifier.js';
import type { VerificationContext } from '../types.js';

describe('JobVerifier', () => {
  const verifier = new JobVerifier();

  it('passes clean output', () => {
    const ctx: VerificationContext = {
      jobId: 'j1',
      jobType: 'behavior',
      output: 'Successfully completed the daily briefing. No issues found.',
      durationMs: 5000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(true);
    expect(result.securityConcerns.length).toBe(0);
    expect(result.logicErrors.length).toBe(0);
  });

  it('flags dynamic code construction patterns', () => {
    const ctx: VerificationContext = {
      jobId: 'j2',
      jobType: 'react',
      output: 'Used new Function("return " + userInput) to process data.',
      durationMs: 3000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(false);
    expect(result.securityConcerns.length).toBeGreaterThan(0);
  });

  it('flags hardcoded credentials', () => {
    const ctx: VerificationContext = {
      jobId: 'j3',
      jobType: 'workflow',
      output: 'Set API_KEY="sk-abc123def456ghi789" in the config file.',
      durationMs: 2000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(false);
    expect(result.securityConcerns.some(c => c.toLowerCase().includes('credential') || c.toLowerCase().includes('secret'))).toBe(true);
  });

  it('flags shell command injection patterns', () => {
    const ctx: VerificationContext = {
      jobId: 'j4',
      jobType: 'react',
      output: 'Running command with string concatenation: "rm -rf " + userInput',
      durationMs: 1000,
    };
    const result = verifier.verify(ctx);
    expect(result.passed).toBe(false);
  });

  it('flags extremely long outputs as suspicious', () => {
    const ctx: VerificationContext = {
      jobId: 'j5',
      jobType: 'behavior',
      output: 'a'.repeat(500_001),
      durationMs: 100,
    };
    const result = verifier.verify(ctx);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns metadata with verification timing', () => {
    const ctx: VerificationContext = {
      jobId: 'j6',
      jobType: 'behavior',
      output: 'All good.',
      durationMs: 1000,
    };
    const result = verifier.verify(ctx);
    expect(result.verifiedAt).toBeGreaterThan(0);
    expect(result.jobId).toBe('j6');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/verification/src/__tests__/verifier.test.ts`
Expected: FAIL

**Step 3: Create package scaffolding + implementation**

```typescript
// packages/verification/src/types.ts
export interface VerificationContext {
  readonly jobId: string;
  readonly jobType: string;
  readonly output: string;
  readonly durationMs: number;
  readonly filesChanged?: string[];
}

export interface VerificationResult {
  readonly jobId: string;
  readonly passed: boolean;
  readonly securityConcerns: string[];
  readonly logicErrors: string[];
  readonly warnings: string[];
  readonly verifiedAt: number;
}
```

```typescript
// packages/verification/src/verifier.ts
import type { VerificationContext, VerificationResult } from './types.js';

const SECURITY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bnew\s+Function\s*\(/i, label: 'Dynamic Function constructor (code injection risk)' },
  { pattern: /(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*=\s*["'][^"']{8,}/i, label: 'Hardcoded credential or secret detected' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/i, label: 'Possible API key literal in output' },
  { pattern: /child_process/i, label: 'Direct child_process usage (prefer safe wrappers)' },
  { pattern: /pickle\.loads?\b/i, label: 'Pickle deserialization risk' },
  { pattern: /innerHTML\s*=/i, label: 'innerHTML assignment (XSS risk)' },
  { pattern: /dangerouslySetInnerHTML/i, label: 'dangerouslySetInnerHTML usage (XSS risk)' },
  { pattern: /rm\s+-rf\s*["'`]?\s*\+/i, label: 'Shell command injection via string concatenation' },
];

const MAX_OUTPUT_LENGTH = 500_000;

/**
 * Independent verification of job output.
 *
 * Inspired by nightwire's VerificationAgent: "No agent should verify its own work."
 * Scans output for security concerns, logic errors, and suspicious patterns.
 * Verification failures block job completion (fail-closed).
 */
export class JobVerifier {
  verify(ctx: VerificationContext): VerificationResult {
    const securityConcerns: string[] = [];
    const logicErrors: string[] = [];
    const warnings: string[] = [];

    // Security pattern scanning
    for (const { pattern, label } of SECURITY_PATTERNS) {
      if (pattern.test(ctx.output)) {
        securityConcerns.push(label);
      }
    }

    // Suspicious output length
    if (ctx.output.length > MAX_OUTPUT_LENGTH) {
      warnings.push(`Output exceeds ${MAX_OUTPUT_LENGTH} chars (${ctx.output.length}) — may contain exfiltrated data`);
    }

    // Empty output for long-running jobs
    if (ctx.output.trim().length === 0 && ctx.durationMs > 5000) {
      logicErrors.push('Job ran for >5s but produced no output');
    }

    const passed = securityConcerns.length === 0 && logicErrors.length === 0;

    return {
      jobId: ctx.jobId,
      passed,
      securityConcerns,
      logicErrors,
      warnings,
      verifiedAt: Date.now(),
    };
  }
}
```

```typescript
// packages/verification/src/index.ts
export type { VerificationContext, VerificationResult } from './types.js';
export { JobVerifier } from './verifier.js';
```

Package.json and tsconfig.json follow same pattern as telemetry package.

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/verification/src/__tests__/verifier.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/verification/
git commit -m "feat(verification): add independent job output verifier (nightwire-inspired)"
```

---

### Task 5: Add quality gates with regression detection to job queue

Port nightwire's baseline snapshot + regression detection pattern. Before a job runs, snapshot the current test state; after it completes, compare. Only fail if NEW failures are introduced.

**Files:**
- Create: `packages/job-queue/src/quality-gates.ts`
- Create: `packages/job-queue/src/__tests__/quality-gates.test.ts`
- Modify: `packages/job-queue/src/index.ts` (add export)

**Step 1: Write the failing test**

```typescript
// packages/job-queue/src/__tests__/quality-gates.test.ts
import { describe, it, expect } from 'vitest';
import { QualityGateChecker } from '../quality-gates.js';
import type { TestBaseline, QualityGateResult } from '../quality-gates.js';

describe('QualityGateChecker', () => {
  const checker = new QualityGateChecker();

  it('passes when no regressions introduced', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };

    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(true);
    expect(result.regressionDetected).toBe(false);
  });

  it('detects regressions (new failures)', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 100, passed: 95, failed: 5, timestamp: Date.now() };

    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(false);
    expect(result.regressionDetected).toBe(true);
    expect(result.newFailures).toBe(3);
  });

  it('passes when pre-existing failures decrease', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 90, failed: 10, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 100, passed: 95, failed: 5, timestamp: Date.now() };

    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(true);
    expect(result.newFailures).toBe(0);
  });

  it('passes when new tests are added and all pass', () => {
    const baseline: TestBaseline = { totalTests: 100, passed: 98, failed: 2, timestamp: Date.now() };
    const current: TestBaseline = { totalTests: 110, passed: 108, failed: 2, timestamp: Date.now() };

    const result = checker.compare(baseline, current);
    expect(result.passed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/src/__tests__/quality-gates.test.ts`
Expected: FAIL

**Step 3: Implement QualityGateChecker**

```typescript
// packages/job-queue/src/quality-gates.ts
/**
 * Quality gate with regression detection.
 *
 * Inspired by nightwire: take a test baseline BEFORE a job runs,
 * compare AFTER. Only fail if NEW failures are introduced.
 * Pre-existing failures don't block completion.
 */

export interface TestBaseline {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly timestamp: number;
}

export interface QualityGateResult {
  readonly passed: boolean;
  readonly regressionDetected: boolean;
  readonly newFailures: number;
  readonly baseline: TestBaseline;
  readonly current: TestBaseline;
  readonly summary: string;
}

export class QualityGateChecker {
  compare(baseline: TestBaseline, current: TestBaseline): QualityGateResult {
    const newFailures = Math.max(0, current.failed - baseline.failed);
    const regressionDetected = newFailures > 0;

    let summary: string;
    if (!regressionDetected) {
      if (current.failed < baseline.failed) {
        summary = `Improved: ${baseline.failed - current.failed} fewer failures (${current.passed}/${current.totalTests} passing)`;
      } else {
        summary = `No regressions (${current.passed}/${current.totalTests} passing)`;
      }
    } else {
      summary = `REGRESSION: ${newFailures} new failure(s) introduced (was ${baseline.failed}, now ${current.failed})`;
    }

    return {
      passed: !regressionDetected,
      regressionDetected,
      newFailures,
      baseline,
      current,
      summary,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/src/__tests__/quality-gates.test.ts`
Expected: PASS (4 tests)

**Step 5: Add export**

Add to `packages/job-queue/src/index.ts`:
```typescript
export type { TestBaseline, QualityGateResult } from './quality-gates.js';
export { QualityGateChecker } from './quality-gates.js';
```

**Step 6: Commit**

```bash
git add packages/job-queue/src/quality-gates.ts packages/job-queue/src/__tests__/quality-gates.test.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add quality gates with regression detection (nightwire-inspired)"
```

---

### Task 6: Add resource guard to job queue

Check system memory before dispatching jobs. If resources are depleted, defer the job instead of risking OOM or degraded performance.

**Files:**
- Create: `packages/job-queue/src/resource-guard.ts`
- Create: `packages/job-queue/src/__tests__/resource-guard.test.ts`
- Modify: `packages/job-queue/src/index.ts` (add export)

**Step 1: Write the failing test**

```typescript
// packages/job-queue/src/__tests__/resource-guard.test.ts
import { describe, it, expect } from 'vitest';
import { ResourceGuard } from '../resource-guard.js';

describe('ResourceGuard', () => {
  it('allows dispatch when resources are available', () => {
    const guard = new ResourceGuard({ memoryThresholdPercent: 90, minFreeMemoryMB: 512 });
    const result = guard.checkWith({ usedPercent: 60, freeMB: 4096 });
    expect(result.allowed).toBe(true);
  });

  it('blocks when memory usage exceeds threshold', () => {
    const guard = new ResourceGuard({ memoryThresholdPercent: 90, minFreeMemoryMB: 512 });
    const result = guard.checkWith({ usedPercent: 95, freeMB: 200 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('memory');
  });

  it('blocks when free memory is too low', () => {
    const guard = new ResourceGuard({ memoryThresholdPercent: 90, minFreeMemoryMB: 512 });
    const result = guard.checkWith({ usedPercent: 70, freeMB: 256 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('free memory');
  });

  it('uses defaults when no options provided', () => {
    const guard = new ResourceGuard();
    const result = guard.checkWith({ usedPercent: 50, freeMB: 8000 });
    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/src/__tests__/resource-guard.test.ts`
Expected: FAIL

**Step 3: Implement ResourceGuard**

```typescript
// packages/job-queue/src/resource-guard.ts
import { freemem, totalmem } from 'node:os';

export interface ResourceGuardOptions {
  memoryThresholdPercent?: number;
  minFreeMemoryMB?: number;
}

export interface ResourceCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly usedPercent: number;
  readonly freeMB: number;
}

interface MemorySnapshot {
  usedPercent: number;
  freeMB: number;
}

/**
 * Pre-dispatch resource check for the job queue.
 *
 * Inspired by nightwire's ResourceGuard: check system capacity
 * before spawning workers. Defers jobs instead of risking OOM.
 */
export class ResourceGuard {
  private readonly memoryThreshold: number;
  private readonly minFreeMB: number;

  constructor(options?: ResourceGuardOptions) {
    this.memoryThreshold = options?.memoryThresholdPercent ?? 90;
    this.minFreeMB = options?.minFreeMemoryMB ?? 512;
  }

  check(): ResourceCheckResult {
    const free = freemem();
    const total = totalmem();
    const usedPercent = ((total - free) / total) * 100;
    const freeMB = free / (1024 * 1024);
    return this.checkWith({ usedPercent, freeMB });
  }

  checkWith(snapshot: MemorySnapshot): ResourceCheckResult {
    if (snapshot.usedPercent > this.memoryThreshold) {
      return {
        allowed: false,
        reason: `System memory usage at ${Math.round(snapshot.usedPercent)}% (threshold: ${this.memoryThreshold}%)`,
        usedPercent: snapshot.usedPercent,
        freeMB: snapshot.freeMB,
      };
    }

    if (snapshot.freeMB < this.minFreeMB) {
      return {
        allowed: false,
        reason: `Only ${Math.round(snapshot.freeMB)}MB free memory available (minimum: ${this.minFreeMB}MB)`,
        usedPercent: snapshot.usedPercent,
        freeMB: snapshot.freeMB,
      };
    }

    return {
      allowed: true,
      reason: '',
      usedPercent: snapshot.usedPercent,
      freeMB: snapshot.freeMB,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/src/__tests__/resource-guard.test.ts`
Expected: PASS (4 tests)

**Step 5: Add export and commit**

```bash
git add packages/job-queue/src/resource-guard.ts packages/job-queue/src/__tests__/resource-guard.test.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add resource guard for pre-dispatch capacity check (nightwire-inspired)"
```

---

### Task 7: Wire telemetry into job queue event emitter

Connect TelemetryTracker to JobQueue's event system so every job completion/failure is automatically tracked.

**Files:**
- Create: `packages/runtime/src/telemetry-wiring.ts`
- Create: `packages/runtime/src/__tests__/telemetry-wiring.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/__tests__/telemetry-wiring.test.ts
import { describe, it, expect, vi } from 'vitest';
import { wireTelemetry } from '../telemetry-wiring.js';

describe('wireTelemetry', () => {
  it('records completed jobs to telemetry tracker', () => {
    const tracker = { recordJob: vi.fn(), record: vi.fn() };
    const emitter = { on: vi.fn() };

    wireTelemetry(emitter, tracker);

    const completedHandler = emitter.on.mock.calls.find((c: any) => c[0] === 'job:completed');
    expect(completedHandler).toBeTruthy();

    completedHandler![1]({
      job: { id: 'j1', type: 'behavior', status: 'completed', createdAt: Date.now() - 5000, completedAt: Date.now() },
      result: {},
    });

    expect(tracker.recordJob).toHaveBeenCalledWith(expect.objectContaining({
      type: 'behavior',
      success: true,
      jobId: 'j1',
    }));
  });

  it('records failed jobs to telemetry tracker', () => {
    const tracker = { recordJob: vi.fn(), record: vi.fn() };
    const emitter = { on: vi.fn() };

    wireTelemetry(emitter, tracker);

    const failedHandler = emitter.on.mock.calls.find((c: any) => c[0] === 'job:failed');
    failedHandler![1]({
      job: { id: 'j2', type: 'react', status: 'failed', createdAt: Date.now() - 1000, completedAt: Date.now() },
      error: new Error('timeout'),
    });

    expect(tracker.recordJob).toHaveBeenCalledWith(expect.objectContaining({
      type: 'react',
      success: false,
      jobId: 'j2',
    }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/src/__tests__/telemetry-wiring.test.ts`
Expected: FAIL

**Step 3: Implement wireTelemetry**

```typescript
// packages/runtime/src/telemetry-wiring.ts
import { getLogger } from '@auxiora/logger';

const logger = getLogger('runtime:telemetry-wiring');

/** Structural types to avoid direct imports */
interface TelemetryTrackerLike {
  recordJob(outcome: { type: string; success: boolean; durationMs: number; jobId: string; error?: string }): void;
}

interface JobEmitterLike {
  on(event: string, listener: (data: unknown) => void): void;
}

/**
 * Wire job queue events to telemetry tracker.
 *
 * Listens to job:completed, job:failed, job:dead events and records
 * them for operational telemetry and self-improvement loops.
 */
export function wireTelemetry(emitter: JobEmitterLike, tracker: TelemetryTrackerLike): void {
  emitter.on('job:completed', (data: unknown) => {
    const { job } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number } };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: true, durationMs, jobId: job.id });
    logger.debug('Telemetry: job completed', { jobId: job.id, type: job.type, durationMs });
  });

  emitter.on('job:failed', (data: unknown) => {
    const { job, error } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number }; error?: Error };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: false, durationMs, jobId: job.id, error: error?.message });
    logger.debug('Telemetry: job failed', { jobId: job.id, type: job.type });
  });

  emitter.on('job:dead', (data: unknown) => {
    const { job, error } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number }; error?: Error };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: false, durationMs, jobId: job.id, error: error?.message ?? 'dead letter' });
    logger.debug('Telemetry: job dead', { jobId: job.id, type: job.type });
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/src/__tests__/telemetry-wiring.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/telemetry-wiring.ts packages/runtime/src/__tests__/telemetry-wiring.test.ts
git commit -m "feat(runtime): wire job queue events to telemetry tracker"
```

---

### Task 8: Wire TelemetryStage into buildEnrichmentPipeline

Connect the TelemetryStage (Task 2) into the runtime's `buildEnrichmentPipeline()` so operational insights flow into every prompt.

**Files:**
- Modify: `packages/runtime/src/index.ts` (add TelemetryStage to buildEnrichmentPipeline)
- Modify: `packages/runtime/src/enrichment/__tests__/integration.test.ts` (add telemetry integration test)

**Step 1: Write the failing test**

Add to the existing integration test:

```typescript
it('includes telemetry warnings in enriched prompt when tools are flagged', async () => {
  const pipeline = new EnrichmentPipeline();
  pipeline.addStage(new TelemetryStage(() => [
    { tool: 'provider.complete', totalCalls: 20, successRate: 0.3, lastError: 'rate limited' },
  ]));

  const result = await pipeline.run(makeCtx());
  expect(result.prompt).toContain('[Operational Telemetry]');
  expect(result.metadata.stages).toContain('telemetry');
});
```

**Step 2: Run test to verify it fails, then wire**

In `buildEnrichmentPipeline()` in `packages/runtime/src/index.ts`, add before MemoryStage:

```typescript
if (this.telemetryTracker) {
  this.enrichmentPipeline.addStage(new TelemetryStage(
    () => this.telemetryTracker!.getFlaggedTools(0.7, 5),
  ));
}
```

**Step 3: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/src/enrichment/__tests__/integration.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/src/enrichment/__tests__/integration.test.ts
git commit -m "feat(runtime): wire TelemetryStage into enrichment pipeline (order 50)"
```

---

### Task 9: Wire session reflection into runtime session close

When a session ends (timeout or explicit close), trigger a reflection and persist it.

**Files:**
- Modify: `packages/runtime/src/index.ts` (add reflection on session close)

**Step 1: Add session close hook**

In the runtime's session timeout/close handler, add:

```typescript
// When session ends:
if (this.telemetryTracker && this.sessionReflector) {
  const reflection = this.sessionReflector.reflect(sessionId);
  this.sessionReflector.save(reflection);
  logger.info('Session reflection saved', {
    sessionId,
    toolsUsed: reflection.toolsUsed,
    successRate: reflection.overallSuccessRate,
    issues: reflection.issues.length,
  });
}
```

**Step 2: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): trigger session reflection on session close (BMO Loop 3)"
```

---

### Task 10: Add "battery change" behavior for periodic deep self-review

Create a scheduled behavior that runs periodically to analyze aggregated telemetry, generate an improvement report, and surface it. This is BMO's Loop 4 (Battery Change).

**Files:**
- Create: `packages/telemetry/src/battery-change.ts`
- Create: `packages/telemetry/src/__tests__/battery-change.test.ts`
- Modify: `packages/telemetry/src/index.ts` (add export)

**Step 1: Write the failing test**

```typescript
// packages/telemetry/src/__tests__/battery-change.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BatteryChangeReviewer } from '../battery-change.js';
import { TelemetryTracker } from '../tracker.js';
import { SessionReflector } from '../reflection.js';

describe('BatteryChangeReviewer', () => {
  let dir: string;
  let tracker: TelemetryTracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'battery-'));
    tracker = new TelemetryTracker(join(dir, 'telemetry.db'));
  });

  afterEach(() => {
    tracker.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('generates improvement report from telemetry', () => {
    for (let i = 0; i < 20; i++) {
      tracker.record({ tool: 'provider.complete', success: i < 14, durationMs: 500, error: i >= 14 ? 'timeout' : '' });
    }
    tracker.record({ tool: 'memory.search', success: true, durationMs: 100 });

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();

    expect(report).toContain('Self-Improvement Report');
    expect(report).toContain('provider.complete');
    expect(report.length).toBeGreaterThan(100);
  });

  it('includes recent reflections in report', () => {
    tracker.record({ tool: 'a', success: true, durationMs: 100 });
    const reflector = new SessionReflector(tracker);
    const r = reflector.reflect('s1');
    reflector.save(r);

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();
    expect(report).toContain('Recent Session Reflections');
  });

  it('produces actionable suggestions', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'flaky', success: i < 3, durationMs: 100, error: 'rate limit' });
    }

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();
    expect(report).toContain('Suggestions');
    expect(report).toContain('flaky');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/src/__tests__/battery-change.test.ts`
Expected: FAIL

**Step 3: Implement BatteryChangeReviewer**

```typescript
// packages/telemetry/src/battery-change.ts
import type { TelemetryTracker } from './tracker.js';
import { SessionReflector } from './reflection.js';

/**
 * Battery Change reviewer — periodic deep self-review.
 *
 * BMO Loop 4: Periodically analyze aggregated telemetry, recent
 * reflections, and generate actionable improvement suggestions.
 */
export class BatteryChangeReviewer {
  private readonly reflector: SessionReflector;

  constructor(private readonly tracker: TelemetryTracker) {
    this.reflector = new SessionReflector(tracker);
  }

  generateReport(): string {
    const allStats = this.tracker.getAllStats();
    const reflections = this.reflector.getRecentReflections(10);

    const lines: string[] = ['# Auxiora Self-Improvement Report', ''];

    // Tool Performance
    lines.push('## Tool Performance', '');
    if (allStats.length === 0) {
      lines.push('No tool invocations recorded yet.', '');
    } else {
      for (const s of allStats) {
        const pct = Math.round(s.successRate * 100);
        const status = s.successRate >= 0.8 ? 'OK' : s.successRate >= 0.5 ? 'DEGRADED' : 'CRITICAL';
        lines.push(`- **${s.tool}**: ${pct}% success (${s.totalCalls} calls, avg ${Math.round(s.avgDurationMs)}ms) [${status}]`);
        if (s.lastError && s.successRate < 0.8) {
          lines.push(`  Last error: ${s.lastError.slice(0, 200)}`);
        }
      }
      lines.push('');
    }

    // Recent Session Reflections
    if (reflections.length > 0) {
      lines.push('## Recent Session Reflections', '');
      for (const r of reflections.slice(0, 5)) {
        lines.push(`- **${r.sessionId}**: ${r.summary}`);
        for (const issue of r.issues) {
          lines.push(`  - Issue: ${issue}`);
        }
      }
      lines.push('');
    }

    // Suggestions
    lines.push('## Suggestions', '');
    const flagged = allStats.filter(s => s.successRate < 0.7 && s.totalCalls >= 5);
    if (flagged.length > 0) {
      for (const s of flagged) {
        lines.push(`- Investigate ${s.tool} failures (${Math.round(s.successRate * 100)}% success, last: ${s.lastError || 'unknown'})`);
      }
    }

    const allIssues = new Set<string>();
    for (const r of reflections) {
      for (const change of r.whatToChange) {
        allIssues.add(change);
      }
    }
    for (const issue of [...allIssues].slice(0, 5)) {
      lines.push(`- ${issue}`);
    }

    if (flagged.length === 0 && allIssues.size === 0) {
      lines.push('- All systems performing within normal parameters.');
    }
    lines.push('');

    return lines.join('\n');
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/src/__tests__/battery-change.test.ts`
Expected: PASS (3 tests)

**Step 5: Add export and commit**

Add to `packages/telemetry/src/index.ts`:
```typescript
export { BatteryChangeReviewer } from './battery-change.js';
```

```bash
git add packages/telemetry/src/battery-change.ts packages/telemetry/src/__tests__/battery-change.test.ts packages/telemetry/src/index.ts
git commit -m "feat(telemetry): add battery change reviewer for periodic deep self-review (BMO Loop 4)"
```

---

### Task 11: Add gateway endpoints for telemetry and self-review

Expose telemetry stats and self-improvement report via the dashboard/gateway API.

**Files:**
- Modify: `packages/dashboard/src/routes.ts` or equivalent (add GET /api/v1/telemetry/stats, GET /api/v1/telemetry/report)

**Step 1: Add routes**

```typescript
// GET /api/v1/telemetry/stats — returns tool stats + job stats
router.get('/api/v1/telemetry/stats', (_req, res) => {
  if (!telemetryTracker) return res.status(503).json({ error: 'Telemetry not initialized' });
  const toolStats = telemetryTracker.getAllStats();
  res.json({ tools: toolStats, flagged: telemetryTracker.getFlaggedTools(0.7, 5) });
});

// GET /api/v1/telemetry/report — generates self-improvement report
router.get('/api/v1/telemetry/report', (_req, res) => {
  if (!telemetryTracker) return res.status(503).json({ error: 'Telemetry not initialized' });
  const reviewer = new BatteryChangeReviewer(telemetryTracker);
  const report = reviewer.generateReport();
  res.json({ report });
});
```

**Step 2: Add test**

```typescript
it('GET /api/v1/telemetry/stats returns tool stats', async () => {
  const res = await request(app).get('/api/v1/telemetry/stats');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('tools');
  expect(res.body).toHaveProperty('flagged');
});
```

**Step 3: Commit**

```bash
git add packages/dashboard/src/
git commit -m "feat(dashboard): add telemetry stats and self-improvement report endpoints"
```

---

## Summary

| Task | Package | What | Source | Tests |
|------|---------|------|--------|-------|
| 1 | `@auxiora/telemetry` | Persistent tool/job tracker | BMO telemetry.json | 6 |
| 2 | `runtime/enrichment` | TelemetryStage (order 50) | BMO prompt injection | 6 |
| 3 | `@auxiora/telemetry` | Session reflection (3-question) | BMO Loop 3 | 4 |
| 4 | `@auxiora/verification` | Independent job verifier | Nightwire VerificationAgent | 6 |
| 5 | `@auxiora/job-queue` | Quality gates + regression detection | Nightwire QualityGateRunner | 4 |
| 6 | `@auxiora/job-queue` | Resource guard (memory check) | Nightwire ResourceGuard | 4 |
| 7 | `runtime` | Wire telemetry to job queue events | Integration | 2 |
| 8 | `runtime` | Wire TelemetryStage into pipeline | Integration | 1 |
| 9 | `runtime` | Session reflection on session close | BMO Loop 3 | 0* |
| 10 | `@auxiora/telemetry` | Battery change deep self-review | BMO Loop 4 | 3 |
| 11 | `dashboard` | Gateway API for telemetry/report | Observability | 1 |

**Total: 11 tasks, ~37 new tests, 2 new packages, 1 new enrichment stage, 2 new gateway endpoints**

\* Task 9 modifies existing runtime code to wire session reflection — tested via existing runtime tests.

### BMO Loop Mapping

| BMO Loop | Auxiora Implementation | Task |
|----------|----------------------|------|
| Loop 1 — Build It Now | Existing: `@auxiora/skill-author` | — |
| Loop 2 — Active Learning | `TelemetryTracker` + job event wiring | 1, 7 |
| Loop 3 — Self-Reflection | `SessionReflector` on session close | 3, 9 |
| Loop 4 — Battery Change | `BatteryChangeReviewer` scheduled behavior | 10 |
| telemetry.json to prompt | `TelemetryStage` in enrichment pipeline | 2, 8 |

### Nightwire Pattern Mapping

| Nightwire Feature | Auxiora Implementation | Task |
|-------------------|----------------------|------|
| VerificationAgent | `@auxiora/verification` JobVerifier | 4 |
| QualityGateRunner | `QualityGateChecker` with regression detection | 5 |
| ResourceGuard | `ResourceGuard` with memory check | 6 |
| LearningExtractor to prompt | `TelemetryStage` + `SessionReflector` | 2, 3 |
