# Self-Improving System Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rate-limit cooldown, learning extraction, stale job detection, verification retry, and persistent change log to complete the self-improving feedback loops.

**Architecture:** Extends Phase 1 (telemetry, reflection, verification, quality gates) with closed-loop improvements. New modules go in existing `packages/telemetry/`, `packages/job-queue/`, `packages/verification/`, and `packages/runtime/`. All cross-package deps use structural types.

**Tech Stack:** TypeScript strict ESM, node:sqlite WAL, vitest, structural typing

---

## Context

### Existing Modules (Phase 1)
- `packages/telemetry/src/tracker.ts` — TelemetryTracker: SQLite WAL store for `tool_invocations`, `job_outcomes`, `session_reflections`. Methods: `recordTool()`, `recordJob()`, `getToolStats()`, `getJobStats()`, `saveReflection()`, `getReflections()`
- `packages/telemetry/src/types.ts` — `ToolInvocation`, `ToolStats`, `JobOutcome`, `JobTypeStats`
- `packages/job-queue/src/queue.ts` — JobQueue: polling queue with EventEmitter (`job:completed`, `job:failed`, `job:dead`), `register()`, `enqueue()`, `start()`, `stop()`
- `packages/job-queue/src/db.ts` — JobDatabase: `recoverCrashed()` resets `running` → `pending`, `failJob()` with exponential backoff
- `packages/runtime/src/telemetry-wiring.ts` — `wireTelemetry(emitter, tracker)`: listens to job events, records to tracker
- `packages/runtime/src/enrichment/stages/telemetry-stage.ts` — TelemetryStage (order 50): injects flagged tool warnings into prompts
- `packages/verification/src/verifier.ts` — JobVerifier: 8 security regex patterns, output length check, empty output check
- `packages/verification/src/types.ts` — `VerificationContext`, `VerificationResult`

### Enrichment Pipeline Pattern
- Interface: `EnrichmentStage { name, order, enabled(ctx), enrich(ctx, prompt) }`
- `enabled()` can cache data for `enrich()` — always add fallback re-fetch in `enrich()`
- Constructor takes getter functions with structural types (no cross-package imports)
- Current stages: TelemetryStage(50) → MemoryStage(100) → ModeStage(200) → ArchitectStage(300) → SelfAwarenessStage(400) → ModelIdentityStage(500)

---

### Task 1: Rate Limit Cooldown

**Files:**
- Create: `packages/telemetry/src/rate-limit-cooldown.ts`
- Create: `packages/telemetry/tests/rate-limit-cooldown.test.ts`
- Modify: `packages/telemetry/src/index.ts` (add export)

**Context:** When a tool or provider repeatedly fails (e.g. rate-limited API), the system should automatically back off instead of hammering the failing endpoint. This implements a sliding-window failure tracker with configurable thresholds and cooldown timers.

**Step 1: Write the failing tests**

```typescript
// packages/telemetry/tests/rate-limit-cooldown.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimitCooldown } from '../src/rate-limit-cooldown.js';

describe('RateLimitCooldown', () => {
  let cooldown: RateLimitCooldown;

  beforeEach(() => {
    vi.useFakeTimers();
    cooldown = new RateLimitCooldown({
      windowMs: 60_000,       // 1 min window
      failureThreshold: 3,    // 3 failures triggers cooldown
      cooldownMs: 30_000,     // 30s cooldown
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows calls when below threshold', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('triggers cooldown at threshold', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);
  });

  it('clears cooldown after timer expires', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);

    vi.advanceTimersByTime(30_001);
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('evicts failures outside sliding window', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    vi.advanceTimersByTime(61_000);
    cooldown.recordFailure('openai');
    // Only 1 failure in window (2 evicted), below threshold
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('tracks keys independently', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);
    expect(cooldown.isCoolingDown('anthropic')).toBe(false);
  });

  it('returns remaining cooldown time', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    const remaining = cooldown.getRemainingCooldown('openai');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(30_000);
  });

  it('recordSuccess resets failure count', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordSuccess('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('getStatus returns all tracked keys', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('anthropic');
    const status = cooldown.getStatus();
    expect(status).toHaveLength(2);
    expect(status.map(s => s.key)).toContain('openai');
    expect(status.map(s => s.key)).toContain('anthropic');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/tests/rate-limit-cooldown.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/telemetry/src/rate-limit-cooldown.ts
export interface CooldownOptions {
  readonly windowMs: number;
  readonly failureThreshold: number;
  readonly cooldownMs: number;
}

export interface CooldownStatus {
  readonly key: string;
  readonly failureCount: number;
  readonly coolingDown: boolean;
  readonly remainingMs: number;
}

export class RateLimitCooldown {
  private failures = new Map<string, number[]>();
  private cooldownUntil = new Map<string, number>();
  private readonly windowMs: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: CooldownOptions) {
    this.windowMs = options.windowMs;
    this.failureThreshold = options.failureThreshold;
    this.cooldownMs = options.cooldownMs;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const timestamps = this.failures.get(key) ?? [];
    timestamps.push(now);
    this.failures.set(key, timestamps);

    this.evictOld(key, now);

    const recent = this.failures.get(key)!;
    if (recent.length >= this.failureThreshold) {
      this.cooldownUntil.set(key, now + this.cooldownMs);
    }
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
  }

  isCoolingDown(key: string): boolean {
    const until = this.cooldownUntil.get(key);
    if (!until) return false;
    if (Date.now() >= until) {
      this.cooldownUntil.delete(key);
      return false;
    }
    return true;
  }

  getRemainingCooldown(key: string): number {
    const until = this.cooldownUntil.get(key);
    if (!until) return 0;
    const remaining = until - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  getStatus(): CooldownStatus[] {
    const keys = new Set([...this.failures.keys(), ...this.cooldownUntil.keys()]);
    const result: CooldownStatus[] = [];
    for (const key of keys) {
      this.evictOld(key, Date.now());
      result.push({
        key,
        failureCount: this.failures.get(key)?.length ?? 0,
        coolingDown: this.isCoolingDown(key),
        remainingMs: this.getRemainingCooldown(key),
      });
    }
    return result;
  }

  private evictOld(key: string, now: number): void {
    const timestamps = this.failures.get(key);
    if (!timestamps) return;
    const cutoff = now - this.windowMs;
    const recent = timestamps.filter(t => t > cutoff);
    if (recent.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, recent);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/tests/rate-limit-cooldown.test.ts`
Expected: 8 tests PASS

**Step 5: Add export to barrel**

Add to `packages/telemetry/src/index.ts`:
```typescript
export { RateLimitCooldown } from './rate-limit-cooldown.js';
export type { CooldownOptions, CooldownStatus } from './rate-limit-cooldown.js';
```

**Step 6: Commit**

```bash
git add packages/telemetry/src/rate-limit-cooldown.ts packages/telemetry/tests/rate-limit-cooldown.test.ts packages/telemetry/src/index.ts
git commit -m "feat(telemetry): add rate limit cooldown with sliding window"
```

---

### Task 2: Learning Extraction Store

**Files:**
- Create: `packages/telemetry/src/learning-store.ts`
- Create: `packages/telemetry/tests/learning-store.test.ts`
- Modify: `packages/telemetry/src/index.ts` (add export)

**Context:** Extracts patterns, pitfalls, and best practices from job output. Stores them in SQLite for injection into future prompts via the LearningStage (Task 3). Learnings are extracted by scanning output for explicit markers like `Note:`, `Warning:`, `Pattern:`, `Pitfall:`, `Best practice:`, `Learned:`.

**Step 1: Write the failing tests**

```typescript
// packages/telemetry/tests/learning-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LearningStore } from '../src/learning-store.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('LearningStore', () => {
  let store: LearningStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `learning-test-${Date.now()}.db`);
    store = new LearningStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('extracts learnings from output with markers', () => {
    const output = `
      Did some work.
      Note: Always validate input before processing.
      More output here.
      Warning: The API rate-limits after 100 requests per minute.
      Pattern: Use retry with exponential backoff for transient failures.
    `;
    const count = store.extractAndStore(output, 'job-1', 'build');
    expect(count).toBe(3);
  });

  it('retrieves stored learnings', () => {
    store.extractAndStore('Note: Cache responses to reduce latency.', 'job-1', 'build');
    const learnings = store.getAll();
    expect(learnings).toHaveLength(1);
    expect(learnings[0].content).toBe('Cache responses to reduce latency.');
    expect(learnings[0].category).toBe('note');
    expect(learnings[0].jobType).toBe('build');
  });

  it('deduplicates identical learnings', () => {
    store.extractAndStore('Note: Always validate input.', 'job-1', 'build');
    store.extractAndStore('Note: Always validate input.', 'job-2', 'build');
    const learnings = store.getAll();
    expect(learnings).toHaveLength(1);
    expect(learnings[0].occurrences).toBe(2);
  });

  it('retrieves by category', () => {
    store.extractAndStore('Warning: API may timeout. Pattern: Use circuit breaker.', 'job-1', 'api');
    const warnings = store.getByCategory('warning');
    expect(warnings).toHaveLength(1);
    const patterns = store.getByCategory('pattern');
    expect(patterns).toHaveLength(1);
  });

  it('retrieves recent learnings with limit', () => {
    for (let i = 0; i < 10; i++) {
      store.extractAndStore(`Note: Learning number ${i}.`, `job-${i}`, 'build');
    }
    const recent = store.getRecent(5);
    expect(recent).toHaveLength(5);
  });

  it('returns empty array when no learnings exist', () => {
    expect(store.getAll()).toHaveLength(0);
    expect(store.getRecent(10)).toHaveLength(0);
  });

  it('handles output with no markers gracefully', () => {
    const count = store.extractAndStore('Just regular output with no markers.', 'job-1', 'build');
    expect(count).toBe(0);
    expect(store.getAll()).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/tests/learning-store.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/telemetry/src/learning-store.ts
import { DatabaseSync } from 'node:sqlite';

export interface Learning {
  readonly id: number;
  readonly content: string;
  readonly category: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly occurrences: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const MARKERS: Array<{ regex: RegExp; category: string }> = [
  { regex: /\bNote:\s*(.+)/gi, category: 'note' },
  { regex: /\bWarning:\s*(.+)/gi, category: 'warning' },
  { regex: /\bPattern:\s*(.+)/gi, category: 'pattern' },
  { regex: /\bPitfall:\s*(.+)/gi, category: 'pitfall' },
  { regex: /\bBest practice:\s*(.+)/gi, category: 'best_practice' },
  { regex: /\bLearned:\s*(.+)/gi, category: 'learned' },
];

export class LearningStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        occurrences INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(content, category)
      )
    `);
  }

  extractAndStore(output: string, jobId: string, jobType: string): number {
    if (this.closed) return 0;
    let count = 0;

    for (const { regex, category } of MARKERS) {
      // Reset lastIndex for global regexes
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(output)) !== null) {
        const content = match[1].trim();
        if (content.length > 0) {
          this.upsert(content, category, jobId, jobType);
          count++;
        }
      }
    }

    return count;
  }

  getAll(): Learning[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT * FROM learnings ORDER BY updated_at DESC',
    ).all() as Record<string, unknown>[];
    return rows.map(r => this.rowToLearning(r));
  }

  getByCategory(category: string): Learning[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT * FROM learnings WHERE category = ? ORDER BY updated_at DESC',
    ).all(category) as Record<string, unknown>[];
    return rows.map(r => this.rowToLearning(r));
  }

  getRecent(limit: number): Learning[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT * FROM learnings ORDER BY updated_at DESC LIMIT ?',
    ).all(limit) as Record<string, unknown>[];
    return rows.map(r => this.rowToLearning(r));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private upsert(content: string, category: string, jobId: string, jobType: string): void {
    const existing = this.db.prepare(
      'SELECT id, occurrences FROM learnings WHERE content = ? AND category = ?',
    ).get(content, category) as Record<string, unknown> | undefined;

    if (existing) {
      this.db.prepare(
        'UPDATE learnings SET occurrences = occurrences + 1, updated_at = unixepoch() WHERE id = ?',
      ).run(existing.id as number);
    } else {
      this.db.prepare(
        'INSERT INTO learnings (content, category, job_id, job_type) VALUES (?, ?, ?, ?)',
      ).run(content, category, jobId, jobType);
    }
  }

  private rowToLearning(row: Record<string, unknown>): Learning {
    return {
      id: row.id as number,
      content: row.content as string,
      category: row.category as string,
      jobId: row.job_id as string,
      jobType: row.job_type as string,
      occurrences: row.occurrences as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/tests/learning-store.test.ts`
Expected: 7 tests PASS

**Step 5: Add export to barrel**

Add to `packages/telemetry/src/index.ts`:
```typescript
export { LearningStore } from './learning-store.js';
export type { Learning } from './learning-store.js';
```

**Step 6: Commit**

```bash
git add packages/telemetry/src/learning-store.ts packages/telemetry/tests/learning-store.test.ts packages/telemetry/src/index.ts
git commit -m "feat(telemetry): add learning extraction store with dedup"
```

---

### Task 3: LearningStage Enrichment

**Files:**
- Create: `packages/runtime/src/enrichment/stages/learning-stage.ts`
- Create: `packages/runtime/tests/enrichment/learning-stage.test.ts`
- Modify: `packages/runtime/src/enrichment/index.ts` (add export)

**Context:** Injects recent learnings into prompts so the system avoids repeating past mistakes. Follows the same pattern as `TelemetryStage` — structural types, `enabled()` caching, fallback re-fetch in `enrich()`. Positioned at order 55 (right after TelemetryStage at 50).

**Step 1: Write the failing tests**

```typescript
// packages/runtime/tests/enrichment/learning-stage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LearningStage } from '../../src/enrichment/stages/learning-stage.js';
import type { EnrichmentContext } from '../../src/enrichment/types.js';

const makeCtx = (overrides?: Partial<EnrichmentContext>): EnrichmentContext => ({
  basePrompt: 'You are a helpful assistant.',
  userMessage: 'Hello',
  history: [],
  channelType: 'web',
  chatId: 'chat-1',
  sessionId: 'sess-1',
  userId: 'user-1',
  toolsUsed: [],
  config: {} as any,
  ...overrides,
});

describe('LearningStage', () => {
  it('is disabled when no learnings exist', () => {
    const stage = new LearningStage(() => []);
    expect(stage.enabled(makeCtx())).toBe(false);
  });

  it('is enabled when learnings exist', () => {
    const stage = new LearningStage(() => [
      { content: 'Cache responses', category: 'note', occurrences: 1 },
    ]);
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('injects learnings into prompt', async () => {
    const stage = new LearningStage(() => [
      { content: 'Always validate input', category: 'warning', occurrences: 3 },
      { content: 'Use retry for transient failures', category: 'pattern', occurrences: 1 },
    ]);
    stage.enabled(makeCtx());
    const result = await stage.enrich(makeCtx(), 'Base prompt.');
    expect(result.prompt).toContain('[Learned Patterns]');
    expect(result.prompt).toContain('Always validate input');
    expect(result.prompt).toContain('Use retry for transient failures');
    expect(result.prompt).toContain('(seen 3x)');
  });

  it('has order 55', () => {
    const stage = new LearningStage(() => []);
    expect(stage.order).toBe(55);
  });

  it('returns metadata with learning count', async () => {
    const stage = new LearningStage(() => [
      { content: 'test', category: 'note', occurrences: 1 },
    ]);
    stage.enabled(makeCtx());
    const result = await stage.enrich(makeCtx(), 'prompt');
    expect(result.metadata).toEqual({ learningCount: 1 });
  });

  it('falls back to getter if enabled() was not called', async () => {
    const stage = new LearningStage(() => [
      { content: 'fallback works', category: 'note', occurrences: 1 },
    ]);
    // Skip enabled() — go directly to enrich()
    const result = await stage.enrich(makeCtx(), 'prompt');
    expect(result.prompt).toContain('fallback works');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/enrichment/learning-stage.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/runtime/src/enrichment/stages/learning-stage.ts
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

/** Structural type — avoids importing @auxiora/telemetry directly */
export interface LearningLike {
  readonly content: string;
  readonly category: string;
  readonly occurrences: number;
}

export class LearningStage implements EnrichmentStage {
  readonly name = 'learning';
  readonly order = 55;

  private cachedLearnings: LearningLike[] = [];

  constructor(
    private readonly getRecentLearnings: () => LearningLike[],
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    this.cachedLearnings = this.getRecentLearnings();
    return this.cachedLearnings.length > 0;
  }

  async enrich(_ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const learnings = this.cachedLearnings.length > 0
      ? this.cachedLearnings
      : this.getRecentLearnings();

    if (learnings.length === 0) {
      return { prompt: currentPrompt };
    }

    const lines = ['[Learned Patterns]', 'Insights from previous tasks:'];
    for (const l of learnings) {
      let line = `- [${l.category}] ${l.content}`;
      if (l.occurrences > 1) {
        line += ` (seen ${l.occurrences}x)`;
      }
      lines.push(line);
    }
    lines.push('Apply these insights where relevant.');
    lines.push('');

    const section = lines.join('\n');

    return {
      prompt: currentPrompt + '\n\n' + section,
      metadata: { learningCount: learnings.length },
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/enrichment/learning-stage.test.ts`
Expected: 6 tests PASS

**Step 5: Add export**

Add to `packages/runtime/src/enrichment/index.ts`:
```typescript
export { LearningStage } from './stages/learning-stage.js';
export type { LearningLike } from './stages/learning-stage.js';
```

**Step 6: Commit**

```bash
git add packages/runtime/src/enrichment/stages/learning-stage.ts packages/runtime/tests/enrichment/learning-stage.test.ts packages/runtime/src/enrichment/index.ts
git commit -m "feat(runtime): add LearningStage enrichment at order 55"
```

---

### Task 4: Wire Learning Extraction into Job Events and Pipeline

**Files:**
- Modify: `packages/runtime/src/telemetry-wiring.ts` (add learning extraction on job:completed)
- Create: `packages/runtime/tests/telemetry-wiring-learning.test.ts`
- Modify: `packages/runtime/src/index.ts` (wire LearningStore + LearningStage in initialize)

**Context:** When a job completes, its output should be scanned for learnings. The LearningStore is created during `initialize()` and passed to both `wireTelemetry()` (for extraction on job events) and `buildEnrichmentPipeline()` (for the LearningStage).

**Step 1: Write the failing tests**

```typescript
// packages/runtime/tests/telemetry-wiring-learning.test.ts
import { describe, it, expect, vi } from 'vitest';
import { wireTelemetry } from '../src/telemetry-wiring.js';
import { EventEmitter } from 'node:events';

describe('wireTelemetry learning extraction', () => {
  it('calls extractAndStore on job:completed when learningStore provided', () => {
    const emitter = new EventEmitter();
    const tracker = { recordJob: vi.fn() };
    const learningStore = { extractAndStore: vi.fn().mockReturnValue(0) };

    wireTelemetry(emitter, tracker, learningStore);

    emitter.emit('job:completed', {
      job: { id: 'j1', type: 'build', createdAt: 1000, completedAt: 2000 },
      result: 'Note: Always check types.',
    });

    expect(learningStore.extractAndStore).toHaveBeenCalledWith(
      'Note: Always check types.',
      'j1',
      'build',
    );
  });

  it('works without learningStore (backward compatible)', () => {
    const emitter = new EventEmitter();
    const tracker = { recordJob: vi.fn() };

    wireTelemetry(emitter, tracker);

    emitter.emit('job:completed', {
      job: { id: 'j1', type: 'build', createdAt: 1000, completedAt: 2000 },
    });

    expect(tracker.recordJob).toHaveBeenCalled();
  });

  it('handles non-string results gracefully', () => {
    const emitter = new EventEmitter();
    const tracker = { recordJob: vi.fn() };
    const learningStore = { extractAndStore: vi.fn().mockReturnValue(0) };

    wireTelemetry(emitter, tracker, learningStore);

    emitter.emit('job:completed', {
      job: { id: 'j1', type: 'build', createdAt: 1000, completedAt: 2000 },
      result: { complex: 'object' },
    });

    // Should stringify the result
    expect(learningStore.extractAndStore).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/telemetry-wiring-learning.test.ts`
Expected: FAIL — `wireTelemetry` doesn't accept 3rd arg

**Step 3: Update wireTelemetry**

Modify `packages/runtime/src/telemetry-wiring.ts` to add an optional `LearningStoreLike` parameter:

```typescript
/** Structural types to avoid direct imports */
interface TelemetryTrackerLike {
  recordJob(outcome: { type: string; success: boolean; durationMs: number; jobId: string; error?: string }): void;
}

interface JobEmitterLike {
  on(event: string, listener: (data: unknown) => void): void;
}

interface LearningStoreLike {
  extractAndStore(output: string, jobId: string, jobType: string): number;
}

export function wireTelemetry(
  emitter: JobEmitterLike,
  tracker: TelemetryTrackerLike,
  learningStore?: LearningStoreLike,
): void {
  emitter.on('job:completed', (data: unknown) => {
    const { job, result } = data as {
      job: { id: string; type: string; createdAt: number; completedAt?: number };
      result?: unknown;
    };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: true, durationMs, jobId: job.id });

    if (learningStore && result != null) {
      const output = typeof result === 'string' ? result : JSON.stringify(result);
      learningStore.extractAndStore(output, job.id, job.type);
    }
  });

  emitter.on('job:failed', (data: unknown) => {
    const { job, error } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number }; error?: Error };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: false, durationMs, jobId: job.id, error: error?.message });
  });

  emitter.on('job:dead', (data: unknown) => {
    const { job, error } = data as { job: { id: string; type: string; createdAt: number; completedAt?: number }; error?: Error };
    const durationMs = (job.completedAt ?? Date.now()) - job.createdAt;
    tracker.recordJob({ type: job.type, success: false, durationMs, jobId: job.id, error: error?.message ?? 'dead letter' });
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/telemetry-wiring-learning.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/telemetry-wiring.ts packages/runtime/tests/telemetry-wiring-learning.test.ts
git commit -m "feat(runtime): wire learning extraction into job completion events"
```

---

### Task 5: Stale Job Detection

**Files:**
- Create: `packages/job-queue/src/stale-detector.ts`
- Create: `packages/job-queue/tests/stale-detector.test.ts`
- Modify: `packages/job-queue/src/index.ts` (add export)

**Context:** Jobs stuck in `running` beyond a configurable timeout should be detected and either reset or killed. This complements `recoverCrashed()` which only runs on startup. The `StaleJobDetector` runs periodically and handles jobs that hang during normal operation.

**Step 1: Write the failing tests**

```typescript
// packages/job-queue/tests/stale-detector.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StaleJobDetector } from '../src/stale-detector.js';

describe('StaleJobDetector', () => {
  let detector: StaleJobDetector;
  const mockDb = {
    getRunningJobs: vi.fn().mockReturnValue([]),
    killJob: vi.fn(),
    failJob: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    detector = new StaleJobDetector(mockDb, { staleAfterMs: 60_000 });
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  it('detects jobs running longer than staleAfterMs', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 120_000 }, // 2 min ago — stale
      { id: 'j2', type: 'build', startedAt: now - 30_000 },  // 30s ago — fine
    ]);

    const stale = detector.check();
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('j1');
  });

  it('kills stale jobs when autoKill is true', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 120_000 },
    ]);

    detector = new StaleJobDetector(mockDb, { staleAfterMs: 60_000, autoKill: true });
    detector.check();

    expect(mockDb.killJob).toHaveBeenCalledWith('j1');
  });

  it('does not kill stale jobs when autoKill is false', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 120_000 },
    ]);

    detector.check();
    expect(mockDb.killJob).not.toHaveBeenCalled();
  });

  it('returns empty array when no jobs are stale', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 10_000 },
    ]);

    const stale = detector.check();
    expect(stale).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/tests/stale-detector.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/job-queue/src/stale-detector.ts

export interface StaleJobInfo {
  readonly id: string;
  readonly type: string;
  readonly startedAt: number;
  readonly staleDurationMs: number;
}

export interface StaleDetectorOptions {
  readonly staleAfterMs: number;
  readonly autoKill?: boolean;
  readonly checkIntervalMs?: number;
}

/** Structural type for the database dependency */
interface JobDbLike {
  getRunningJobs(): Array<{ id: string; type: string; startedAt: number }>;
  killJob(id: string): void;
}

export class StaleJobDetector {
  private db: JobDbLike;
  private staleAfterMs: number;
  private autoKill: boolean;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(db: JobDbLike, options: StaleDetectorOptions) {
    this.db = db;
    this.staleAfterMs = options.staleAfterMs;
    this.autoKill = options.autoKill ?? false;
  }

  check(): StaleJobInfo[] {
    const now = Date.now();
    const running = this.db.getRunningJobs();
    const stale: StaleJobInfo[] = [];

    for (const job of running) {
      const elapsed = now - job.startedAt;
      if (elapsed > this.staleAfterMs) {
        stale.push({
          id: job.id,
          type: job.type,
          startedAt: job.startedAt,
          staleDurationMs: elapsed,
        });

        if (this.autoKill) {
          this.db.killJob(job.id);
        }
      }
    }

    return stale;
  }

  start(intervalMs: number): void {
    this.timer = setInterval(() => this.check(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/job-queue/tests/stale-detector.test.ts`
Expected: 4 tests PASS

**Step 5: Add `getRunningJobs` to JobDatabase**

Modify `packages/job-queue/src/db.ts` — add method:
```typescript
getRunningJobs(): Array<{ id: string; type: string; startedAt: number }> {
  const rows = this.db.prepare(
    `SELECT id, type, started_at FROM jobs WHERE status = 'running'`,
  ).all() as Record<string, unknown>[];
  return rows.map(r => ({
    id: r.id as string,
    type: r.type as string,
    startedAt: r.started_at as number,
  }));
}
```

**Step 6: Add export to barrel**

Add to `packages/job-queue/src/index.ts`:
```typescript
export { StaleJobDetector } from './stale-detector.js';
export type { StaleJobInfo, StaleDetectorOptions } from './stale-detector.js';
```

**Step 7: Commit**

```bash
git add packages/job-queue/src/stale-detector.ts packages/job-queue/tests/stale-detector.test.ts packages/job-queue/src/db.ts packages/job-queue/src/index.ts
git commit -m "feat(job-queue): add stale job detector with auto-kill option"
```

---

### Task 6: Verification Auto-Fix Retry

**Files:**
- Create: `packages/verification/src/retry-verifier.ts`
- Create: `packages/verification/tests/retry-verifier.test.ts`
- Modify: `packages/verification/src/index.ts` (add export)

**Context:** The current `JobVerifier` is pass/fail. The `RetryVerifier` wraps it to allow a fix-and-recheck loop: if verification fails, it calls a `fixFn` callback to attempt automated fixes, then re-verifies. Max retries configurable (default 2).

The existing `JobVerifier` in `packages/verification/src/verifier.ts` checks for:
- 8 security regex patterns (dynamic code construction, hardcoded secrets, unsafe HTML patterns, shell injection, etc.)
- Output length > 500,000 chars
- Empty output with >5s duration

**Step 1: Write the failing tests**

```typescript
// packages/verification/tests/retry-verifier.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RetryVerifier } from '../src/retry-verifier.js';
import type { VerificationContext, VerificationResult } from '../src/types.js';

const passResult = (jobId: string): VerificationResult => ({
  jobId,
  passed: true,
  securityConcerns: [],
  logicErrors: [],
  warnings: [],
  verifiedAt: Date.now(),
});

const failResult = (jobId: string): VerificationResult => ({
  jobId,
  passed: false,
  securityConcerns: ['Hardcoded credential detected'],
  logicErrors: [],
  warnings: [],
  verifiedAt: Date.now(),
});

describe('RetryVerifier', () => {
  it('passes on first attempt when verification succeeds', async () => {
    const verifier = { verify: vi.fn().mockReturnValue(passResult('j1')) };
    const fixFn = vi.fn();
    const retry = new RetryVerifier(verifier, fixFn);

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'clean output', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.passed).toBe(true);
    expect(fixFn).not.toHaveBeenCalled();
  });

  it('retries with fixFn when verification fails', async () => {
    const verifier = {
      verify: vi.fn()
        .mockReturnValueOnce(failResult('j1'))
        .mockReturnValueOnce(passResult('j1')),
    };
    const fixFn = vi.fn().mockResolvedValue('fixed output');
    const retry = new RetryVerifier(verifier, fixFn);

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'bad output', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.passed).toBe(true);
    expect(fixFn).toHaveBeenCalledTimes(1);
    expect(verifier.verify).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries', async () => {
    const verifier = { verify: vi.fn().mockReturnValue(failResult('j1')) };
    const fixFn = vi.fn().mockResolvedValue('still bad');
    const retry = new RetryVerifier(verifier, fixFn, { maxRetries: 2 });

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'bad', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.passed).toBe(false);
    expect(fixFn).toHaveBeenCalledTimes(2);
    expect(verifier.verify).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('tracks attempt history in result', async () => {
    const verifier = {
      verify: vi.fn()
        .mockReturnValueOnce(failResult('j1'))
        .mockReturnValueOnce(passResult('j1')),
    };
    const fixFn = vi.fn().mockResolvedValue('fixed');
    const retry = new RetryVerifier(verifier, fixFn);

    const ctx: VerificationContext = { jobId: 'j1', jobType: 'build', output: 'bad', durationMs: 1000 };
    const result = await retry.verifyWithRetry(ctx);

    expect(result.attempts).toBe(2);
    expect(result.autoFixed).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/verification/tests/retry-verifier.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/verification/src/retry-verifier.ts
import type { VerificationContext, VerificationResult } from './types.js';

/** Structural type — works with any verifier that has verify() */
interface VerifierLike {
  verify(ctx: VerificationContext): VerificationResult;
}

export interface RetryVerifierOptions {
  readonly maxRetries?: number;
}

export interface RetryResult extends VerificationResult {
  readonly attempts: number;
  readonly autoFixed: boolean;
}

export type FixFunction = (ctx: VerificationContext, result: VerificationResult) => Promise<string>;

export class RetryVerifier {
  private verifier: VerifierLike;
  private fixFn: FixFunction;
  private maxRetries: number;

  constructor(verifier: VerifierLike, fixFn: FixFunction, options?: RetryVerifierOptions) {
    this.verifier = verifier;
    this.fixFn = fixFn;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  async verifyWithRetry(ctx: VerificationContext): Promise<RetryResult> {
    let currentCtx = ctx;
    let result = this.verifier.verify(currentCtx);
    let attempts = 1;

    while (!result.passed && attempts <= this.maxRetries) {
      const fixedOutput = await this.fixFn(currentCtx, result);
      currentCtx = { ...currentCtx, output: fixedOutput };
      result = this.verifier.verify(currentCtx);
      attempts++;
    }

    return {
      ...result,
      attempts,
      autoFixed: attempts > 1 && result.passed,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/verification/tests/retry-verifier.test.ts`
Expected: 4 tests PASS

**Step 5: Add export to barrel**

Add to `packages/verification/src/index.ts`:
```typescript
export { RetryVerifier } from './retry-verifier.js';
export type { RetryResult, RetryVerifierOptions, FixFunction } from './retry-verifier.js';
```

**Step 6: Commit**

```bash
git add packages/verification/src/retry-verifier.ts packages/verification/tests/retry-verifier.test.ts packages/verification/src/index.ts
git commit -m "feat(verification): add retry verifier with auto-fix loop"
```

---

### Task 7: Persistent Change Log

**Files:**
- Create: `packages/telemetry/src/change-log.ts`
- Create: `packages/telemetry/tests/change-log.test.ts`
- Modify: `packages/telemetry/src/index.ts` (add export)

**Context:** An append-only log recording every self-improvement change and its outcome. Used for auditing, debugging, and tracking whether changes helped or hurt performance. Each entry captures what changed, why, the before/after state, and the measured impact.

**Step 1: Write the failing tests**

```typescript
// packages/telemetry/tests/change-log.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangeLog } from '../src/change-log.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('ChangeLog', () => {
  let log: ChangeLog;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `changelog-test-${Date.now()}.db`);
    log = new ChangeLog(dbPath);
  });

  afterEach(() => {
    log.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('records a change entry', () => {
    log.record({
      component: 'rate-limit-cooldown',
      description: 'Reduced cooldown from 60s to 30s',
      reason: 'Too aggressive — causing unnecessary delays',
      previousValue: '60000',
      newValue: '30000',
    });

    const entries = log.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].component).toBe('rate-limit-cooldown');
    expect(entries[0].description).toBe('Reduced cooldown from 60s to 30s');
  });

  it('records impact assessment', () => {
    const id = log.record({
      component: 'learning-stage',
      description: 'Added learning injection',
      reason: 'Improve from past mistakes',
    });

    log.recordImpact(id, { outcome: 'positive', metric: 'error_rate', before: 0.15, after: 0.08 });

    const entry = log.getById(id);
    expect(entry?.impact).toBeDefined();
    expect(entry?.impact?.outcome).toBe('positive');
    expect(entry?.impact?.before).toBe(0.15);
    expect(entry?.impact?.after).toBe(0.08);
  });

  it('lists entries by component', () => {
    log.record({ component: 'cooldown', description: 'Change A', reason: 'R1' });
    log.record({ component: 'learning', description: 'Change B', reason: 'R2' });
    log.record({ component: 'cooldown', description: 'Change C', reason: 'R3' });

    const cooldownEntries = log.getByComponent('cooldown');
    expect(cooldownEntries).toHaveLength(2);
  });

  it('lists recent entries with limit', () => {
    for (let i = 0; i < 10; i++) {
      log.record({ component: 'test', description: `Change ${i}`, reason: `Reason ${i}` });
    }
    const recent = log.getRecent(5);
    expect(recent).toHaveLength(5);
  });

  it('returns undefined for nonexistent id', () => {
    expect(log.getById(999)).toBeUndefined();
  });

  it('handles close gracefully', () => {
    log.close();
    // Double close should not throw
    log.close();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/tests/change-log.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/telemetry/src/change-log.ts
import { DatabaseSync } from 'node:sqlite';

export interface ChangeEntry {
  readonly component: string;
  readonly description: string;
  readonly reason: string;
  readonly previousValue?: string;
  readonly newValue?: string;
}

export interface ImpactAssessment {
  readonly outcome: 'positive' | 'negative' | 'neutral';
  readonly metric?: string;
  readonly before?: number;
  readonly after?: number;
  readonly notes?: string;
}

export interface ChangeRecord {
  readonly id: number;
  readonly component: string;
  readonly description: string;
  readonly reason: string;
  readonly previousValue?: string;
  readonly newValue?: string;
  readonly impact?: ImpactAssessment;
  readonly createdAt: number;
}

export class ChangeLog {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        component TEXT NOT NULL,
        description TEXT NOT NULL,
        reason TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT,
        impact_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  record(entry: ChangeEntry): number {
    if (this.closed) return -1;
    const result = this.db.prepare(
      `INSERT INTO changes (component, description, reason, previous_value, new_value) VALUES (?, ?, ?, ?, ?)`,
    ).run(entry.component, entry.description, entry.reason, entry.previousValue ?? null, entry.newValue ?? null);
    return Number(result.lastInsertRowid);
  }

  recordImpact(id: number, impact: ImpactAssessment): void {
    if (this.closed) return;
    this.db.prepare(
      'UPDATE changes SET impact_json = ? WHERE id = ?',
    ).run(JSON.stringify(impact), id);
  }

  getById(id: number): ChangeRecord | undefined {
    if (this.closed) return undefined;
    const row = this.db.prepare('SELECT * FROM changes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRecord(row) : undefined;
  }

  getAll(): ChangeRecord[] {
    if (this.closed) return [];
    const rows = this.db.prepare('SELECT * FROM changes ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(r => this.rowToRecord(r));
  }

  getByComponent(component: string): ChangeRecord[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT * FROM changes WHERE component = ? ORDER BY created_at DESC',
    ).all(component) as Record<string, unknown>[];
    return rows.map(r => this.rowToRecord(r));
  }

  getRecent(limit: number): ChangeRecord[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT * FROM changes ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as Record<string, unknown>[];
    return rows.map(r => this.rowToRecord(r));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private rowToRecord(row: Record<string, unknown>): ChangeRecord {
    const impact = row.impact_json
      ? JSON.parse(row.impact_json as string) as ImpactAssessment
      : undefined;

    return {
      id: row.id as number,
      component: row.component as string,
      description: row.description as string,
      reason: row.reason as string,
      previousValue: (row.previous_value as string | null) ?? undefined,
      newValue: (row.new_value as string | null) ?? undefined,
      impact,
      createdAt: row.created_at as number,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/telemetry/tests/change-log.test.ts`
Expected: 6 tests PASS

**Step 5: Add export to barrel**

Add to `packages/telemetry/src/index.ts`:
```typescript
export { ChangeLog } from './change-log.js';
export type { ChangeEntry, ChangeRecord, ImpactAssessment } from './change-log.js';
```

**Step 6: Commit**

```bash
git add packages/telemetry/src/change-log.ts packages/telemetry/tests/change-log.test.ts packages/telemetry/src/index.ts
git commit -m "feat(telemetry): add persistent change log with impact tracking"
```

---

### Task 8: Wire Change Log into BatteryChangeReviewer

**Files:**
- Modify: `packages/telemetry/src/battery-change-reviewer.ts` (add change log recording)
- Create: `packages/telemetry/tests/battery-change-log-integration.test.ts`

**Context:** The BatteryChangeReviewer (Phase 1) reviews session reflections and proposes changes. Currently, approved changes are applied but not logged. Wire the ChangeLog into the reviewer so every approved change is recorded with component, description, reason, and before/after values.

**Step 1: Read BatteryChangeReviewer to understand its API**

Run: Read `packages/telemetry/src/battery-change-reviewer.ts`

**Step 2: Write the failing test**

```typescript
// packages/telemetry/tests/battery-change-log-integration.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('BatteryChangeReviewer change log integration', () => {
  it('records approved changes to the change log', () => {
    // This test will depend on the actual BatteryChangeReviewer API
    // After reading the file in Step 1, adjust accordingly
    // The key assertion: when a change is approved, ChangeLog.record() is called
    const mockChangeLog = { record: vi.fn().mockReturnValue(1) };
    // Wire into reviewer and verify record() called on approval
    expect(mockChangeLog.record).toBeDefined(); // placeholder
  });
});
```

**Note:** This task requires reading `battery-change-reviewer.ts` first to understand the exact API. The implementer should read the file, then write a proper integration test and wire the ChangeLog.

**Step 3: Commit**

```bash
git add packages/telemetry/src/battery-change-reviewer.ts packages/telemetry/tests/battery-change-log-integration.test.ts
git commit -m "feat(telemetry): wire change log into battery change reviewer"
```

---

### Task 9: Wire Rate Limit Cooldown into Runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` (create RateLimitCooldown, wire into provider calls)
- Create: `packages/runtime/tests/rate-limit-cooldown-wiring.test.ts`

**Context:** The RateLimitCooldown (Task 1) needs to be instantiated in the runtime's `initialize()` and checked before provider calls. When a provider is cooling down, the system should either use a fallback provider or return a "temporarily unavailable" message.

**Step 1: Read runtime/src/index.ts to understand initialization flow**

Run: Read `packages/runtime/src/index.ts`

**Step 2: Write the failing test**

```typescript
// packages/runtime/tests/rate-limit-cooldown-wiring.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RateLimitCooldown } from '@auxiora/telemetry';

describe('Rate limit cooldown runtime wiring', () => {
  it('creates RateLimitCooldown with default options', () => {
    const cooldown = new RateLimitCooldown({
      windowMs: 60_000,
      failureThreshold: 5,
      cooldownMs: 30_000,
    });
    expect(cooldown.isCoolingDown('test')).toBe(false);
  });

  it('reports cooling down status for providers', () => {
    const cooldown = new RateLimitCooldown({
      windowMs: 60_000,
      failureThreshold: 3,
      cooldownMs: 30_000,
    });

    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');

    expect(cooldown.isCoolingDown('openai')).toBe(true);
    expect(cooldown.isCoolingDown('anthropic')).toBe(false);
  });
});
```

**Step 3: Wire into runtime initialize()**

The implementer should read `packages/runtime/src/index.ts` and add:
1. Import `RateLimitCooldown` (via structural type)
2. Create instance in `initialize()` with sensible defaults
3. Check `cooldown.isCoolingDown(providerName)` before making provider calls
4. Call `cooldown.recordFailure(providerName)` on rate limit errors
5. Call `cooldown.recordSuccess(providerName)` on successful responses

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/rate-limit-cooldown-wiring.test.ts
git commit -m "feat(runtime): wire rate limit cooldown into provider calls"
```

---

### Task 10: Dashboard Endpoints for Learnings and Change Log

**Files:**
- Modify: `packages/gateway/src/routes/` (add learnings and changelog endpoints)
- No tests needed — these are thin HTTP wrappers over already-tested stores

**Context:** Expose the LearningStore and ChangeLog data via gateway API endpoints for the dashboard to consume.

**Step 1: Read existing gateway route structure**

Run: Read relevant files in `packages/gateway/src/routes/`

**Step 2: Add endpoints**

Add the following endpoints:
- `GET /api/v1/learnings` — returns recent learnings (query param: `?limit=20&category=warning`)
- `GET /api/v1/changelog` — returns recent change log entries (query param: `?limit=20&component=cooldown`)

Follow the same pattern as existing routes (Fastify handler, structural types for store deps).

**Step 3: Commit**

```bash
git add packages/gateway/src/routes/
git commit -m "feat(gateway): add learnings and changelog API endpoints"
```

---

## Summary

| Task | Module | Tests | Description |
|------|--------|-------|-------------|
| 1 | rate-limit-cooldown | 8 | Sliding window failure tracker with auto-cooldown |
| 2 | learning-store | 7 | Extract and persist learnings from job output |
| 3 | learning-stage | 6 | Inject learnings into prompts via enrichment |
| 4 | wiring | 3 | Connect learning extraction to job events |
| 5 | stale-detector | 4 | Detect and optionally kill stuck jobs |
| 6 | retry-verifier | 4 | Auto-fix loop for failed verifications |
| 7 | change-log | 6 | Append-only log of self-improvement changes |
| 8 | battery wiring | 1 | Record reviewer changes to change log |
| 9 | runtime wiring | 2 | Check cooldown before provider calls |
| 10 | gateway endpoints | 0 | HTTP endpoints for dashboard |
| **Total** | | **~41** | |
