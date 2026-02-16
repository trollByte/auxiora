# Dynamic Self-Awareness System — Design

> **Goal:** Make Auxiora dynamically self-aware across 7 dimensions — conversational quality, resource capacity, knowledge boundaries, per-user relationships, temporal context, environment, and meta-cognition — with both silent improvement and proactive insight surfacing.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Composable signal collectors | Matches existing plugin-like patterns (tools, channels, behaviors). Each dimension is independent, testable, toggleable. |
| Awareness use | Both silent + proactive | Silently improves response quality AND surfaces useful observations to the user. |
| Scope | Per-user | Each user gets their own relationship model, preferences, and interaction history. |
| Token budget | ~500 tokens | Rich enough for detailed context. Assembler prioritizes signals to fit budget. |
| Meta-cognition timing | Async/background | `afterResponse()` runs after each response. No added latency. Feeds into next message. |
| Storage | Vault-backed with caching | Encrypted at rest. Vault reads in `afterResponse()`, cached for `collect()`. |
| Error handling | Graceful degradation | Collector failures are caught and skipped. Self-awareness never breaks conversations. |

## Architecture

### New package: `packages/self-awareness/`

```
packages/self-awareness/
  src/
    types.ts                    # Shared interfaces
    assembler.ts                # Combines collector outputs into prompt text
    collectors/
      conversation-reflector.ts # Dimension 1: Conversational self-reflection
      capacity-monitor.ts       # Dimension 2: Resource & capacity awareness
      knowledge-boundary.ts     # Dimension 3: Knowledge boundary awareness
      relationship-model.ts     # Dimension 4: Relationship memory
      temporal-tracker.ts       # Dimension 5: Temporal self-model
      environment-sensor.ts     # Dimension 6: Environmental awareness
      meta-cognitor.ts          # Dimension 7: Meta-cognitive loop
    storage.ts                  # Persistence layer (vault-backed)
    index.ts                    # Barrel exports
  tests/
    assembler.test.ts
    storage.test.ts
    collectors/
      conversation-reflector.test.ts
      capacity-monitor.test.ts
      knowledge-boundary.test.ts
      relationship-model.test.ts
      temporal-tracker.test.ts
      environment-sensor.test.ts
      meta-cognitor.test.ts
  package.json
  tsconfig.json
```

### Core Interfaces

```typescript
interface AwarenessSignal {
  dimension: string;              // Which collector produced this
  priority: number;               // 0-1, higher = more important to include
  text: string;                   // Human-readable signal for prompt injection
  data: Record<string, unknown>;  // Structured data for programmatic use
}

interface SignalCollector {
  name: string;
  enabled: boolean;
  collect(context: CollectionContext): Promise<AwarenessSignal[]>;
  afterResponse?(context: PostResponseContext): Promise<void>;
}

interface CollectionContext {
  userId: string;
  sessionId: string;
  chatId: string;
  currentMessage: string;
  recentMessages: Message[];
  metrics: MetricsSnapshot;
  config: Config;
}

interface PostResponseContext extends CollectionContext {
  response: string;
  responseTime: number;
  tokensUsed: { input: number; output: number };
}
```

### Assembler

Runs all enabled collectors in parallel, sorts signals by priority, compresses into token budget:

```typescript
class SelfAwarenessAssembler {
  private collectors: SignalCollector[];
  private tokenBudget: number = 500;

  async assemble(context: CollectionContext): Promise<string> {
    const results = await Promise.allSettled(
      this.collectors.filter(c => c.enabled).map(c =>
        Promise.race([
          c.collect(context),
          timeout(200).then(() => [] as AwarenessSignal[])
        ])
      )
    );
    const signals = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
    return this.compress(signals);
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    await Promise.allSettled(
      this.collectors.filter(c => c.afterResponse).map(c => c.afterResponse!(context))
    );
  }
}
```

## Collector Details

### 1. Conversation Reflector

Tracks quality signals within the current conversation.

**Signals:** `clarificationRate`, `repetitionScore`, `sentimentShift`, `questionReaskRate`

**How:** `collect()` scans last 10 messages for clarification patterns ("no, I meant", "that's not what I asked", rephrased questions). Cheap string matching, no LLM call. `afterResponse()` stores compact response fingerprints (top 10 keywords + length) to detect repetition.

**Example output:**
```
Conversation health: User has rephrased their question twice — likely not getting the answer they need. Consider a different approach.
```

### 2. Capacity Monitor

Reads live metrics for operational status.

**Signals:** `activeSessions`, `tokenBurnRate`, `providerLatency`, `rateLimitProximity`

**How:** `collect()` reads from `applicationMetrics` — pure in-memory reads, fastest collector (<1ms). No `afterResponse()` needed.

**Example output:**
```
Capacity: 3 active sessions, avg provider latency 1.2s (normal). Token usage today: ~45k.
```

### 3. Knowledge Boundary

Tracks topics where Auxiora hedged or got corrected. Builds an uncertainty map.

**Signals:** `uncertainTopics`, `correctionHistory`, `knowledgeCutoffRelevance`

**How:** `collect()` checks current message topic against stored uncertainty map. `afterResponse()` scans own response for hedge phrases ("I'm not sure", "I think", "I believe"). Detects user corrections in the next message. Storage: per-user uncertainty map in vault.

**Example output:**
```
Knowledge boundary: User previously corrected you about Kubernetes networking (2 corrections). Tread carefully and verify claims.
```

### 4. Relationship Model

Builds per-user profile of communication preferences and expertise.

**Signals:** `preferredStyle`, `expertiseDomains`, `topicHistory`, `interactionPatterns`

**How:** `collect()` loads user's relationship profile from cached vault data. `afterResponse()` analyzes message length ratios (verbosity preference), domain keywords (topic history), correction events (expertise), and persists incrementally.

**Example output:**
```
User profile: Prefers concise responses. Expert in TypeScript and security. Usually asks about engineering and architecture. 47 prior interactions.
```

### 5. Temporal Tracker

Gives Auxiora a sense of its own timeline.

**Signals:** `uptime`, `sessionMomentum`, `learningTrajectory`, `interactionVolume`

**How:** `collect()` reads `process.uptime()`, session metadata, and daily counters from storage. `afterResponse()` increments daily counters and computes rolling 7-day correction rate.

**Storage:** Rolling 30-day daily counters: `{ date, messages, corrections }[]`

**Example output:**
```
Timeline: Running for 3d 14h. This conversation: 12 messages over 23 minutes. Correction rate trending down (improving) this week.
```

### 6. Environment Sensor

Awareness of deployment context and system conditions.

**Signals:** `systemResources`, `networkHealth`, `timeContext`, `storageHealth`

**How:** `collect()` reads `process.memoryUsage()`, `os.loadavg()`, recent error counters from metrics, and system clock. Point-in-time snapshot, no `afterResponse()`.

**Example output:**
```
Environment: Mon 2:30 PM (peak hours). Memory usage normal (245MB). Provider error rate 0% last hour.
```

### 7. Meta-Cognitor

Analyzes Auxiora's own response patterns and reasoning quality. Runs primarily in `afterResponse()` (async background).

**Signals:** `traitEffectiveness`, `responseStyleDrift`, `domainMismatch`, `proactiveInsights`

**How:** `afterResponse()` compares response domain vs detected context, measures response length trends, checks for user correction/follow-up patterns. After 3+ occurrences of a pattern, generates a proactive insight. `collect()` emits stored insights from previous cycles.

**Storage:** Per-chat meta-cognitive state — last 5 response fingerprints + accumulated insights. Pruned on chat archive.

**Example output:**
```
Meta: Your last 3 responses grew progressively longer (120→280→510 words) — consider tightening. User consistently follows architecture questions with security concerns — proactively include security analysis.
```

## Runtime Integration

### Per-Message Flow

```
User message arrives
        ↓
  handleMessage() — load session, chat metadata, context messages  (existing)
        ↓
  Retrieve living memory section  (existing, line ~1915)
        ↓
  ★ assembler.assemble(context)  — runs all 7 collectors in parallel
        ↓
  Build enriched prompt = systemPrompt + memory + selfAwareness + mode enrichment
        ↓
  Send to provider, stream response  (existing)
        ↓
  ★ assembler.afterResponse(context)  — fire-and-forget background analysis
        ↓
  Done
```

### Prompt Structure

```
[Base personality prompt — Architect or Standard]

---

[Self-Awareness — static capabilities]
Tools (12): file_read, file_write, bash, ...
Channels: webchat (connected), discord (connected)
Provider: Anthropic (primary)
Health: All systems operational

[Self-Awareness — dynamic context]
User profile: Prefers concise responses. Expert in TypeScript. 47 prior interactions.
Conversation: 12 messages over 23 min. User rephrased once — verify you're on track.
Capacity: 2 active sessions, provider latency normal.
Timeline: Running 3d 14h. Correction rate improving this week.
Meta: Response length trending up — consider tightening.

---

[Living Memory]

---

[Mode enrichment / Architect traits]
```

### Token Budget Management

Signals sorted by priority, greedily included until budget exhausted:

| Priority | Signals |
|---|---|
| 1.0 (critical) | User corrections, capacity warnings, repetition alerts |
| 0.7 (important) | Relationship preferences, knowledge boundaries |
| 0.4 (contextual) | Temporal stats, environment info |
| 0.2 (background) | Meta-cognitive observations, trend data |

### Storage Architecture

```
Vault namespace: "self-awareness"
├── users/
│   ├── {userId}/relationship.json     # Per-user profile
│   ├── {userId}/knowledge-map.json    # Uncertainty map
│   └── {userId}/style-prefs.json      # Communication preferences
├── temporal/
│   └── daily-counters.json            # Rolling 30-day stats
├── chats/
│   └── {chatId}/meta-state.json       # Per-chat meta-cognitive state
└── conversations/
    └── {chatId}/reflections.json      # Response fingerprints
```

### Config Schema

```typescript
const SelfAwarenessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokenBudget: z.number().default(500),
  collectors: z.object({
    conversationReflector: z.boolean().default(true),
    capacityMonitor: z.boolean().default(true),
    knowledgeBoundary: z.boolean().default(true),
    relationshipModel: z.boolean().default(true),
    temporalTracker: z.boolean().default(true),
    environmentSensor: z.boolean().default(true),
    metaCognitor: z.boolean().default(true),
  }).default({}),
  proactiveInsights: z.boolean().default(true),
}).default({});
```

## Error Handling

| Failure | Impact | Recovery |
|---|---|---|
| Collector throws | That dimension's signals missing for this message | Log warning, continue with other collectors |
| Vault read fails | Storage-dependent collectors return empty signals | Graceful degradation — metrics-only collectors still work |
| Collector slow (>200ms) | `Promise.race` with timeout | Skip that collector for this message |
| `afterResponse()` fails | Background analysis lost for this cycle | Fire-and-forget with `.catch(log)`, next cycle recovers |
| Storage write fails | State not persisted | Retry next cycle, in-memory cache still valid |
| Token budget exceeded | Lowest-priority signals dropped | By design — priority sort handles this |

## Testing

~80 tests across 10 test files. Key scenarios:

**Assembler (15 tests):** Parallel execution, token budget enforcement, collector failure isolation, timeout enforcement, priority ordering, empty state.

**Each collector (6-10 tests):** Happy path signal generation, empty/new-user state, pattern detection accuracy, no false positives, storage read/write, graceful degradation.

**Integration (in runtime):** Self-awareness fragment in enriched prompt, `afterResponse()` called after streaming, disabled config → no self-awareness, individual collector toggles.
