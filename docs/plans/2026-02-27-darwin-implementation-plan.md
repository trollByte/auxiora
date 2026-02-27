# Darwin Self-Improvement System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a population-based evolutionary self-improvement system (inspired by Darwin Godel Machine) that continuously evolves Auxiora's skills, prompts, and configurations through sandboxed mutation, evaluation, and selection.

**Architecture:** A single new package `@auxiora/darwin` containing: an archive store (MAP-Elites grid in SQLite), four mutation strategies (LLM-driven), a six-stage evaluation pipeline, a continuous background loop (job-queue durable job), a resource governor, and a deployment manager. Wired into runtime via job registration, gateway via REST routes, and dashboard via an Evolution page.

**Tech Stack:** TypeScript strict ESM, SQLite WAL (node:sqlite), existing packages (benchmark, review-committee, sandbox, plugins, job-queue, event-bus, telemetry, verification). Vitest for tests.

---

## Task 1: Scaffold `@auxiora/darwin` package with core types

**Files:**
- Create: `packages/darwin/package.json`
- Create: `packages/darwin/tsconfig.json`
- Create: `packages/darwin/src/types.ts`
- Create: `packages/darwin/src/index.ts`

**Context:** Every Auxiora package follows the same structure: `package.json` with `"type": "module"`, `workspace:*` deps, `tsconfig.json` extending nothing (standalone), barrel export from `src/index.ts`. All imports use `.js` extensions. SQLite uses WAL mode with `PRAGMA busy_timeout = 5000`.

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/darwin",
  "version": "1.10.13",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/benchmark": "workspace:*",
    "@auxiora/event-bus": "workspace:*",
    "@auxiora/job-queue": "workspace:*",
    "@auxiora/logger": "workspace:*",
    "@auxiora/review-committee": "workspace:*",
    "@auxiora/telemetry": "workspace:*",
    "@auxiora/verification": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

**Step 3: Create types.ts with all core interfaces**

Create `packages/darwin/src/types.ts` with:

- `NicheComplexity` type: `'simple' | 'moderate' | 'complex'`
- `Niche` interface: `{ domain: string; complexity: NicheComplexity }`
- `MutationStrategy` type: `'create_new' | 'mutate' | 'crossover' | 'refine_prompt'`
- `VariantType` type: `'skill' | 'prompt' | 'config'`
- `VariantStatus` type: `'evaluated' | 'deployed' | 'failed' | 'reverted'`
- `Variant` interface with: id, generation, parentIds, strategy, type, content, metadata, metrics, securityPassed, reviewScore, status, createdAt
- `VariantMetrics` interface: accuracy, latencyP50, latencyP95, errorRate
- `ArchiveCell` interface: niche, variantId, benchmarkScore, lastEvaluated, staleness
- `StrategyWeights` interface: weights for each strategy
- `DarwinConfig` interface with all config fields and `DEFAULT_DARWIN_CONFIG` constant
- `DarwinCheckpoint` interface for crash recovery
- `EvaluationResult` interface
- `DeployClass` type: `'minor' | 'major'`
- Structural types: `LLMCallerLike`, `SandboxLike`, `PluginLoaderLike`, `TelemetryLike`, `EventBusLike`

Default config values:
- tickIntervalMs: 60_000
- tokenBudgetPerHour: 50_000
- maxConcurrentEvaluations: 1
- maxVariantsPerDay: 500
- pauseDuringUserActivity: true
- sandboxMemoryMb: 256
- sandboxTimeoutMs: 30_000
- strategyWeights: { refine_prompt: 0.4, mutate: 0.35, create_new: 0.15, crossover: 0.10 }
- stalenessThreshold: 50
- minAccuracy: 0.5
- maxErrorRate: 0.2
- maxLatencyP95: 10_000
- reviewScoreThreshold: 0.6
- revertThreshold: 0.10
- revertWindowMs: 3_600_000

**Step 4: Create barrel export**

```typescript
// packages/darwin/src/index.ts
export * from './types.js';
```

**Step 5: Run pnpm install and typecheck**

Run: `cd /home/ai-work/git/auxiora && pnpm install && pnpm --filter @auxiora/darwin typecheck`
Expected: Clean install + typecheck passes

**Step 6: Commit**

```bash
git add packages/darwin/
git commit -m "feat(darwin): scaffold package with core types"
```

---

## Task 2: Archive store (SQLite persistence)

**Files:**
- Create: `packages/darwin/src/archive-store.ts`
- Create: `packages/darwin/tests/archive-store.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)

**Context:** SQLite pattern in this codebase: `import { DatabaseSync } from 'node:sqlite'`, WAL mode, `PRAGMA busy_timeout = 5000`. See `packages/benchmark/src/result-store.ts` for reference. Tables use `INTEGER NOT NULL` for timestamps (unix epoch ms). All stores have a `close()` method.

**`ArchiveStore` class with these methods:**
- `saveVariant(v: Variant): void` -- INSERT OR REPLACE into variants table
- `getVariant(id: string): Variant | null`
- `updateVariantStatus(id: string, status: VariantStatus): void`
- `getVariantsByStatus(status: VariantStatus): Variant[]`
- `getVariantsByParent(parentId: string): Variant[]` -- LIKE query on parentIdsJson
- `getVariantsCreatedToday(): number` -- COUNT where createdAt >= start of day
- `setCell(niche: Niche, variantId: string, benchmarkScore: number): void` -- INSERT OR REPLACE, resets staleness to 0
- `getCell(niche: Niche): ArchiveCell | null`
- `getAllCells(): ArchiveCell[]`
- `getStaleCells(threshold: number): ArchiveCell[]`
- `getDomains(): string[]` -- DISTINCT domains
- `incrementStaleness(): void` -- UPDATE all cells staleness + 1
- `pruneOldFailed(maxAgeDays: number): number` -- DELETE failed variants older than N days
- `close(): void`

**SQLite tables:**
- `variants` (id TEXT PK, generation INTEGER, parentIdsJson TEXT, strategy TEXT, type TEXT, content TEXT, metadataJson TEXT, metricsJson TEXT, securityPassed INTEGER, reviewScore REAL, status TEXT, createdAt INTEGER)
- `archive_cells` (domain TEXT, complexity TEXT, variantId TEXT, benchmarkScore REAL, lastEvaluated INTEGER, staleness INTEGER DEFAULT 0, PRIMARY KEY (domain, complexity))

**Tests (~13):**
- Store and retrieve variant
- Update variant status
- Set and get archive cell
- Null for empty cell
- Replace cell with better variant
- List all occupied cells
- Increment staleness
- Reset staleness on cell update
- Get stale cells above threshold
- Get variants by status
- Count variants created today
- Get variants by parent (lineage)
- List known domains
- Prune old failed variants

Run tests: `pnpm vitest run packages/darwin/tests/archive-store.test.ts`

**Commit:** `git commit -m "feat(darwin): add archive store with MAP-Elites grid persistence"`

---

## Task 3: Mutation engine (strategy selection + LLM code generation)

**Files:**
- Create: `packages/darwin/src/mutation-engine.ts`
- Create: `packages/darwin/tests/mutation-engine.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)

**Context:** The mutation engine selects a strategy based on archive state and calls the LLM to generate variant code. Uses structural `LLMCallerLike` type.

**`MutationEngine` class:**
- `constructor(llm: LLMCallerLike)`
- `selectStrategy(ctx: StrategyContext): MutationStrategy` -- returns `create_new` if no current variant, otherwise weighted random selection from eligible strategies (crossover only eligible with 2+ nearby variants)
- `generateMutation(req: MutationRequest): Promise<MutationResult>` -- builds strategy-specific prompt, calls LLM, extracts code from markdown code blocks

**Helper interfaces:**
- `StrategyContext`: targetNiche, currentVariant (nullable), nearbyVariants, weights
- `MutationRequest`: strategy, targetNiche, parent?, parents?, currentPrompt?, toolCatalog?, telemetryHints?, mutationTarget?
- `MutationResult`: content, type, parentIds, strategy, metadata

**Prompt building per strategy:**
- `create_new`: niche description, tool catalog, telemetry hints -> generate complete plugin
- `mutate`: parent code, metrics, mutation target -> improved code
- `crossover`: both parents' code and metrics -> combined code
- `refine_prompt`: current prompt, telemetry hints -> improved prompt text

**Code extraction:** Parse triple-backtick typescript blocks from LLM response. Fall back to raw content if no block found.

**Tests (~8):**
- Selects create_new for empty niche
- Selects mutate/refine_prompt for occupied niche
- Can select crossover with 2 nearby variants
- Generates create_new mutation
- Generates mutate mutation with parent
- Generates crossover mutation with two parents
- Generates refine_prompt mutation
- Extracts code from markdown blocks

Run tests: `pnpm vitest run packages/darwin/tests/mutation-engine.test.ts`

**Commit:** `git commit -m "feat(darwin): add mutation engine with 4 LLM-driven strategies"`

---

## Task 4: Evaluation pipeline (syntax, security, sandbox, benchmark, review)

**Files:**
- Create: `packages/darwin/src/evaluation-pipeline.ts`
- Create: `packages/darwin/tests/evaluation-pipeline.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)

**Context:** The pipeline runs 6 stages sequentially. Early stages are fast local checks; later stages use sandbox. Each stage can reject the variant. Uses structural type `SandboxLike`.

**`EvaluationPipeline` class:**
- `constructor(options: { sandbox?: SandboxLike; config: DarwinConfig })`
- `evaluate(variant: Variant): Promise<EvaluationResult>`

**Stages:**
1. **Syntax check** (skill only): must have `export`, balanced braces
2. **Security scan** (skill only): regex patterns for dangerous constructs -- reuse the same patterns from the existing `JobVerifier` in `packages/verification/` (Function constructor, hardcoded secrets, sk-* keys, innerHTML assignment, dangerous React HTML props, rm -rf, process spawn). Define `SECURITY_PATTERNS` as an array of RegExp locally.
3. **Sandbox run** (skill only): create session, run variant, capture output. Skip for prompt/config variants.
4. **Benchmark** (skill only): parse sandbox output as `{score, latencyMs, errorRate}`, check against absolute thresholds (minAccuracy, maxErrorRate, maxLatencyP95)
5. **Review**: simplified scoring (full ReviewCommittee wired in runtime)
6. **Result**: all stages passed -> `passed: true`

Prompt/config variants skip stages 1-4 and get default passing metrics.

**Tests (~10):**
- Valid variant passes all stages
- Rejects syntax error
- Rejects security concern (Function constructor)
- Rejects sandbox timeout
- Rejects below accuracy threshold
- Rejects above error rate threshold
- Rejects above latency threshold
- Handles sandbox creation failure
- Skips sandbox for prompt variants
- Skips sandbox for config variants

Run tests: `pnpm vitest run packages/darwin/tests/evaluation-pipeline.test.ts`

**Commit:** `git commit -m "feat(darwin): add evaluation pipeline with syntax, security, sandbox, benchmark gates"`

---

## Task 5: Resource governor

**Files:**
- Create: `packages/darwin/src/resource-governor.ts`
- Create: `packages/darwin/tests/resource-governor.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)

**`ResourceGovernor` class:**
- `constructor(options: { tokenBudgetPerHour, maxVariantsPerDay, pauseDuringUserActivity, userActivityTimeoutMs? })`
- `canRunCycle(): boolean` -- false if token budget exceeded, daily cap reached, or user active
- `recordTokenUsage(tokens: number): void`
- `recordVariantCreated(): void`
- `recordUserActivity(): void`
- `setLastUserActivity(timestamp: number): void` -- for testing
- `resetHourlyBudget(): void`
- `resetDailyCount(): void`
- `getStats(): GovernorStats`

Rolling windows: hourly for tokens (reset after 1 hour), daily for variants (reset at midnight).

User activity timeout: default 5 minutes. If last user message < 5 min ago, pause.

**Tests (~9):**
- Allows cycle under budget
- Blocks when token budget exceeded
- Allows after window rolls over
- Blocks at daily variant cap
- Blocks during user activity
- Allows after activity timeout
- Allows when pauseDuringUserActivity is false
- Reports usage stats correctly
- Resets daily count

Run tests: `pnpm vitest run packages/darwin/tests/resource-governor.test.ts`

**Commit:** `git commit -m "feat(darwin): add resource governor with token budget, daily cap, activity pause"`

---

## Task 6: Deployment manager

**Files:**
- Create: `packages/darwin/src/deployment-manager.ts`
- Create: `packages/darwin/tests/deployment-manager.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)

**`DeploymentManager` class:**
- `constructor(options: { darwinDir, pluginLoader?, eventBus? })`
- `classify(variant: Variant): DeployClass` -- prompt/config -> minor, skill -> major
- `deploy(variant: Variant): Promise<DeployResult>` -- auto-deploy minor, queue major
- `approve(variantId: string): Promise<boolean>` -- hot-load via pluginLoader
- `reject(variantId: string): boolean`
- `getPendingApprovals(): PendingApproval[]`

Auto-deploy writes:
- Prompts -> `{darwinDir}/prompts/{domain}-{complexity}.txt`
- Config -> `{darwinDir}/config/{variantId}.json`

Major changes staged to `{darwinDir}/skills/{variantId}.ts`, added to approval queue.

On approval: `pluginLoader.loadSingle(stagedPath)` + publish `darwin.deployed` event.

Tests use `mkdtempSync` for isolated temp directories.

**Tests (~8):**
- Classifies prompt as minor
- Classifies config as minor
- Classifies skill as major
- Auto-deploys prompt to disk
- Queues skill for approval
- Hot-loads on approval
- Publishes event on auto-deploy
- Lists pending approvals
- Rejects queued variant

Run tests: `pnpm vitest run packages/darwin/tests/deployment-manager.test.ts`

**Commit:** `git commit -m "feat(darwin): add deployment manager with auto-deploy, approval queue, hot-reload"`

---

## Task 7: Darwin loop orchestrator

**Files:**
- Create: `packages/darwin/src/darwin-loop.ts`
- Create: `packages/darwin/tests/darwin-loop.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)

**`DarwinLoop` class -- the main orchestrator:**
- `constructor(options: DarwinLoopOptions)` -- wires together ArchiveStore, MutationEngine, EvaluationPipeline, ResourceGovernor, DeploymentManager
- `tick(): Promise<TickResult>` -- runs one 6-phase cycle
- `getGovernor(): ResourceGovernor`
- `getDeploymentManager(): DeploymentManager`
- `getStats(): LoopStats`

**`tick()` implementation:**
1. Check resource governor -> skip if blocked
2. **Observe**: select target niche (priority: empty > stale > lowest-score)
3. **Propose**: select strategy via MutationEngine
4. **Mutate**: generate variant via MutationEngine
5. **Evaluate**: run through EvaluationPipeline
6. **Select**: update archive if new variant beats current occupant. Increment staleness for all cells.
7. **Deploy**: call DeploymentManager if archive updated

Publish events at each phase via EventBusLike.

Niche selection priority:
1. Empty niches (iterate domains x complexities)
2. Stale niches (staleness >= threshold, random pick)
3. Lowest-score occupied niche

Nearby variants: other complexity levels in the same domain (for crossover).

**Tests (~10):**
- Runs complete tick cycle
- Publishes cycle events
- Saves variant to store
- Updates archive cell
- Increments staleness
- Skips when resource governor blocks
- Targets empty niches first
- Handles LLM failure gracefully
- Reports loop stats
- Increments cycle counts

Run tests: `pnpm vitest run packages/darwin/tests/darwin-loop.test.ts`

**Commit:** `git commit -m "feat(darwin): add Darwin loop orchestrator with 6-phase cycle"`

---

## Task 8: Gateway routes for Darwin API

**Files:**
- Create: `packages/darwin/src/routes.ts`
- Create: `packages/darwin/tests/routes.test.ts`
- Modify: `packages/darwin/src/index.ts` (add export)
- Modify: `packages/darwin/package.json` (add express + supertest devDeps)

**`mountDarwinRoutes(app, deps)` function:**

Deps interface (structural types):
```typescript
interface DarwinRoutesDeps {
  archiveStore: ArchiveStore;
  getLoopStats: () => LoopStats;
  getGovernorStats: () => GovernorStatsLike;
  getPendingApprovals: () => Array<{ variantId: string; queuedAt: number }>;
  approveVariant: (id: string) => Promise<boolean>;
  rejectVariant: (id: string) => boolean;
  isRunning: () => boolean;
  pause: () => void;
  resume: () => void;
}
```

**Endpoints:**
- `GET /api/v1/darwin/status` -> loop stats + running boolean
- `GET /api/v1/darwin/archive` -> all archive cells
- `GET /api/v1/darwin/variants/:id` -> single variant (404 if missing)
- `GET /api/v1/darwin/lineage/:id` -> children of variant
- `GET /api/v1/darwin/governor` -> resource governor stats
- `GET /api/v1/darwin/approvals` -> pending approvals list
- `POST /api/v1/darwin/approvals/:id/approve` -> approve variant
- `POST /api/v1/darwin/approvals/:id/reject` -> reject variant
- `POST /api/v1/darwin/pause` -> pause loop
- `POST /api/v1/darwin/resume` -> resume loop

Add devDependencies: `express`, `@types/express`, `supertest`, `@types/supertest`

**Tests (~7) using supertest:**
- GET status returns loop stats
- GET archive returns cells
- GET variant by id
- GET 404 for missing variant
- GET lineage returns children
- GET governor returns stats
- GET approvals returns list

Run tests: `pnpm vitest run packages/darwin/tests/routes.test.ts`

**Commit:** `git commit -m "feat(darwin): add gateway routes for archive, variants, approvals, governor"`

---

## Task 9: Wire Darwin into runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` -- add Darwin initialization
- Modify: `packages/runtime/package.json` -- add `@auxiora/darwin` dependency

**Context:** Darwin initialization goes in `initialize()` after existing self-improvement systems. Use dynamic import for graceful degradation. Register `darwin-tick` as a recurring job that re-enqueues after each completion with `tickIntervalMs` delay.

**Runtime wiring:**
1. Dynamic import `@auxiora/darwin`
2. Create `ArchiveStore` at `{dataDir}/darwin/archive.db`
3. Create `DarwinLoop` with: store, LLM adapter (wraps modelRouter), sandbox, eventBus, telemetry, pluginLoader, darwinDir, config, domains
4. Register `darwin-tick` job handler that calls `loop.tick()`
5. Enqueue first tick at low priority
6. On `job:completed` for darwin-tick: re-enqueue after delay (unless paused)
7. Mount routes via `mountDarwinRoutes(app, deps)` with: archiveStore, loop stats, governor stats, approval management, pause/resume

**LLM adapter wrapping modelRouter:**
```typescript
{
  call: async (prompt, opts) => {
    const result = await modelRouter.route({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: opts?.maxTokens ?? 4096,
    });
    return typeof result.content === 'string' ? result.content : '';
  }
}
```

**Build and verify:**
Run: `pnpm install && pnpm --filter @auxiora/runtime typecheck`

**Commit:** `git commit -m "feat(runtime): wire Darwin loop as recurring job with gateway routes"`

---

## Task 10: Build and full test suite

**Step 1:** Run Darwin package tests: `pnpm vitest run packages/darwin/`
Expected: ~65 tests pass

**Step 2:** Build all: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
Expected: Clean

**Step 3:** Full test suite: `pnpm vitest run`
Expected: All existing + new tests pass

**Step 4:** Commit any fixes.

---

## Task 11: Dashboard Evolution page

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts` -- add Darwin API methods
- Create: `packages/dashboard/ui/src/pages/Evolution.tsx` -- Evolution page
- Modify: `packages/dashboard/ui/src/App.tsx` -- add route

**API methods to add:**
- `getDarwinStatus()`, `getDarwinArchive()`, `getDarwinVariant(id)`, `getDarwinGovernor()`, `getDarwinApprovals()`, `approveDarwinVariant(id)`, `rejectDarwinVariant(id)`, `pauseDarwin()`, `resumeDarwin()`

**Evolution page sections:**
1. **Header**: "Evolution" title + running/paused status badge + pause/resume button
2. **Stats cards**: total cycles, success rate, archive occupancy, tokens/hour, variants/day
3. **Archive grid**: HTML table with domains as rows, complexity as columns. Each cell shows variant score as colored badge (green > 0.8, yellow > 0.6, red > 0.4, grey = empty)
4. **Pending approvals**: List with variant id, type, queued time, approve/reject buttons
5. **Auto-refresh**: `useEffect` with 10s interval

CSS class prefix: `dw-` (darwin)

**Build:** `pnpm --filter @auxiora/dashboard build`

**Commit:** `git commit -m "feat(dashboard): add Evolution page for Darwin self-improvement monitoring"`

---

## Verification Checklist

1. `pnpm vitest run packages/darwin/` -- all ~65 tests pass
2. `pnpm vitest run` -- full suite passes (existing + new)
3. `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build` -- clean build
4. Runtime starts with: "Darwin evolutionary self-improvement initialized"
5. Dashboard Evolution page loads
6. `curl localhost:18800/api/v1/darwin/status` returns loop stats
7. `curl localhost:18800/api/v1/darwin/archive` returns archive grid
