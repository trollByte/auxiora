# Unified Consciousness Layer — Design Document

**Date:** 2026-02-19
**Status:** Approved
**Package:** `packages/consciousness/`

## Problem

Auxiora has five disconnected self-awareness systems:

1. **7 Self-Awareness Collectors** — CPU, memory, uptime, provider health, session stats, etc.
2. **IntrospectTool** — Queries collectors on demand, no persistence
3. **HealthMonitor** — Periodic checks with auto-fix, runs independently
4. **The Architect Stores** — PreferenceHistory, DecisionLog, FeedbackStore, CorrectionStore — personality-scoped, not system-visible
5. **Behavior Scheduler** — Runs scheduled tasks, no awareness of system state

These systems operate as silos. The Architect doesn't see health signals. Collectors don't persist across restarts. The health monitor doesn't inform personality. There is no memory between conversations, no ability to self-repair, and no unified model of "what I am right now."

## Solution: Unified Consciousness Layer

A new `packages/consciousness/` package that acts as Auxiora's "brain stem" — always-on, connecting all subsystems into a single coherent awareness.

### Design Principles

- **Read from everything, own nothing** — Consciousness reads from existing stores and collectors but doesn't duplicate their data
- **Lazy by default** — Heavy synthesis happens on demand (`synthesize()`), not on every tick
- **Template-based narratives** — Deterministic string interpolation, not LLM-generated
- **Vault-encrypted persistence** — Session journals stored through existing vault system
- **Tiered autonomy for self-repair** — Low/medium/high risk gates prevent dangerous self-modification

---

## Section 1: Package Structure & Core Abstractions

```
packages/consciousness/
├── src/
│   ├── index.ts              # Barrel exports
│   ├── consciousness.ts      # Orchestrator class
│   ├── journal/
│   │   ├── session-journal.ts
│   │   └── journal-types.ts
│   ├── monitor/
│   │   ├── self-monitor.ts
│   │   ├── signal-synthesizer.ts
│   │   └── monitor-types.ts
│   ├── repair/
│   │   ├── self-repair-engine.ts
│   │   ├── repair-actions.ts
│   │   └── repair-types.ts
│   └── model/
│       ├── self-model.ts
│       └── model-types.ts
├── tests/
├── package.json
└── tsconfig.json
```

### Core Orchestrator

```typescript
class Consciousness {
  constructor(deps: {
    vault: VaultService;
    collectors: SelfAwarenessCollector[];
    healthMonitor: HealthMonitor;
    architectStores: {
      preferenceHistory: PreferenceHistory;
      decisionLog: DecisionLog;
      feedbackStore: FeedbackStore;
      correctionStore: CorrectionStore;
    };
    behaviorScheduler: BehaviorScheduler;
    runtime: RuntimeManager;
  })

  readonly journal: SessionJournal;
  readonly monitor: SelfMonitor;
  readonly repair: SelfRepairEngine;
  readonly model: SelfModel;

  async initialize(): Promise<void>   // Load persisted state, start monitor loop
  async shutdown(): Promise<void>     // Persist state, stop loops
}
```

### Dependencies

- `@auxiora/vault` — Encrypted persistence for journal entries
- `@auxiora/logger` — Structured logging
- Existing collector/monitor/store interfaces (imported as types)

---

## Section 2: Session Journal — Full Conversation Memory

### Purpose

Remember everything across conversations. Every message, every context detection, every decision, every correction — indexed and searchable.

### Types

```typescript
interface JournalEntry {
  id: string;                    // UUID
  sessionId: string;             // Groups entries per conversation
  timestamp: number;
  type: 'message' | 'decision' | 'correction' | 'system_event';

  // Message data (when type === 'message')
  message?: {
    role: 'user' | 'assistant';
    content: string;             // Full text
    tokens?: number;
  };

  // Context snapshot at time of entry
  context: {
    domains: ContextDomain[];    // Active domains detected
    emotionalArc?: string;       // From emotional tracker
    activeDecisions?: string[];  // Decision IDs being discussed
    corrections?: string[];      // Correction IDs applied
    satisfaction?: number;       // Current satisfaction score
  };

  // System state at time of entry
  selfState: {
    health: 'healthy' | 'degraded' | 'critical';
    activeProviders: string[];
    uptime: number;
  };

  // Auto-generated after each exchange
  summary?: string;              // 1-2 sentence template summary
}
```

### Class

```typescript
class SessionJournal {
  constructor(vault: VaultService)

  async record(entry: Omit<JournalEntry, 'id' | 'timestamp'>): Promise<string>
  async getSession(sessionId: string): Promise<JournalEntry[]>
  async search(query: {
    text?: string;
    domains?: ContextDomain[];
    dateRange?: { from: number; to: number };
    type?: JournalEntry['type'];
    limit?: number;
  }): Promise<JournalEntry[]>
  async getRecentSessions(limit?: number): Promise<SessionSummary[]>
  async summarizeSession(sessionId: string): Promise<SessionSummary>
}
```

### SessionSummary

```typescript
interface SessionSummary {
  sessionId: string;
  startTime: number;
  endTime: number;
  messageCount: number;
  domains: ContextDomain[];       // All domains touched
  decisions: string[];            // Decision IDs referenced
  corrections: number;            // Count of corrections
  satisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
  summary: string;                // Template-generated 2-3 sentences
}
```

### Persistence

- Encrypted via vault using key `consciousness:journal:{sessionId}`
- Session summaries indexed separately at `consciousness:journal:index`
- Search uses in-memory index loaded at startup, backed by vault
- Retention: configurable, default 90 days

---

## Section 3: Self-Monitor — Continuous Internal Awareness

### Purpose

Always know what's happening inside. Synthesize signals from all 7 collectors, health monitor, Architect stores, and runtime into a single `SystemPulse`.

### Signal Synthesizer

Reads from all existing data sources without owning them:

```typescript
class SignalSynthesizer {
  constructor(deps: {
    collectors: SelfAwarenessCollector[];
    healthMonitor: HealthMonitor;
    architectStores: ArchitectStores;
    runtime: RuntimeManager;
  })

  synthesize(): SystemPulse
}
```

### SystemPulse

```typescript
interface SystemPulse {
  timestamp: number;
  overall: 'healthy' | 'degraded' | 'critical';

  subsystems: {
    name: string;
    status: 'up' | 'degraded' | 'down';
    lastCheck: number;
    metrics?: Record<string, number>;
  }[];

  anomalies: {
    subsystem: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    detectedAt: number;
  }[];

  reasoning: {
    avgResponseQuality: number;     // From feedback store
    domainAccuracy: number;         // From correction store
    preferenceStability: number;    // From preference history
  };

  resources: {
    memoryUsageMb: number;
    cpuPercent: number;
    activeConnections: number;
    uptimeSeconds: number;
  };

  capabilities: {
    totalCapabilities: number;
    healthyCapabilities: number;
    degradedCapabilities: string[];  // Names of degraded ones
  };
}
```

### SelfMonitor

```typescript
class SelfMonitor {
  constructor(synthesizer: SignalSynthesizer, options?: {
    intervalMs?: number;          // Default: 30_000 (30s)
    anomalyThreshold?: number;    // Default: 3 (consecutive degraded readings)
  })

  start(): void                   // Begin monitoring loop
  stop(): void                    // Stop loop
  getPulse(): SystemPulse         // Get latest (cached from last tick)
  onAnomaly(handler: (anomaly: Anomaly) => void): void  // Subscribe
}
```

### Monitoring Loop

1. Every 30s: call `synthesizer.synthesize()` → cache as `latestPulse`
2. Compare with previous pulse — detect new anomalies
3. If anomaly count exceeds threshold → emit to subscribers
4. Subscribers include: Self-Repair Engine (for auto-diagnosis), logging

---

## Section 4: Self-Repair Engine — Tiered Autonomy

### Purpose

When something goes wrong, diagnose it and fix it — with appropriate safety gates based on risk level.

### Trust Tiers

| Tier | Risk | Action | Examples |
|------|------|--------|----------|
| **auto** | Low | Execute + log | Clear stale cache, restart failed collector, rotate log files |
| **notify** | Medium | Execute + notify user | Disable degraded provider, adjust rate limits, rebuild index |
| **approve** | High | Request approval first | Modify source code, change security config, alter vault keys, update dependencies |

### Types

```typescript
interface Diagnosis {
  id: string;
  timestamp: number;
  anomaly: Anomaly;
  rootCause: string;             // Template-generated explanation
  confidence: number;            // 0.0-1.0
  suggestedActions: RepairAction[];
}

interface RepairAction {
  id: string;
  tier: 'auto' | 'notify' | 'approve';
  description: string;
  command: string;               // The actual action (function name or shell command)
  rollback?: string;             // How to undo
  estimatedImpact: string;
}

interface RepairLog {
  actionId: string;
  diagnosisId: string;
  tier: 'auto' | 'notify' | 'approve';
  status: 'executed' | 'approved' | 'rejected' | 'failed' | 'rolled_back';
  executedAt: number;
  result?: string;
  error?: string;
}
```

### Class

```typescript
class SelfRepairEngine {
  constructor(deps: {
    monitor: SelfMonitor;
    vault: VaultService;         // For persisting repair log
    onNotify: (diagnosis: Diagnosis, action: RepairAction) => void;
    onApprovalRequest: (diagnosis: Diagnosis, action: RepairAction) => Promise<boolean>;
  })

  async diagnose(anomaly: Anomaly): Promise<Diagnosis>
  async executeAction(action: RepairAction): Promise<RepairLog>
  async approveAction(actionId: string): Promise<RepairLog>
  async rejectAction(actionId: string): Promise<void>
  getRepairHistory(limit?: number): RepairLog[]
  getPendingApprovals(): Array<{ diagnosis: Diagnosis; action: RepairAction }>
}
```

### Repair Flow

1. SelfMonitor detects anomaly → emits to SelfRepairEngine
2. Engine calls `diagnose()` — pattern-matches anomaly against known repair patterns
3. For each suggested action:
   - **auto tier**: Execute immediately, log result
   - **notify tier**: Execute, then call `onNotify` callback
   - **approve tier**: Call `onApprovalRequest`, wait for response, then execute or skip
4. All actions logged to `RepairLog`, persisted via vault

### Built-in Repair Patterns (initial set)

| Anomaly Pattern | Tier | Action |
|----------------|------|--------|
| Collector returning stale data | auto | Restart collector |
| Provider health < 50% | notify | Disable provider, failover to next |
| Memory usage > 90% | notify | Clear caches, suggest restart |
| All providers down | approve | Attempt credential rotation |
| Feedback satisfaction declining | auto | Log alert, no action |
| Preference conflicts detected | notify | Surface to user for resolution |

---

## Section 5: Self-Model — "What I Am Right Now"

### Purpose

A unified, queryable representation of Auxiora's complete state — what she knows, how she's performing, what she remembers, what needs attention.

### Types

```typescript
interface SelfModelSnapshot {
  generatedAt: number;

  // Identity
  identity: {
    name: string;                // "Auxiora"
    version: string;             // From package.json
    personality: string;         // "The Architect"
    uptime: number;
  };

  // Memory
  memory: {
    totalSessions: number;
    totalMessages: number;
    oldestMemory: number;        // Timestamp
    recentTopics: string[];      // From last 5 sessions
    activeDecisions: number;
    pendingFollowUps: number;
  };

  // Health
  health: SystemPulse;           // From SelfMonitor

  // Performance
  performance: {
    responseQuality: number;     // From feedback store
    domainAccuracy: number;      // From correction store
    userSatisfaction: 'improving' | 'stable' | 'declining';
    strongDomains: string[];
    weakDomains: string[];
  };

  // Self-repair
  repair: {
    recentActions: number;       // Last 24h
    pendingApprovals: number;
    lastRepairAt: number | null;
  };

  // Narrative
  selfNarrative: string;         // 5-sentence template-generated summary
}
```

### Class

```typescript
class SelfModel {
  constructor(deps: {
    journal: SessionJournal;
    monitor: SelfMonitor;
    repair: SelfRepairEngine;
    architectStores: ArchitectStores;
    version: string;
  })

  async synthesize(): Promise<SelfModelSnapshot>
}
```

### Narrative Template

5 sentences, deterministic:

1. **Identity**: "I am Auxiora v{version}, running for {uptime}. I use The Architect personality framework."
2. **Memory**: "I remember {totalSessions} conversations spanning {timeRange}. My recent focus has been on {recentTopics}."
3. **Health**: "My systems are {overall}." + (if degraded: "Issues: {anomaly descriptions}.")
4. **Performance**: "User satisfaction is {trend}. I'm strongest in {strongDomains} and working to improve in {weakDomains}."
5. **Activity**: "I have {activeDecisions} active decisions and {pendingApprovals} repair actions awaiting approval." (omitted if both zero)

---

## Integration Points

### With Existing Systems

| System | How Consciousness Uses It |
|--------|--------------------------|
| 7 Collectors | SignalSynthesizer reads their latest values |
| HealthMonitor | SignalSynthesizer reads health status |
| IntrospectTool | Can be extended to query SelfModel |
| Architect Stores | SignalSynthesizer reads for reasoning quality metrics |
| Behavior Scheduler | Can trigger journal entries for scheduled events |
| Vault | Journal and RepairLog persistence |
| Runtime | SignalSynthesizer reads active provider info |

### With The Architect

The Architect's `generatePrompt()` can optionally include consciousness data:

```typescript
const prompt = architect.generatePrompt(message);
const selfModel = await consciousness.model.synthesize();
// Inject selfModel.selfNarrative into system prompt context
```

This is opt-in, not automatic — consumers decide when to include consciousness context.

### With Gateway/API

New endpoints:
- `GET /api/v1/consciousness/pulse` — Latest SystemPulse
- `GET /api/v1/consciousness/model` — Full SelfModelSnapshot
- `GET /api/v1/consciousness/journal/search` — Search journal entries
- `GET /api/v1/consciousness/repairs` — Repair history and pending approvals
- `POST /api/v1/consciousness/repairs/:id/approve` — Approve a repair action
- `POST /api/v1/consciousness/repairs/:id/reject` — Reject a repair action
