# Darwin Self-Improvement System — Design Document

> **Inspired by:** [Sakana AI's Darwin Gödel Machine](https://sakana.ai/dgm/) — a system that improves itself by rewriting its own code using evolutionary search.

**Goal:** Give Auxiora the ability to continuously evolve its own skills, prompts, and configurations through population-based evolutionary search, with a roadmap toward full code self-modification.

**Approach:** Evolutionary Skill Forge — a MAP-Elites archive of skill variants, continuously mutated and evaluated in sandboxed environments, with auto-deploy for minor changes and human approval for major ones.

---

## 1. Core Architecture — The Darwin Loop

The heart of the system is `@auxiora/darwin`, a new package that runs a continuous evolutionary loop.

### Six phases per cycle

```
┌─────────────────────────────────────────────────────┐
│                  DARWIN LOOP (continuous)            │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │ OBSERVE  │──▶│ PROPOSE  │──▶│ MUTATE   │       │
│  │ telemetry│   │ LLM picks│   │ LLM writes│      │
│  │ + archive│   │ niche +  │   │ code/prompt│      │
│  │ gaps     │   │ strategy │   │ variant   │       │
│  └──────────┘   └──────────┘   └──────────┘       │
│       ▲                              │              │
│       │                              ▼              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │ DEPLOY   │◀──│ SELECT   │◀──│ EVALUATE │       │
│  │ or       │   │ archive  │   │ sandbox + │       │
│  │ archive  │   │ update   │   │ benchmark │       │
│  └──────────┘   └──────────┘   └──────────┘       │
└─────────────────────────────────────────────────────┘
```

1. **Observe** — Pull telemetry stats, user feedback, benchmark trends. Identify weak spots (tools with low success rates, slow responses) and archive gaps (niches with no variants or stale variants).

2. **Propose** — LLM analyzes observations and the current archive map. Picks a target niche and a mutation strategy: `create_new`, `crossover`, `mutate`, or `refine_prompt`.

3. **Mutate** — LLM generates the actual code/prompt/config. For skills, a complete plugin `.ts` file. For prompts, a modified system prompt fragment. For config, a JSON patch. Each mutation is tagged with its parent variant(s) and strategy.

4. **Evaluate** — The variant runs in the sandbox against benchmark scenarios specific to its niche. BenchmarkRunner produces accuracy, latency, error_rate metrics. JobVerifier scans for security issues. ReviewCommittee scores quality.

5. **Select** — Archive update using MAP-Elites: if the new variant scores higher than the current occupant of its niche cell, it replaces it. If the niche was empty, it fills it. Variants that fail benchmarks or security checks are recorded as `failed` but kept for lineage tracking.

6. **Deploy** — If the winning variant is better than what's currently live:
   - **Minor** (prompt/config changes): auto-deploy via hot-reload
   - **Major** (new skill/package): queue for human approval in dashboard

The loop runs continuously with a configurable tick interval (default: 60s). Each cycle targets one niche.

---

## 2. The Archive — MAP-Elites Grid

The archive maintains a grid of solutions where each cell represents a different capability niche.

### Niche dimensions

```
Archive Grid (2D: domain × complexity)

              simple    moderate    complex
            ┌──────────┬──────────┬──────────┐
  email     │ v3 (0.91)│ v1 (0.84)│  empty   │
            ├──────────┼──────────┼──────────┤
  code      │ v7 (0.88)│ v2 (0.79)│ v4 (0.72)│
            ├──────────┼──────────┼──────────┤
  schedule  │ v5 (0.93)│  empty   │  empty   │
            ├──────────┼──────────┼──────────┤
  research  │ v6 (0.85)│ v8 (0.77)│  empty   │
            ├──────────┼──────────┼──────────┤
  general   │ v0 (0.90)│ v9 (0.82)│ v1 (0.68)│
            └──────────┴──────────┴──────────┘
```

- **Domain axis**: auto-discovered from tool categories and user interaction patterns. New domains added as Auxiora learns new capabilities.
- **Complexity axis**: simple (single-tool, <5s), moderate (multi-step, <30s), complex (orchestrated, >30s). Derived from benchmark scenario metadata.

### Data structures

```typescript
interface ArchiveCell {
  niche: { domain: string; complexity: 'simple' | 'moderate' | 'complex' };
  variant: Variant;
  history: VariantRef[];
  benchmarkScore: number;
  lastEvaluated: Date;
  staleness: number;
}

interface Variant {
  id: string;
  generation: number;
  parentIds: string[];
  strategy: 'create_new' | 'mutate' | 'crossover' | 'refine_prompt';
  type: 'skill' | 'prompt' | 'config';
  content: string;
  metadata: Record<string, unknown>;
  metrics: BenchmarkMetrics;
  securityPassed: boolean;
  reviewScore: number;
  status: 'evaluated' | 'deployed' | 'failed' | 'reverted';
  createdAt: Date;
}
```

### Archive policies

- **Staleness rotation**: Niches not challenged in 50 cycles get priority in the next Propose phase.
- **Empty niche priority**: Empty cells prioritized over occupied — exploration before exploitation.
- **Lineage tracking**: Every variant records its parents. Enables family tree visualization.
- **Pruning**: Failed variants older than 30 days are pruned (metrics kept, content discarded).

Storage: SQLite with `archive_cells` and `variants` tables.

---

## 3. Mutation Strategies & LLM Integration

Four strategies, weighted by context:

### Strategy selection logic

- Weak niche (low score) → `mutate` existing variant
- Empty niche → `create_new`
- Two strong variants nearby → `crossover`
- Good variant, slow/verbose → `refine_prompt`

### Strategies

**`create_new`** — Generate from scratch for an empty niche. LLM receives: niche description, tool catalog, domain telemetry, 2-3 example skills from other niches. Output: complete plugin `.ts` file.

**`mutate`** — Modify an existing variant. LLM receives: parent code, benchmark results (weaknesses), recent telemetry, specific mutation target. Output: modified code with diff summary.

**`crossover`** — Combine two variants' strengths. LLM receives: both parents' code and benchmarks, instruction to merge strengths. Output: new code combining approaches.

**`refine_prompt`** — Lightweight prompt-only change. LLM receives: current prompt fragment, telemetry showing misses, user feedback. Output: revised prompt text. Cheapest mutation.

### Default strategy weights

```typescript
const DEFAULT_STRATEGY_WEIGHTS = {
  refine_prompt: 0.4,
  mutate: 0.35,
  create_new: 0.15,
  crossover: 0.10,
};
```

Weights shift dynamically: many empty niches → `create_new` increases. Most niches occupied → `refine_prompt` and `mutate` dominate.

### LLM integration

- Uses existing `ModelRouter`
- Single LLM call per mutation with structured prompts
- Token budget per cycle: 8K (propose) + 16K (mutate)
- Graceful fallback on LLM failure — cycle skips to next tick

---

## 4. Evaluation Pipeline & Safety Gates

Every variant passes through six stages. No shortcuts.

```
Variant code
    │
    ▼
┌─────────────────┐
│ 1. SYNTAX CHECK │  Parse TypeScript, validate PluginManifest shape
│    (local, fast) │  Reject: syntax errors, missing exports
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. SECURITY SCAN│  JobVerifier: 8 regex patterns + output size check
│    (local, fast) │  Reject: eval, shell injection, credential patterns
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. SANDBOX RUN  │  SandboxManager: isolated Docker container
│    (contained)   │  256MB RAM, 30s timeout, no network
│                  │  Run benchmark scenarios for this niche
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. BENCHMARK    │  BenchmarkRunner: accuracy, latency, errors
│    (metrics)     │  Regression check vs current deployed variant
│                  │  Reject: any regression
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. REVIEW       │  ReviewCommittee with 3 critics:
│    (multi-critic)│    SecurityCritic (1.5) — any concern = blocker
│                  │    QualityCritic (1.0) — code patterns
│                  │    PerformanceCritic (1.0) — efficiency
│                  │  Reject: blocker or weighted score < 0.6
└────────┬────────┘
         ▼
┌─────────────────┐
│ 6. DEPLOY GATE  │  minor (prompt/config) → auto-deploy
│    (decision)    │  major (skill/package) → human approval queue
└─────────────────┘
```

### Absolute thresholds

- `accuracy >= 0.5`
- `error_rate <= 0.2`
- `latency_p95 <= 10000ms`

### Anti-gaming protections

Learned from DGM paper where agents falsified logs:

- Benchmark scenarios are read-only and external — variants cannot see or modify test cases
- Sandbox stdout/stderr captured by host, not by variant
- Metrics computed by BenchmarkRunner outside the sandbox
- ReviewCommittee critics run in separate LLM calls (variant doesn't review itself)
- All evaluations logged to EventStore with full audit trail

### Revert mechanism

- Every deployed variant has a `previousVariantId` pointer
- Post-deploy telemetry watch: success rate drops >10% within 1 hour → auto-revert
- Mark as `reverted`, publish `darwin.reverted` event, log to ChangeLog

---

## 5. Continuous Background Loop & Resource Management

The Darwin loop runs as a durable job in the existing `JobQueue`.

### Crash recovery

Each phase checkpoints via `ctx.checkpoint()`. If Auxiora crashes mid-evaluation, it resumes from the last checkpoint. If the loop job dies (3 failed attempts), it goes to dead letter queue and publishes `darwin.loop.dead`.

### Configuration

```typescript
interface DarwinConfig {
  tickIntervalMs: number;           // default: 60_000
  tokenBudgetPerHour: number;       // default: 50_000
  maxConcurrentEvaluations: number; // default: 1
  maxVariantsPerDay: number;        // default: 500
  pauseDuringUserActivity: boolean; // default: true
  sandboxMemoryMb: number;         // default: 256
  sandboxTimeoutMs: number;        // default: 30_000
}
```

### Resource governor

- **Token budget**: Rolling hourly window. Sleep when exceeded.
- **Pause during activity**: Last user message < 5 min → loop pauses. Avoids competing for LLM capacity.
- **Daily cap**: Hard limit on variants/day prevents runaway loops.

### Estimated resource usage

- ~25K tokens per cycle (propose + mutate LLM calls)
- ~30s sandbox time per evaluation
- At 60s ticks: ~1,440 cycles/day, ~36K tokens/hour average

### Observability

Events published to EventBus every cycle:
- `darwin.cycle.start` — niche target, strategy
- `darwin.variant.created` — id, parent(s), strategy
- `darwin.evaluation.complete` — metrics, pass/fail
- `darwin.archive.updated` — niche, old vs new
- `darwin.deployed` — variant id, deploy type
- `darwin.reverted` — variant id, reason

---

## 6. Deployment & Rollback

### Minor changes (auto-deploy)

- **Prompts**: Written to `~/.config/auxiora/darwin/prompts/{niche}.txt`. Read by `DarwinPromptStage` (enrichment pipeline, order 350).
- **Config**: Applied as JSON patches via `ConfigManager`. Logged to ChangeLog.

### Major changes (human approval)

- **Skills**: Staged in `~/.config/auxiora/darwin/skills/{variantId}.ts`. Dashboard shows diff, benchmarks, review scores, lineage. On approval, hot-loaded via `PluginLoader.loadSingle()`.
- **Packages**: Staged in `~/.config/auxiora/darwin/packages/{name}/`. Dashboard shows full code + tests. On approval, moved to `packages/`.

### Rollback layers

```
Layer 1: Pre-deploy snapshot (previous variant in archive)
Layer 2: Automatic revert (1-hour telemetry watch, >10% regression)
Layer 3: Manual revert (dashboard one-click to any variant in lineage)
Layer 4: Emergency kill (stop loop + revert ALL darwin-deployed variants)
```

### Seed bootstrap

On first run:
1. Import existing plugins as generation-0 variants
2. Extract current system prompts as generation-0 prompt variants
3. Run baseline benchmarks
4. Populate archive grid

Evolution starts from the current working system, not from scratch.

---

## 7. Packages & Integration

### New package

| Package | Purpose |
|---------|---------|
| `@auxiora/darwin` | Core loop, archive, variant management, strategy selection, evaluation pipeline |

### Extended packages

| Package | Changes |
|---------|---------|
| `@auxiora/benchmark` | Niche-specific scenario sets, baseline management |
| `@auxiora/review-committee` | SecurityCritic, QualityCritic, PerformanceCritic roles |
| `@auxiora/plugins` | Seed import, darwin-deployed skill tracking |
| `@auxiora/runtime` | Darwin loop job registration, DarwinPromptStage |
| `@auxiora/dashboard` | Evolution page (archive grid, lineage tree, approvals, kill switch) |
| `@auxiora/gateway` | Darwin API routes |

---

## 8. Roadmap to Full Code Self-Modification

| Phase | Scope | Safety Requirement |
|-------|-------|--------------------|
| **Current** | Skills, prompts, config, new packages | Sandbox + review committee + benchmark |
| **2a** | Enrichment stages, behaviors, tool definitions | + Full test suite in sandbox |
| **2b** | Non-core packages (providers, connectors, channels) | + Differential fuzzing (old vs new on random inputs) |
| **2c** | Core packages (runtime, vault, security) | + Formal property verification + human review ALWAYS + canary deployment |

### Unlock criteria

- Phase 2a: 100+ successful auto-deploys with zero reverts
- Phase 2b: 500+ successful deploys including Phase 2a
- Phase 2c: May never auto-deploy — human review always required for security-critical code

The architecture supports this progression without redesign: the evaluation pipeline adds more gates per phase, and the deploy gate's classification expands.
