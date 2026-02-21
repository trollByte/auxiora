# Durable Job Queue Design

**Goal:** Replace in-memory background execution with a crash-recoverable, SQLite-backed job queue that all background workloads (behaviors, ReAct loops, orchestration, ambient patterns) use for durable execution.

**Architecture:** Central polling queue in a new `packages/job-queue/` package. One SQLite database with WAL mode. Handler registration per job type. Auto-retry with exponential backoff on crash recovery. Checkpoint support for long-running jobs.

**Tech Stack:** Node 22 built-in `node:sqlite` (DatabaseSync), WAL mode, same pattern as `packages/sessions/src/db.ts`.

---

## Problem Statement

Auxiora has 6 packages performing background work. Only 2 persist state (behaviors via JSON, workflows via JSON). The rest — orchestrator, ReAct loops, ambient patterns, approval queue — are purely in-memory. A process crash loses all in-flight work silently:

| Package | Storage | Crash Recovery | Inflight Loss |
|---------|---------|----------------|---------------|
| behaviors | JSON file | Re-activates timers | Inflight execution lost |
| orchestrator | None | No | Total loss |
| ambient/patterns | None (serialize() unused) | No | Total loss |
| react-loop | None | No | Total loss |
| workflows | JSON file | Partial (at-least-once) | Step stays active, retried |
| approval-queue | None | No | Total loss |

The daemon package (`packages/daemon/`) ensures the process restarts via launchd/systemd, but restart without recovery means lost work.

---

## Approach: Central Polling Queue

A single `JobQueue` class backed by one SQLite database. Jobs are rows with type, payload, status, and attempt tracking. A tick loop polls for ready jobs. Each consumer registers a handler function per job type. On startup, crashed jobs (status=running) are auto-recovered.

### Why This Over Alternatives

- **vs. Event-driven + SQLite backup:** Simpler — one code path for both normal and recovery dispatch. Polling latency (1-2s) is negligible vs LLM call times (seconds to minutes).
- **vs. Per-package adapters:** One DB, one recovery path, unified monitoring. No duplicated logic.
- **vs. BullMQ + Redis:** No external dependencies. Fits Auxiora's self-contained philosophy.

---

## Data Model

### Schema

```sql
CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  payload       TEXT NOT NULL,
  result        TEXT,
  priority      INTEGER NOT NULL DEFAULT 0,
  attempt       INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  scheduled_at  INTEGER NOT NULL,
  started_at    INTEGER,
  completed_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_jobs_poll ON jobs(status, scheduled_at, priority DESC);
CREATE INDEX idx_jobs_type ON jobs(type, status);

CREATE TABLE job_checkpoints (
  job_id  TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  data    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Status Transitions

```
pending ──→ running ──→ completed
              │
              ├──→ pending (retry: attempt < max_attempts, backoff applied)
              │
              └──→ dead (attempt >= max_attempts or NonRetryableError)

pending ──→ dead (manually killed or expired)
```

### Startup Recovery

```sql
UPDATE jobs
SET status = 'pending',
    attempt = attempt + 1,
    scheduled_at = :now + (POWER(2, attempt) * 1000),
    updated_at = :now
WHERE status = 'running';
```

Any job left in `running` state was interrupted by a crash. Exponential backoff: `2^attempt * 1000` ms.

---

## Public API

```typescript
interface JobOptions {
  priority?: number;        // default 0, higher = picked first
  maxAttempts?: number;     // default 3
  scheduledAt?: number;     // epoch ms, default Date.now()
}

interface JobHandler<T = unknown, R = unknown> {
  (payload: T, context: JobContext): Promise<R>;
}

interface JobContext {
  jobId: string;
  attempt: number;
  signal: AbortSignal;
  checkpoint(data: unknown): void;
}

class JobQueue {
  constructor(dbPath: string, options?: {
    pollIntervalMs?: number;  // default 2000
    concurrency?: number;     // default 5
  });

  register<T, R>(type: string, handler: JobHandler<T, R>): void;
  enqueue(type: string, payload: unknown, options?: JobOptions): string;
  start(): void;
  stop(timeoutMs?: number): Promise<void>;
  getJob(id: string): Job | undefined;
  listJobs(filter?: { type?: string; status?: string; limit?: number }): Job[];
  on(event: 'job:started' | 'job:completed' | 'job:failed' | 'job:dead',
     listener: (job: Job) => void): void;
}
```

### Key Design Decisions

- **`register()` before `start()`** — handlers are pure functions, no class hierarchies.
- **`AbortSignal`** — graceful shutdown sends abort to all running jobs.
- **`checkpoint()`** — writes to `job_checkpoints` table. Handlers read last checkpoint from context on retry to resume rather than restart.
- **Concurrency** — poll loop picks up to `concurrency` jobs per tick. Each runs in its own Promise.
- **`NonRetryableError`** — exported error class. Thrown by handlers to skip retries (validation failures, config errors).

---

## Integration Points

### Behaviors (`packages/behaviors/`)

**Current:** `enqueueExecution()` chains a Promise on an in-memory queue.

**Change:** `enqueueExecution()` calls `jobQueue.enqueue('behavior', { behaviorId, trigger })`. The handler loads the behavior definition from `BehaviorStore`, calls `BehaviorExecutor.execute()`, writes the result back. Cron/interval/timeout scheduling stays unchanged.

**One-shot catch-up:** One-shot behaviors set `scheduledAt: fireAt` when enqueuing. On startup recovery, if within a 5-minute grace window, fire immediately. Beyond the window, mark `missed`.

### ReAct Loops (`packages/react-loop/`)

**Current:** `ReActLoop.run()` is a `while` loop in-process. No persistence.

**Change:** Runtime enqueues a `react-loop` job with `{ goal, tools, sessionId }`. Handler creates `ReActLoop`, runs it. After each step, calls `context.checkpoint({ steps, totalTokens })`. On retry, resumes from last checkpoint.

**Tool approval:** When `onApprovalNeeded` fires, handler checkpoints with `{ steps, awaitingApproval: true, toolCall }`. On resume, checks if approval was granted.

### Orchestration (`packages/orchestrator/`)

**Current:** `OrchestrationEngine.execute()` returns an AsyncGenerator, all in-memory.

**Change:** Runtime enqueues an `orchestration` job with the serialized `Workflow` object. Handler runs `execute()`, checkpoints after each `agent_completed` event. On retry, loads completed results from checkpoint, re-runs remaining agents.

**Concurrency note:** One orchestration job = one queue slot, even if it runs parallel agents internally via its own Semaphore.

### Ambient Patterns (`packages/ambient/`)

**Current:** `AmbientPatternEngine` events/patterns are in-memory. `serialize()` exists but is unused.

**Change:** Register a recurring `ambient-flush` job (every 5 minutes) that calls `patternEngine.serialize()` and writes to checkpoint. On startup, `deserialize()` from last checkpoint restores pattern history.

---

## Error Handling

### Retry Logic

- **Exponential backoff:** `2^attempt * 1000` ms (1s, 2s, 4s)
- **Max attempts:** Default 3, configurable per job
- **NonRetryableError:** Skip retries, go directly to `dead`

### Graceful Shutdown

1. `stop()` called (SIGTERM)
2. Poll loop stops — no new jobs picked up
3. `AbortSignal` sent to all running job contexts
4. Wait up to `timeoutMs` (default 30s) for running jobs
5. Still-running jobs left in `running` state — recovered on next startup

### Dead Letter

Jobs in `dead` status stay for inspection. Periodic cleanup removes dead jobs older than 7 days. `listJobs({ status: 'dead' })` surfaces failures.

---

## Observability

### Events

`JobQueue` emits: `job:started`, `job:completed`, `job:failed` (retry scheduled), `job:dead` (exhausted retries). Runtime wires to `LogContext`.

### Gateway Endpoint

`GET /api/v1/jobs/status`:

```json
{
  "pending": 3,
  "running": 1,
  "completed_24h": 47,
  "failed_24h": 2,
  "dead": 0
}
```

---

## Package Structure

```
packages/job-queue/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # barrel export
│   ├── types.ts          # Job, JobOptions, JobHandler, JobContext, JobStatus
│   ├── db.ts             # SQLite schema, migrations, queries
│   ├── queue.ts          # JobQueue class (poll loop, dispatch, recovery)
│   ├── errors.ts         # NonRetryableError
│   └── __tests__/
│       ├── db.test.ts
│       ├── queue.test.ts
│       ├── recovery.test.ts
│       └── integration.test.ts
└── vitest.config.ts
```

---

## What This Does NOT Cover

- **Distributed execution:** This is single-process. No multi-node job distribution.
- **Job dependencies:** No "run B after A completes" DAG support. That's orchestrator territory.
- **Priority queues:** Priority is a simple integer sort, not a priority queue data structure.
- **Rate limiting per job type:** All types share the same concurrency pool.

These can be added later if needed — YAGNI for now.
