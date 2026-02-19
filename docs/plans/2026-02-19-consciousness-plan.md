# Unified Consciousness Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `packages/consciousness/` — Auxiora's persistent self-awareness system with session journal, self-monitor, self-repair engine, and self-model.

**Architecture:** A read-only aggregator package that connects all existing subsystems (7 collectors, health monitor, Architect stores, vault) into a unified consciousness. Four modules: SessionJournal (persistent memory), SelfMonitor (continuous awareness), SelfRepairEngine (tiered self-healing), and SelfModel (unified self-representation). An orchestrator class `Consciousness` wires them together.

**Tech Stack:** TypeScript strict ESM, vitest, pnpm workspaces, `@auxiora/vault` for encrypted persistence, `@auxiora/introspection` for health/capability types, `@auxiora/logger` for structured logging.

**Design doc:** `docs/plans/2026-02-19-consciousness-design.md`

---

## Reference: Key Existing Interfaces

Before implementing, familiarize yourself with these interfaces. **Do not modify any of these files** — consciousness reads from them.

| Interface | File | Key Methods |
|-----------|------|-------------|
| `HealthState` | `packages/introspection/src/types.ts` | `.overall`, `.subsystems[]`, `.issues[]` |
| `HealthMonitorImpl` | `packages/introspection/src/health-monitor.ts` | `.getHealthState()`, `.onChange(cb)` |
| `SignalCollector` | `packages/self-awareness/src/types.ts` | `.collect(ctx)`, `.name`, `.enabled` |
| `AwarenessSignal` | `packages/self-awareness/src/types.ts` | `.dimension`, `.priority`, `.text`, `.data` |
| `Vault` | `packages/vault/src/vault.ts` | `.add(name, value)`, `.get(name)`, `.has(name)`, `.list()`, `.remove(name)` |
| `PreferenceHistory` | `src/personalities/the-architect/preference-history.ts` | `.getEffectiveOffset(trait, domain)`, `.detectConflicts()` |
| `DecisionLog` | `src/personalities/the-architect/decision-log.ts` | `.query(q)`, `.getDueFollowUps()` |
| `FeedbackStore` | `src/personalities/the-architect/feedback-store.ts` | `.getInsights()`, `.getForDomain(d)`, `.getRecentTrend()` |
| `CorrectionStore` | `src/personalities/the-architect/correction-store.ts` | `.getStats()`, `.getCorrections()` |
| `ContextDomain` | `src/personalities/schema.ts` | Union of 17 string literals |
| `TraitMix` | `src/personalities/schema.ts` | 28 numeric trait fields |

---

### Task 1: Package Scaffolding

**Files:**
- Create: `packages/consciousness/package.json`
- Create: `packages/consciousness/tsconfig.json`
- Create: `packages/consciousness/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/consciousness",
  "version": "1.0.0",
  "description": "Unified consciousness layer — persistent self-awareness, self-monitoring, self-repair, and self-model",
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
  "dependencies": {
    "@auxiora/logger": "workspace:*"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "dist/"
  ]
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create minimal barrel export**

```typescript
// packages/consciousness/src/index.ts
// Barrel exports — populated as modules are built
```

**Step 4: Install dependencies**

Run: `cd /home/ai-work/git/auxiora && pnpm install`
Expected: Resolves workspace dependencies, no errors.

**Step 5: Verify type check passes**

Run: `cd /home/ai-work/git/auxiora/packages/consciousness && npx tsc --noEmit`
Expected: No errors (empty barrel).

**Step 6: Commit**

```bash
git add packages/consciousness/
git commit -m "feat(consciousness): scaffold package"
```

---

### Task 2: Journal Types

**Files:**
- Create: `packages/consciousness/src/journal/journal-types.ts`
- Create: `packages/consciousness/tests/journal-types.test.ts`

**Step 1: Write the types test**

```typescript
// packages/consciousness/tests/journal-types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  JournalEntry,
  SessionSummary,
  JournalSearchQuery,
} from '../src/journal/journal-types.js';

describe('JournalTypes', () => {
  it('JournalEntry satisfies shape with message type', () => {
    const entry: JournalEntry = {
      id: 'entry-1',
      sessionId: 'session-abc',
      timestamp: Date.now(),
      type: 'message',
      message: {
        role: 'user',
        content: 'Hello',
        tokens: 5,
      },
      context: {
        domains: ['general'],
      },
      selfState: {
        health: 'healthy',
        activeProviders: ['openai'],
        uptime: 3600,
      },
    };
    expect(entry.type).toBe('message');
    expect(entry.message?.role).toBe('user');
  });

  it('JournalEntry satisfies shape with decision type', () => {
    const entry: JournalEntry = {
      id: 'entry-2',
      sessionId: 'session-abc',
      timestamp: Date.now(),
      type: 'decision',
      context: {
        domains: ['architecture_design'],
        activeDecisions: ['dec-1'],
      },
      selfState: {
        health: 'healthy',
        activeProviders: ['anthropic'],
        uptime: 7200,
      },
    };
    expect(entry.type).toBe('decision');
    expect(entry.message).toBeUndefined();
  });

  it('SessionSummary satisfies shape', () => {
    const summary: SessionSummary = {
      sessionId: 'session-abc',
      startTime: 1000,
      endTime: 2000,
      messageCount: 10,
      domains: ['code_engineering', 'debugging'],
      decisions: ['dec-1'],
      corrections: 2,
      satisfaction: 'positive',
      summary: 'Worked on code engineering and debugging.',
    };
    expect(summary.messageCount).toBe(10);
    expect(summary.satisfaction).toBe('positive');
  });

  it('JournalSearchQuery satisfies shape', () => {
    const query: JournalSearchQuery = {
      text: 'authentication',
      domains: ['security_review'],
      dateRange: { from: 1000, to: 2000 },
      type: 'message',
      limit: 20,
    };
    expect(query.limit).toBe(20);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/journal-types.test.ts`
Expected: FAIL — cannot resolve `../src/journal/journal-types.js`

**Step 3: Write the types**

```typescript
// packages/consciousness/src/journal/journal-types.ts

/** Domains from the Architect personality engine. */
export type { ContextDomain } from '../../../src/personalities/schema.js';

// Re-import for local use
import type { ContextDomain } from '../../../src/personalities/schema.js';

export interface JournalEntryMessage {
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
}

export interface JournalEntryContext {
  domains: ContextDomain[];
  emotionalArc?: string;
  activeDecisions?: string[];
  corrections?: string[];
  satisfaction?: number;
}

export interface JournalEntrySelfState {
  health: 'healthy' | 'degraded' | 'critical';
  activeProviders: string[];
  uptime: number;
}

export type JournalEntryType = 'message' | 'decision' | 'correction' | 'system_event';

export interface JournalEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  type: JournalEntryType;
  message?: JournalEntryMessage;
  context: JournalEntryContext;
  selfState: JournalEntrySelfState;
  summary?: string;
}

export interface SessionSummary {
  sessionId: string;
  startTime: number;
  endTime: number;
  messageCount: number;
  domains: ContextDomain[];
  decisions: string[];
  corrections: number;
  satisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
  summary: string;
}

export interface JournalSearchQuery {
  text?: string;
  domains?: ContextDomain[];
  dateRange?: { from: number; to: number };
  type?: JournalEntryType;
  limit?: number;
}
```

**Important:** The import path `../../../src/personalities/schema.js` is a cross-package reference. Since this is a monorepo and the personality types are in `src/personalities/`, you may need to adjust the import. If this doesn't resolve, define the `ContextDomain` type locally:

```typescript
export type ContextDomain =
  | 'security_review' | 'code_engineering' | 'architecture_design'
  | 'debugging' | 'team_leadership' | 'one_on_one' | 'sales_pitch'
  | 'negotiation' | 'marketing_content' | 'strategic_planning'
  | 'crisis_management' | 'creative_work' | 'writing_content'
  | 'decision_making' | 'learning_research' | 'personal_development'
  | 'general';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/journal-types.test.ts`
Expected: PASS — all 4 tests green.

**Step 5: Commit**

```bash
git add packages/consciousness/src/journal/ packages/consciousness/tests/
git commit -m "feat(consciousness): add journal types"
```

---

### Task 3: Session Journal

**Files:**
- Create: `packages/consciousness/src/journal/session-journal.ts`
- Create: `packages/consciousness/tests/session-journal.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/consciousness/tests/session-journal.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionJournal } from '../src/journal/session-journal.js';
import type {
  JournalEntry,
  SessionSummary,
  JournalSearchQuery,
} from '../src/journal/journal-types.js';

/** Minimal vault mock — stores key-value pairs in memory. */
function createMockVault() {
  const store = new Map<string, string>();
  return {
    add: vi.fn(async (name: string, value: string) => { store.set(name, value); }),
    get: vi.fn((name: string) => store.get(name)),
    has: vi.fn((name: string) => store.has(name)),
    list: vi.fn(() => [...store.keys()]),
    remove: vi.fn(async (name: string) => store.delete(name)),
  };
}

type MockVault = ReturnType<typeof createMockVault>;

function makeEntry(overrides: Partial<JournalEntry> = {}): Omit<JournalEntry, 'id' | 'timestamp'> {
  return {
    sessionId: 'session-1',
    type: 'message',
    message: { role: 'user', content: 'Hello', tokens: 3 },
    context: { domains: ['general'] },
    selfState: { health: 'healthy', activeProviders: ['openai'], uptime: 100 },
    ...overrides,
  };
}

describe('SessionJournal', () => {
  let vault: MockVault;
  let journal: SessionJournal;

  beforeEach(() => {
    vault = createMockVault();
    journal = new SessionJournal(vault as any);
  });

  describe('record', () => {
    it('assigns id and timestamp', async () => {
      const id = await journal.record(makeEntry());
      expect(id).toMatch(/^[0-9a-f-]+$/);
    });

    it('persists to vault after record', async () => {
      await journal.record(makeEntry());
      expect(vault.add).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('returns entries for a given session', async () => {
      await journal.record(makeEntry({ sessionId: 'session-1' }));
      await journal.record(makeEntry({ sessionId: 'session-1' }));
      await journal.record(makeEntry({ sessionId: 'session-2' }));

      const entries = await journal.getSession('session-1');
      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.sessionId === 'session-1')).toBe(true);
    });

    it('returns empty array for unknown session', async () => {
      const entries = await journal.getSession('nonexistent');
      expect(entries).toHaveLength(0);
    });
  });

  describe('search', () => {
    it('filters by text content', async () => {
      await journal.record(makeEntry({ message: { role: 'user', content: 'fix authentication bug' } }));
      await journal.record(makeEntry({ message: { role: 'user', content: 'deploy to production' } }));

      const results = await journal.search({ text: 'authentication' });
      expect(results).toHaveLength(1);
      expect(results[0].message?.content).toContain('authentication');
    });

    it('filters by domain', async () => {
      await journal.record(makeEntry({ context: { domains: ['security_review'] } }));
      await journal.record(makeEntry({ context: { domains: ['code_engineering'] } }));

      const results = await journal.search({ domains: ['security_review'] });
      expect(results).toHaveLength(1);
    });

    it('filters by date range', async () => {
      const now = Date.now();
      await journal.record(makeEntry());

      const results = await journal.search({ dateRange: { from: now - 1000, to: now + 10000 } });
      expect(results.length).toBeGreaterThanOrEqual(1);

      const noResults = await journal.search({ dateRange: { from: 0, to: 1 } });
      expect(noResults).toHaveLength(0);
    });

    it('filters by type', async () => {
      await journal.record(makeEntry({ type: 'message' }));
      await journal.record(makeEntry({ type: 'decision', message: undefined }));

      const results = await journal.search({ type: 'decision' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('decision');
    });

    it('respects limit', async () => {
      for (let i = 0; i < 10; i++) {
        await journal.record(makeEntry());
      }
      const results = await journal.search({ limit: 3 });
      expect(results).toHaveLength(3);
    });
  });

  describe('getRecentSessions', () => {
    it('returns summaries of recent sessions', async () => {
      await journal.record(makeEntry({ sessionId: 'a' }));
      await journal.record(makeEntry({ sessionId: 'b' }));

      const sessions = await journal.getRecentSessions(5);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.every(s => s.sessionId)).toBe(true);
    });
  });

  describe('summarizeSession', () => {
    it('produces a summary with correct fields', async () => {
      await journal.record(makeEntry({
        sessionId: 'sum-1',
        type: 'message',
        context: { domains: ['code_engineering'] },
      }));
      await journal.record(makeEntry({
        sessionId: 'sum-1',
        type: 'message',
        context: { domains: ['debugging'] },
      }));

      const summary = await journal.summarizeSession('sum-1');
      expect(summary.sessionId).toBe('sum-1');
      expect(summary.messageCount).toBe(2);
      expect(summary.domains).toContain('code_engineering');
      expect(summary.domains).toContain('debugging');
      expect(typeof summary.summary).toBe('string');
      expect(summary.summary.length).toBeGreaterThan(0);
    });
  });

  describe('persistence', () => {
    it('loads from vault on initialize', async () => {
      // Record some entries
      await journal.record(makeEntry({ sessionId: 'persist-1' }));

      // Create a new journal from same vault
      const journal2 = new SessionJournal(vault as any);
      await journal2.initialize();

      const entries = await journal2.getSession('persist-1');
      expect(entries).toHaveLength(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/session-journal.test.ts`
Expected: FAIL — cannot resolve `session-journal.js`

**Step 3: Write the implementation**

```typescript
// packages/consciousness/src/journal/session-journal.ts
import { randomUUID } from 'node:crypto';
import type {
  JournalEntry,
  SessionSummary,
  JournalSearchQuery,
  ContextDomain,
} from './journal-types.js';

const VAULT_PREFIX = 'consciousness:journal:';
const INDEX_KEY = 'consciousness:journal:index';

export interface VaultLike {
  add(name: string, value: string): Promise<void>;
  get(name: string): string | undefined;
  has(name: string): boolean;
  list(): string[];
  remove(name: string): Promise<boolean>;
}

export class SessionJournal {
  private vault: VaultLike;
  private entries: JournalEntry[] = [];
  private initialized = false;

  constructor(vault: VaultLike) {
    this.vault = vault;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const raw = this.vault.get(INDEX_KEY);
    if (raw) {
      try {
        this.entries = JSON.parse(raw) as JournalEntry[];
      } catch {
        this.entries = [];
      }
    }
    this.initialized = true;
  }

  async record(entry: Omit<JournalEntry, 'id' | 'timestamp'>): Promise<string> {
    if (!this.initialized) await this.initialize();

    const full: JournalEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    this.entries.push(full);
    await this.persist();
    return full.id;
  }

  async getSession(sessionId: string): Promise<JournalEntry[]> {
    if (!this.initialized) await this.initialize();
    return this.entries.filter(e => e.sessionId === sessionId);
  }

  async search(query: JournalSearchQuery): Promise<JournalEntry[]> {
    if (!this.initialized) await this.initialize();

    let results = [...this.entries];

    if (query.text) {
      const lower = query.text.toLowerCase();
      results = results.filter(e =>
        e.message?.content.toLowerCase().includes(lower) ||
        e.summary?.toLowerCase().includes(lower),
      );
    }

    if (query.domains && query.domains.length > 0) {
      const domainSet = new Set(query.domains);
      results = results.filter(e =>
        e.context.domains.some(d => domainSet.has(d)),
      );
    }

    if (query.dateRange) {
      results = results.filter(e =>
        e.timestamp >= query.dateRange!.from && e.timestamp <= query.dateRange!.to,
      );
    }

    if (query.type) {
      results = results.filter(e => e.type === query.type);
    }

    if (query.limit && query.limit > 0) {
      results = results.slice(-query.limit);
    }

    return results;
  }

  async getRecentSessions(limit = 10): Promise<SessionSummary[]> {
    if (!this.initialized) await this.initialize();

    const sessionIds = [...new Set(this.entries.map(e => e.sessionId))];
    const recent = sessionIds.slice(-limit);

    const summaries: SessionSummary[] = [];
    for (const sid of recent) {
      summaries.push(await this.summarizeSession(sid));
    }
    return summaries;
  }

  async summarizeSession(sessionId: string): Promise<SessionSummary> {
    if (!this.initialized) await this.initialize();

    const entries = this.entries.filter(e => e.sessionId === sessionId);

    if (entries.length === 0) {
      return {
        sessionId,
        startTime: 0,
        endTime: 0,
        messageCount: 0,
        domains: [],
        decisions: [],
        corrections: 0,
        satisfaction: 'unknown',
        summary: 'Empty session.',
      };
    }

    const timestamps = entries.map(e => e.timestamp);
    const allDomains = [...new Set(entries.flatMap(e => e.context.domains))];
    const allDecisions = [...new Set(
      entries.flatMap(e => e.context.activeDecisions ?? []),
    )];
    const corrections = entries.filter(e => e.type === 'correction').length;
    const messageCount = entries.filter(e => e.type === 'message').length;

    // Satisfaction from context satisfaction scores
    const scores = entries
      .map(e => e.context.satisfaction)
      .filter((s): s is number => s != null);
    let satisfaction: SessionSummary['satisfaction'] = 'unknown';
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      satisfaction = avg > 0.6 ? 'positive' : avg < 0.4 ? 'negative' : 'neutral';
    }

    // Template-generated summary
    const domainList = allDomains.slice(0, 3).join(', ');
    const summary = messageCount === 0
      ? 'No messages exchanged.'
      : allDomains.length <= 1
        ? `Session with ${messageCount} messages in ${domainList || 'general'}.`
        : `Session with ${messageCount} messages across ${domainList}.`;

    return {
      sessionId,
      startTime: Math.min(...timestamps),
      endTime: Math.max(...timestamps),
      messageCount,
      domains: allDomains,
      decisions: allDecisions,
      corrections,
      satisfaction,
      summary,
    };
  }

  private async persist(): Promise<void> {
    await this.vault.add(INDEX_KEY, JSON.stringify(this.entries));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/session-journal.test.ts`
Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add packages/consciousness/src/journal/session-journal.ts packages/consciousness/tests/session-journal.test.ts
git commit -m "feat(consciousness): implement SessionJournal with vault persistence"
```

---

### Task 4: Monitor Types

**Files:**
- Create: `packages/consciousness/src/monitor/monitor-types.ts`
- Create: `packages/consciousness/tests/monitor-types.test.ts`

**Step 1: Write the types test**

```typescript
// packages/consciousness/tests/monitor-types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  SystemPulse,
  SubsystemStatus,
  Anomaly,
  ReasoningMetrics,
  ResourceMetrics,
  CapabilityMetrics,
} from '../src/monitor/monitor-types.js';

describe('MonitorTypes', () => {
  it('SystemPulse satisfies healthy shape', () => {
    const pulse: SystemPulse = {
      timestamp: Date.now(),
      overall: 'healthy',
      subsystems: [
        { name: 'channels', status: 'up', lastCheck: Date.now() },
      ],
      anomalies: [],
      reasoning: {
        avgResponseQuality: 0.85,
        domainAccuracy: 0.92,
        preferenceStability: 0.95,
      },
      resources: {
        memoryUsageMb: 256,
        cpuPercent: 12,
        activeConnections: 3,
        uptimeSeconds: 7200,
      },
      capabilities: {
        totalCapabilities: 15,
        healthyCapabilities: 14,
        degradedCapabilities: ['email-channel'],
      },
    };
    expect(pulse.overall).toBe('healthy');
    expect(pulse.anomalies).toHaveLength(0);
  });

  it('Anomaly satisfies shape', () => {
    const anomaly: Anomaly = {
      subsystem: 'providers',
      severity: 'high',
      description: 'Primary provider returning 503',
      detectedAt: Date.now(),
    };
    expect(anomaly.severity).toBe('high');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/monitor-types.test.ts`
Expected: FAIL — cannot resolve `monitor-types.js`

**Step 3: Write the types**

```typescript
// packages/consciousness/src/monitor/monitor-types.ts

export interface SubsystemStatus {
  name: string;
  status: 'up' | 'degraded' | 'down';
  lastCheck: number;
  metrics?: Record<string, number>;
}

export interface Anomaly {
  subsystem: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
}

export interface ReasoningMetrics {
  avgResponseQuality: number;
  domainAccuracy: number;
  preferenceStability: number;
}

export interface ResourceMetrics {
  memoryUsageMb: number;
  cpuPercent: number;
  activeConnections: number;
  uptimeSeconds: number;
}

export interface CapabilityMetrics {
  totalCapabilities: number;
  healthyCapabilities: number;
  degradedCapabilities: string[];
}

export interface SystemPulse {
  timestamp: number;
  overall: 'healthy' | 'degraded' | 'critical';
  subsystems: SubsystemStatus[];
  anomalies: Anomaly[];
  reasoning: ReasoningMetrics;
  resources: ResourceMetrics;
  capabilities: CapabilityMetrics;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/monitor-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/consciousness/src/monitor/ packages/consciousness/tests/monitor-types.test.ts
git commit -m "feat(consciousness): add monitor types (SystemPulse, Anomaly)"
```

---

### Task 5: Signal Synthesizer

**Files:**
- Create: `packages/consciousness/src/monitor/signal-synthesizer.ts`
- Create: `packages/consciousness/tests/signal-synthesizer.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/consciousness/tests/signal-synthesizer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalSynthesizer } from '../src/monitor/signal-synthesizer.js';
import type { SystemPulse } from '../src/monitor/monitor-types.js';

function createMockDeps() {
  return {
    healthMonitor: {
      getHealthState: vi.fn().mockReturnValue({
        overall: 'healthy',
        subsystems: [
          { name: 'channels', status: 'healthy', lastCheck: new Date().toISOString() },
          { name: 'providers', status: 'healthy', lastCheck: new Date().toISOString() },
        ],
        issues: [],
        lastCheck: new Date().toISOString(),
      }),
    },
    feedbackStore: {
      getInsights: vi.fn().mockReturnValue({
        suggestedAdjustments: {},
        weakDomains: [],
        trend: 'stable',
        totalFeedback: 10,
      }),
      getForDomain: vi.fn().mockReturnValue([]),
      getRecentTrend: vi.fn().mockReturnValue('stable'),
    },
    correctionStore: {
      getStats: vi.fn().mockReturnValue({
        totalCorrections: 5,
        topMisclassifications: [],
        correctionRate: {},
      }),
    },
    preferenceHistory: {
      detectConflicts: vi.fn().mockReturnValue([]),
    },
    getResourceMetrics: vi.fn().mockReturnValue({
      memoryUsageMb: 256,
      cpuPercent: 15,
      activeConnections: 2,
      uptimeSeconds: 3600,
    }),
    getCapabilityMetrics: vi.fn().mockReturnValue({
      totalCapabilities: 10,
      healthyCapabilities: 10,
      degradedCapabilities: [],
    }),
  };
}

type MockDeps = ReturnType<typeof createMockDeps>;

describe('SignalSynthesizer', () => {
  let deps: MockDeps;
  let synthesizer: SignalSynthesizer;

  beforeEach(() => {
    deps = createMockDeps();
    synthesizer = new SignalSynthesizer(deps as any);
  });

  it('produces a SystemPulse with correct structure', () => {
    const pulse = synthesizer.synthesize();
    expect(pulse.timestamp).toBeGreaterThan(0);
    expect(pulse.overall).toBe('healthy');
    expect(pulse.subsystems).toBeInstanceOf(Array);
    expect(pulse.anomalies).toBeInstanceOf(Array);
    expect(pulse.reasoning).toBeDefined();
    expect(pulse.resources).toBeDefined();
    expect(pulse.capabilities).toBeDefined();
  });

  it('maps healthy HealthState to healthy overall', () => {
    const pulse = synthesizer.synthesize();
    expect(pulse.overall).toBe('healthy');
  });

  it('maps degraded HealthState to degraded overall', () => {
    deps.healthMonitor.getHealthState.mockReturnValue({
      overall: 'degraded',
      subsystems: [{ name: 'providers', status: 'degraded', lastCheck: new Date().toISOString() }],
      issues: [{ id: 'i-1', subsystem: 'providers', severity: 'warning', description: 'Slow', detectedAt: new Date().toISOString(), autoFixable: false }],
      lastCheck: new Date().toISOString(),
    });
    const pulse = synthesizer.synthesize();
    expect(pulse.overall).toBe('degraded');
  });

  it('maps unhealthy HealthState to critical overall', () => {
    deps.healthMonitor.getHealthState.mockReturnValue({
      overall: 'unhealthy',
      subsystems: [],
      issues: [],
      lastCheck: new Date().toISOString(),
    });
    const pulse = synthesizer.synthesize();
    expect(pulse.overall).toBe('critical');
  });

  it('converts HealthState subsystems to SubsystemStatus', () => {
    const pulse = synthesizer.synthesize();
    expect(pulse.subsystems).toHaveLength(2);
    expect(pulse.subsystems[0].name).toBe('channels');
    expect(pulse.subsystems[0].status).toBe('up');
  });

  it('generates anomalies from health issues', () => {
    deps.healthMonitor.getHealthState.mockReturnValue({
      overall: 'degraded',
      subsystems: [],
      issues: [
        { id: 'i-1', subsystem: 'channels', severity: 'warning', description: 'Channel down', detectedAt: new Date().toISOString(), autoFixable: true },
        { id: 'i-2', subsystem: 'providers', severity: 'critical', description: 'All down', detectedAt: new Date().toISOString(), autoFixable: false },
      ],
      lastCheck: new Date().toISOString(),
    });
    const pulse = synthesizer.synthesize();
    expect(pulse.anomalies).toHaveLength(2);
    expect(pulse.anomalies[0].severity).toBe('low');   // warning → low
    expect(pulse.anomalies[1].severity).toBe('high');  // critical → high
  });

  it('computes reasoning metrics from stores', () => {
    deps.feedbackStore.getInsights.mockReturnValue({
      suggestedAdjustments: {},
      weakDomains: ['debugging'],
      trend: 'improving',
      totalFeedback: 20,
    });
    deps.correctionStore.getStats.mockReturnValue({
      totalCorrections: 2,
      topMisclassifications: [],
      correctionRate: { security_review: 0.1 },
    });
    const pulse = synthesizer.synthesize();
    expect(pulse.reasoning.avgResponseQuality).toBeGreaterThanOrEqual(0);
    expect(pulse.reasoning.avgResponseQuality).toBeLessThanOrEqual(1);
    expect(pulse.reasoning.domainAccuracy).toBeGreaterThanOrEqual(0);
  });

  it('includes resource metrics from callback', () => {
    deps.getResourceMetrics.mockReturnValue({
      memoryUsageMb: 512,
      cpuPercent: 80,
      activeConnections: 5,
      uptimeSeconds: 7200,
    });
    const pulse = synthesizer.synthesize();
    expect(pulse.resources.memoryUsageMb).toBe(512);
    expect(pulse.resources.cpuPercent).toBe(80);
  });

  it('includes capability metrics from callback', () => {
    deps.getCapabilityMetrics.mockReturnValue({
      totalCapabilities: 12,
      healthyCapabilities: 10,
      degradedCapabilities: ['smtp', 'slack'],
    });
    const pulse = synthesizer.synthesize();
    expect(pulse.capabilities.totalCapabilities).toBe(12);
    expect(pulse.capabilities.degradedCapabilities).toEqual(['smtp', 'slack']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/signal-synthesizer.test.ts`
Expected: FAIL — cannot resolve `signal-synthesizer.js`

**Step 3: Write the implementation**

```typescript
// packages/consciousness/src/monitor/signal-synthesizer.ts
import type {
  SystemPulse,
  SubsystemStatus,
  Anomaly,
  ReasoningMetrics,
  ResourceMetrics,
  CapabilityMetrics,
} from './monitor-types.js';

export interface HealthMonitorLike {
  getHealthState(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    subsystems: Array<{ name: string; status: string; lastCheck: string; details?: string }>;
    issues: Array<{
      id: string; subsystem: string; severity: 'warning' | 'critical';
      description: string; detectedAt: string; autoFixable: boolean;
    }>;
    lastCheck: string;
  };
}

export interface FeedbackStoreLike {
  getInsights(): {
    suggestedAdjustments: Record<string, number>;
    weakDomains: string[];
    trend: 'improving' | 'declining' | 'stable';
    totalFeedback: number;
  };
}

export interface CorrectionStoreLike {
  getStats(): {
    totalCorrections: number;
    topMisclassifications: Array<{ from: string; to: string; count: number }>;
    correctionRate: Record<string, number>;
  };
}

export interface PreferenceHistoryLike {
  detectConflicts(): unknown[];
}

export interface SignalSynthesizerDeps {
  healthMonitor: HealthMonitorLike;
  feedbackStore: FeedbackStoreLike;
  correctionStore: CorrectionStoreLike;
  preferenceHistory: PreferenceHistoryLike;
  getResourceMetrics: () => ResourceMetrics;
  getCapabilityMetrics: () => CapabilityMetrics;
}

export class SignalSynthesizer {
  private deps: SignalSynthesizerDeps;

  constructor(deps: SignalSynthesizerDeps) {
    this.deps = deps;
  }

  synthesize(): SystemPulse {
    const healthState = this.deps.healthMonitor.getHealthState();

    return {
      timestamp: Date.now(),
      overall: this.mapOverall(healthState.overall),
      subsystems: this.mapSubsystems(healthState.subsystems),
      anomalies: this.mapAnomalies(healthState.issues),
      reasoning: this.computeReasoningMetrics(),
      resources: this.deps.getResourceMetrics(),
      capabilities: this.deps.getCapabilityMetrics(),
    };
  }

  private mapOverall(status: 'healthy' | 'degraded' | 'unhealthy'): SystemPulse['overall'] {
    if (status === 'unhealthy') return 'critical';
    return status;
  }

  private mapSubsystems(
    subsystems: Array<{ name: string; status: string; lastCheck: string }>,
  ): SubsystemStatus[] {
    return subsystems.map(s => ({
      name: s.name,
      status: this.mapSubsystemStatus(s.status),
      lastCheck: new Date(s.lastCheck).getTime(),
    }));
  }

  private mapSubsystemStatus(status: string): SubsystemStatus['status'] {
    if (status === 'healthy') return 'up';
    if (status === 'degraded') return 'degraded';
    return 'down';
  }

  private mapAnomalies(
    issues: Array<{ subsystem: string; severity: 'warning' | 'critical'; description: string; detectedAt: string }>,
  ): Anomaly[] {
    return issues.map(i => ({
      subsystem: i.subsystem,
      severity: i.severity === 'warning' ? 'low' : 'high',
      description: i.description,
      detectedAt: new Date(i.detectedAt).getTime(),
    }));
  }

  private computeReasoningMetrics(): ReasoningMetrics {
    const feedback = this.deps.feedbackStore.getInsights();
    const corrections = this.deps.correctionStore.getStats();
    const conflicts = this.deps.preferenceHistory.detectConflicts();

    // Response quality: based on feedback trend + total feedback
    // Simple heuristic: improving=0.85, stable=0.7, declining=0.5
    const trendScore = feedback.trend === 'improving' ? 0.85
      : feedback.trend === 'stable' ? 0.7 : 0.5;
    const avgResponseQuality = feedback.totalFeedback > 0 ? trendScore : 0.5;

    // Domain accuracy: 1 - (correction rate across all domains)
    const rates = Object.values(corrections.correctionRate);
    const avgCorrectionRate = rates.length > 0
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : 0;
    const domainAccuracy = Math.max(0, Math.min(1, 1 - avgCorrectionRate));

    // Preference stability: 1 if no conflicts, decreasing with conflicts
    const preferenceStability = Math.max(0, 1 - conflicts.length * 0.15);

    return { avgResponseQuality, domainAccuracy, preferenceStability };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/signal-synthesizer.test.ts`
Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add packages/consciousness/src/monitor/signal-synthesizer.ts packages/consciousness/tests/signal-synthesizer.test.ts
git commit -m "feat(consciousness): implement SignalSynthesizer"
```

---

### Task 6: Self-Monitor

**Files:**
- Create: `packages/consciousness/src/monitor/self-monitor.ts`
- Create: `packages/consciousness/tests/self-monitor.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/consciousness/tests/self-monitor.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SelfMonitor } from '../src/monitor/self-monitor.js';
import type { SystemPulse } from '../src/monitor/monitor-types.js';

function createHealthyPulse(): SystemPulse {
  return {
    timestamp: Date.now(),
    overall: 'healthy',
    subsystems: [{ name: 'channels', status: 'up', lastCheck: Date.now() }],
    anomalies: [],
    reasoning: { avgResponseQuality: 0.8, domainAccuracy: 0.9, preferenceStability: 0.95 },
    resources: { memoryUsageMb: 256, cpuPercent: 10, activeConnections: 2, uptimeSeconds: 3600 },
    capabilities: { totalCapabilities: 10, healthyCapabilities: 10, degradedCapabilities: [] },
  };
}

function createDegradedPulse(): SystemPulse {
  return {
    ...createHealthyPulse(),
    overall: 'degraded',
    anomalies: [{ subsystem: 'providers', severity: 'high', description: 'Provider down', detectedAt: Date.now() }],
  };
}

describe('SelfMonitor', () => {
  let mockSynthesizer: { synthesize: ReturnType<typeof vi.fn> };
  let monitor: SelfMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSynthesizer = { synthesize: vi.fn().mockReturnValue(createHealthyPulse()) };
    monitor = new SelfMonitor(mockSynthesizer as any, { intervalMs: 1000 });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  it('getPulse returns latest synthesized pulse', () => {
    monitor.start();
    const pulse = monitor.getPulse();
    expect(pulse.overall).toBe('healthy');
    expect(mockSynthesizer.synthesize).toHaveBeenCalledTimes(1);
  });

  it('updates pulse on each tick', () => {
    monitor.start();
    expect(mockSynthesizer.synthesize).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(mockSynthesizer.synthesize).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(mockSynthesizer.synthesize).toHaveBeenCalledTimes(3);
  });

  it('stop() prevents further ticks', () => {
    monitor.start();
    monitor.stop();
    vi.advanceTimersByTime(5000);
    // Only the initial tick on start()
    expect(mockSynthesizer.synthesize).toHaveBeenCalledTimes(1);
  });

  it('emits anomaly when new anomaly appears', () => {
    const handler = vi.fn();
    monitor.onAnomaly(handler);
    monitor.start();

    // First tick is healthy — no anomaly
    expect(handler).not.toHaveBeenCalled();

    // Next tick has anomaly
    mockSynthesizer.synthesize.mockReturnValue(createDegradedPulse());
    vi.advanceTimersByTime(1000);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ subsystem: 'providers', severity: 'high' }),
    );
  });

  it('does not re-emit the same anomaly on consecutive ticks', () => {
    const handler = vi.fn();
    monitor.onAnomaly(handler);
    monitor.start();

    // Switch to degraded
    const degraded = createDegradedPulse();
    mockSynthesizer.synthesize.mockReturnValue(degraded);
    vi.advanceTimersByTime(1000);
    expect(handler).toHaveBeenCalledTimes(1);

    // Same anomaly on next tick — no re-emit
    vi.advanceTimersByTime(1000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('getPulse returns initial empty pulse before start', () => {
    const pulse = monitor.getPulse();
    expect(pulse.overall).toBe('healthy');
    expect(pulse.subsystems).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/self-monitor.test.ts`
Expected: FAIL — cannot resolve `self-monitor.js`

**Step 3: Write the implementation**

```typescript
// packages/consciousness/src/monitor/self-monitor.ts
import type { SystemPulse, Anomaly } from './monitor-types.js';
import type { SignalSynthesizer } from './signal-synthesizer.js';

export interface SelfMonitorOptions {
  intervalMs?: number;
}

const EMPTY_PULSE: SystemPulse = {
  timestamp: 0,
  overall: 'healthy',
  subsystems: [],
  anomalies: [],
  reasoning: { avgResponseQuality: 0, domainAccuracy: 0, preferenceStability: 0 },
  resources: { memoryUsageMb: 0, cpuPercent: 0, activeConnections: 0, uptimeSeconds: 0 },
  capabilities: { totalCapabilities: 0, healthyCapabilities: 0, degradedCapabilities: [] },
};

export class SelfMonitor {
  private synthesizer: SignalSynthesizer;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private latestPulse: SystemPulse = { ...EMPTY_PULSE };
  private previousAnomalyKeys = new Set<string>();
  private anomalyHandlers: Array<(anomaly: Anomaly) => void> = [];

  constructor(synthesizer: SignalSynthesizer, options?: SelfMonitorOptions) {
    this.synthesizer = synthesizer;
    this.intervalMs = options?.intervalMs ?? 30_000;
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getPulse(): SystemPulse {
    return this.latestPulse;
  }

  onAnomaly(handler: (anomaly: Anomaly) => void): void {
    this.anomalyHandlers.push(handler);
  }

  private tick(): void {
    this.latestPulse = this.synthesizer.synthesize();
    this.detectNewAnomalies();
  }

  private detectNewAnomalies(): void {
    const currentKeys = new Set<string>();

    for (const anomaly of this.latestPulse.anomalies) {
      const key = `${anomaly.subsystem}:${anomaly.description}`;
      currentKeys.add(key);

      if (!this.previousAnomalyKeys.has(key)) {
        for (const handler of this.anomalyHandlers) {
          handler(anomaly);
        }
      }
    }

    this.previousAnomalyKeys = currentKeys;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/self-monitor.test.ts`
Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add packages/consciousness/src/monitor/self-monitor.ts packages/consciousness/tests/self-monitor.test.ts
git commit -m "feat(consciousness): implement SelfMonitor with anomaly detection"
```

---

### Task 7: Repair Types

**Files:**
- Create: `packages/consciousness/src/repair/repair-types.ts`
- Create: `packages/consciousness/tests/repair-types.test.ts`

**Step 1: Write the types test**

```typescript
// packages/consciousness/tests/repair-types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  Diagnosis,
  RepairAction,
  RepairLog,
  RepairTier,
} from '../src/repair/repair-types.js';

describe('RepairTypes', () => {
  it('Diagnosis satisfies shape', () => {
    const diagnosis: Diagnosis = {
      id: 'diag-1',
      timestamp: Date.now(),
      anomaly: { subsystem: 'providers', severity: 'high', description: 'Down', detectedAt: Date.now() },
      rootCause: 'Provider API key expired',
      confidence: 0.85,
      suggestedActions: [],
    };
    expect(diagnosis.confidence).toBe(0.85);
  });

  it('RepairAction satisfies shape', () => {
    const action: RepairAction = {
      id: 'action-1',
      tier: 'notify',
      description: 'Disable degraded provider',
      command: 'disableProvider',
      rollback: 'enableProvider',
      estimatedImpact: 'Provider will be unavailable until re-enabled',
    };
    expect(action.tier).toBe('notify');
  });

  it('RepairLog satisfies shape', () => {
    const log: RepairLog = {
      actionId: 'action-1',
      diagnosisId: 'diag-1',
      tier: 'auto',
      status: 'executed',
      executedAt: Date.now(),
      result: 'Cache cleared successfully',
    };
    expect(log.status).toBe('executed');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/repair-types.test.ts`
Expected: FAIL

**Step 3: Write the types**

```typescript
// packages/consciousness/src/repair/repair-types.ts
import type { Anomaly } from '../monitor/monitor-types.js';

export type RepairTier = 'auto' | 'notify' | 'approve';

export interface Diagnosis {
  id: string;
  timestamp: number;
  anomaly: Anomaly;
  rootCause: string;
  confidence: number;
  suggestedActions: RepairAction[];
}

export interface RepairAction {
  id: string;
  tier: RepairTier;
  description: string;
  command: string;
  rollback?: string;
  estimatedImpact: string;
}

export interface RepairLog {
  actionId: string;
  diagnosisId: string;
  tier: RepairTier;
  status: 'executed' | 'approved' | 'rejected' | 'failed' | 'rolled_back';
  executedAt: number;
  result?: string;
  error?: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/repair-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/consciousness/src/repair/ packages/consciousness/tests/repair-types.test.ts
git commit -m "feat(consciousness): add repair types (Diagnosis, RepairAction, RepairLog)"
```

---

### Task 8: Self-Repair Engine

**Files:**
- Create: `packages/consciousness/src/repair/repair-actions.ts`
- Create: `packages/consciousness/src/repair/self-repair-engine.ts`
- Create: `packages/consciousness/tests/self-repair-engine.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/consciousness/tests/self-repair-engine.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelfRepairEngine } from '../src/repair/self-repair-engine.js';
import type { Anomaly } from '../src/monitor/monitor-types.js';
import type { Diagnosis, RepairAction, RepairLog } from '../src/repair/repair-types.js';

function createMockDeps() {
  const store = new Map<string, string>();
  return {
    vault: {
      add: vi.fn(async (name: string, value: string) => { store.set(name, value); }),
      get: vi.fn((name: string) => store.get(name)),
      has: vi.fn((name: string) => store.has(name)),
      list: vi.fn(() => [...store.keys()]),
      remove: vi.fn(async (name: string) => store.delete(name)),
    },
    onNotify: vi.fn(),
    onApprovalRequest: vi.fn(async () => true),
    actionExecutor: vi.fn(async () => 'success'),
  };
}

type MockDeps = ReturnType<typeof createMockDeps>;

const providerAnomaly: Anomaly = {
  subsystem: 'providers',
  severity: 'high',
  description: 'Primary provider returning 503',
  detectedAt: Date.now(),
};

const cacheAnomaly: Anomaly = {
  subsystem: 'cache',
  severity: 'low',
  description: 'Stale cache entries detected',
  detectedAt: Date.now(),
};

describe('SelfRepairEngine', () => {
  let deps: MockDeps;
  let engine: SelfRepairEngine;

  beforeEach(() => {
    deps = createMockDeps();
    engine = new SelfRepairEngine(deps as any);
  });

  describe('diagnose', () => {
    it('returns a Diagnosis for known anomaly patterns', async () => {
      const diagnosis = await engine.diagnose(providerAnomaly);
      expect(diagnosis.id).toBeTruthy();
      expect(diagnosis.anomaly).toBe(providerAnomaly);
      expect(diagnosis.rootCause).toBeTruthy();
      expect(diagnosis.suggestedActions.length).toBeGreaterThanOrEqual(1);
    });

    it('returns a generic diagnosis for unknown anomalies', async () => {
      const unknown: Anomaly = {
        subsystem: 'unknown-system',
        severity: 'medium',
        description: 'Something weird happened',
        detectedAt: Date.now(),
      };
      const diagnosis = await engine.diagnose(unknown);
      expect(diagnosis.confidence).toBeLessThan(0.5);
      expect(diagnosis.suggestedActions).toHaveLength(0);
    });
  });

  describe('executeAction — auto tier', () => {
    it('executes immediately and logs result', async () => {
      const action: RepairAction = {
        id: 'act-1',
        tier: 'auto',
        description: 'Clear stale cache',
        command: 'clearCache',
        estimatedImpact: 'Cache rebuilt from scratch',
      };
      const log = await engine.executeAction(action, 'diag-1');
      expect(log.status).toBe('executed');
      expect(log.actionId).toBe('act-1');
      expect(log.diagnosisId).toBe('diag-1');
      expect(deps.actionExecutor).toHaveBeenCalledWith('clearCache');
    });
  });

  describe('executeAction — notify tier', () => {
    it('executes and calls onNotify', async () => {
      const action: RepairAction = {
        id: 'act-2',
        tier: 'notify',
        description: 'Disable degraded provider',
        command: 'disableProvider',
        estimatedImpact: 'Provider unavailable',
      };
      const diag: Diagnosis = {
        id: 'diag-2',
        timestamp: Date.now(),
        anomaly: providerAnomaly,
        rootCause: 'Provider overloaded',
        confidence: 0.8,
        suggestedActions: [action],
      };
      const log = await engine.executeAction(action, diag.id);
      expect(log.status).toBe('executed');
      expect(deps.onNotify).toHaveBeenCalledWith(expect.anything(), action);
    });
  });

  describe('executeAction — approve tier', () => {
    it('requests approval before executing', async () => {
      const action: RepairAction = {
        id: 'act-3',
        tier: 'approve',
        description: 'Rotate API credentials',
        command: 'rotateCredentials',
        estimatedImpact: 'All sessions reset',
      };
      const log = await engine.executeAction(action, 'diag-3');
      expect(deps.onApprovalRequest).toHaveBeenCalled();
      expect(log.status).toBe('approved');
      expect(deps.actionExecutor).toHaveBeenCalledWith('rotateCredentials');
    });

    it('rejects when approval denied', async () => {
      deps.onApprovalRequest.mockResolvedValue(false);
      const action: RepairAction = {
        id: 'act-4',
        tier: 'approve',
        description: 'Modify source code',
        command: 'patchSource',
        estimatedImpact: 'Code changed',
      };
      const log = await engine.executeAction(action, 'diag-4');
      expect(log.status).toBe('rejected');
      expect(deps.actionExecutor).not.toHaveBeenCalled();
    });
  });

  describe('executeAction — failure handling', () => {
    it('logs failure when executor throws', async () => {
      deps.actionExecutor.mockRejectedValue(new Error('Boom'));
      const action: RepairAction = {
        id: 'act-5',
        tier: 'auto',
        description: 'Clear cache',
        command: 'clearCache',
        estimatedImpact: 'Cache cleared',
      };
      const log = await engine.executeAction(action, 'diag-5');
      expect(log.status).toBe('failed');
      expect(log.error).toBe('Boom');
    });
  });

  describe('getRepairHistory', () => {
    it('returns logs from executed actions', async () => {
      const action: RepairAction = {
        id: 'act-h1',
        tier: 'auto',
        description: 'Test',
        command: 'test',
        estimatedImpact: 'None',
      };
      await engine.executeAction(action, 'diag-h1');
      await engine.executeAction({ ...action, id: 'act-h2' }, 'diag-h2');

      const history = engine.getRepairHistory();
      expect(history).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await engine.executeAction({
          id: `act-${i}`, tier: 'auto', description: 'Test',
          command: 'test', estimatedImpact: 'None',
        }, `diag-${i}`);
      }
      const history = engine.getRepairHistory(3);
      expect(history).toHaveLength(3);
    });
  });

  describe('persistence', () => {
    it('persists repair log to vault', async () => {
      const action: RepairAction = {
        id: 'act-p1',
        tier: 'auto',
        description: 'Test',
        command: 'test',
        estimatedImpact: 'None',
      };
      await engine.executeAction(action, 'diag-p1');
      expect(deps.vault.add).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/self-repair-engine.test.ts`
Expected: FAIL

**Step 3: Write repair-actions.ts (known repair patterns)**

```typescript
// packages/consciousness/src/repair/repair-actions.ts
import type { Anomaly } from '../monitor/monitor-types.js';
import type { RepairAction } from './repair-types.js';
import { randomUUID } from 'node:crypto';

export interface RepairPattern {
  match: (anomaly: Anomaly) => boolean;
  rootCause: string;
  confidence: number;
  actions: () => RepairAction[];
}

export const BUILT_IN_PATTERNS: RepairPattern[] = [
  {
    match: (a) => a.subsystem === 'providers' && a.severity === 'high',
    rootCause: 'Provider API is unavailable or returning errors',
    confidence: 0.8,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'notify',
        description: 'Disable degraded provider and failover to backup',
        command: 'switchToFallbackProvider',
        rollback: 'enablePrimaryProvider',
        estimatedImpact: 'Primary provider unavailable until re-enabled',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'providers' && a.description.toLowerCase().includes('all down'),
    rootCause: 'All providers are down — possible credential issue',
    confidence: 0.6,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'approve',
        description: 'Attempt credential rotation for all providers',
        command: 'rotateCredentials',
        estimatedImpact: 'All active sessions may be interrupted',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'cache' || a.description.toLowerCase().includes('stale'),
    rootCause: 'Stale data in cache',
    confidence: 0.9,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'auto',
        description: 'Clear stale cache entries',
        command: 'clearCache',
        estimatedImpact: 'Cache will be rebuilt on next access',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'channels',
    rootCause: 'Channel disconnected or unreachable',
    confidence: 0.75,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'auto',
        description: 'Attempt channel reconnection',
        command: 'reconnectChannel',
        rollback: undefined,
        estimatedImpact: 'Channel may be briefly unavailable during reconnection',
      },
    ],
  },
  {
    match: (a) => a.description.toLowerCase().includes('memory') && a.severity !== 'low',
    rootCause: 'High memory usage detected',
    confidence: 0.7,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'notify',
        description: 'Clear caches and suggest restart',
        command: 'clearAllCaches',
        estimatedImpact: 'All caches cleared, restart recommended if usage persists',
      },
    ],
  },
];
```

**Step 4: Write self-repair-engine.ts**

```typescript
// packages/consciousness/src/repair/self-repair-engine.ts
import { randomUUID } from 'node:crypto';
import type { Anomaly } from '../monitor/monitor-types.js';
import type { Diagnosis, RepairAction, RepairLog } from './repair-types.js';
import { BUILT_IN_PATTERNS } from './repair-actions.js';
import type { VaultLike } from '../journal/session-journal.js';

const REPAIR_LOG_KEY = 'consciousness:repair:log';

export interface SelfRepairEngineDeps {
  vault: VaultLike;
  onNotify: (diagnosis: Diagnosis | null, action: RepairAction) => void;
  onApprovalRequest: (diagnosis: Diagnosis | null, action: RepairAction) => Promise<boolean>;
  actionExecutor: (command: string) => Promise<string>;
}

export class SelfRepairEngine {
  private deps: SelfRepairEngineDeps;
  private logs: RepairLog[] = [];
  private diagnoses = new Map<string, Diagnosis>();

  constructor(deps: SelfRepairEngineDeps) {
    this.deps = deps;
  }

  async diagnose(anomaly: Anomaly): Promise<Diagnosis> {
    for (const pattern of BUILT_IN_PATTERNS) {
      if (pattern.match(anomaly)) {
        const diagnosis: Diagnosis = {
          id: randomUUID(),
          timestamp: Date.now(),
          anomaly,
          rootCause: pattern.rootCause,
          confidence: pattern.confidence,
          suggestedActions: pattern.actions(),
        };
        this.diagnoses.set(diagnosis.id, diagnosis);
        return diagnosis;
      }
    }

    // Unknown anomaly — generic low-confidence diagnosis
    const diagnosis: Diagnosis = {
      id: randomUUID(),
      timestamp: Date.now(),
      anomaly,
      rootCause: `Unknown issue in ${anomaly.subsystem}: ${anomaly.description}`,
      confidence: 0.2,
      suggestedActions: [],
    };
    this.diagnoses.set(diagnosis.id, diagnosis);
    return diagnosis;
  }

  async executeAction(action: RepairAction, diagnosisId: string): Promise<RepairLog> {
    const diagnosis = this.diagnoses.get(diagnosisId) ?? null;

    if (action.tier === 'approve') {
      const approved = await this.deps.onApprovalRequest(diagnosis, action);
      if (!approved) {
        const log: RepairLog = {
          actionId: action.id,
          diagnosisId,
          tier: action.tier,
          status: 'rejected',
          executedAt: Date.now(),
        };
        this.logs.push(log);
        await this.persistLogs();
        return log;
      }
    }

    try {
      const result = await this.deps.actionExecutor(action.command);
      const status = action.tier === 'approve' ? 'approved' : 'executed';
      const log: RepairLog = {
        actionId: action.id,
        diagnosisId,
        tier: action.tier,
        status,
        executedAt: Date.now(),
        result,
      };
      this.logs.push(log);

      if (action.tier === 'notify') {
        this.deps.onNotify(diagnosis, action);
      }

      await this.persistLogs();
      return log;
    } catch (err) {
      const log: RepairLog = {
        actionId: action.id,
        diagnosisId,
        tier: action.tier,
        status: 'failed',
        executedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      };
      this.logs.push(log);
      await this.persistLogs();
      return log;
    }
  }

  getRepairHistory(limit?: number): RepairLog[] {
    if (limit && limit > 0) {
      return this.logs.slice(-limit);
    }
    return [...this.logs];
  }

  getPendingApprovals(): Array<{ diagnosis: Diagnosis; action: RepairAction }> {
    const pending: Array<{ diagnosis: Diagnosis; action: RepairAction }> = [];
    for (const [, diagnosis] of this.diagnoses) {
      for (const action of diagnosis.suggestedActions) {
        if (action.tier === 'approve') {
          const executed = this.logs.some(l => l.actionId === action.id);
          if (!executed) {
            pending.push({ diagnosis, action });
          }
        }
      }
    }
    return pending;
  }

  private async persistLogs(): Promise<void> {
    await this.deps.vault.add(REPAIR_LOG_KEY, JSON.stringify(this.logs)).catch(() => {});
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/self-repair-engine.test.ts`
Expected: PASS — all tests green.

**Step 6: Commit**

```bash
git add packages/consciousness/src/repair/ packages/consciousness/tests/self-repair-engine.test.ts
git commit -m "feat(consciousness): implement SelfRepairEngine with tiered autonomy"
```

---

### Task 9: Model Types

**Files:**
- Create: `packages/consciousness/src/model/model-types.ts`
- Create: `packages/consciousness/tests/model-types.test.ts`

**Step 1: Write the types test**

```typescript
// packages/consciousness/tests/model-types.test.ts
import { describe, it, expect } from 'vitest';
import type { SelfModelSnapshot, IdentityInfo, MemoryInfo, PerformanceInfo, RepairInfo } from '../src/model/model-types.js';

describe('ModelTypes', () => {
  it('SelfModelSnapshot satisfies shape', () => {
    const snapshot: SelfModelSnapshot = {
      generatedAt: Date.now(),
      identity: {
        name: 'Auxiora',
        version: '1.4.0',
        personality: 'The Architect',
        uptime: 7200,
      },
      memory: {
        totalSessions: 42,
        totalMessages: 500,
        oldestMemory: 1000000,
        recentTopics: ['security', 'architecture'],
        activeDecisions: 3,
        pendingFollowUps: 1,
      },
      health: {
        timestamp: Date.now(),
        overall: 'healthy',
        subsystems: [],
        anomalies: [],
        reasoning: { avgResponseQuality: 0.8, domainAccuracy: 0.9, preferenceStability: 0.95 },
        resources: { memoryUsageMb: 256, cpuPercent: 10, activeConnections: 2, uptimeSeconds: 7200 },
        capabilities: { totalCapabilities: 10, healthyCapabilities: 10, degradedCapabilities: [] },
      },
      performance: {
        responseQuality: 0.8,
        domainAccuracy: 0.9,
        userSatisfaction: 'improving',
        strongDomains: ['code_engineering'],
        weakDomains: ['marketing_content'],
      },
      repair: {
        recentActions: 2,
        pendingApprovals: 0,
        lastRepairAt: Date.now() - 3600000,
      },
      selfNarrative: 'I am Auxiora v1.4.0.',
    };
    expect(snapshot.identity.name).toBe('Auxiora');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/model-types.test.ts`
Expected: FAIL

**Step 3: Write the types**

```typescript
// packages/consciousness/src/model/model-types.ts
import type { SystemPulse } from '../monitor/monitor-types.js';

export interface IdentityInfo {
  name: string;
  version: string;
  personality: string;
  uptime: number;
}

export interface MemoryInfo {
  totalSessions: number;
  totalMessages: number;
  oldestMemory: number;
  recentTopics: string[];
  activeDecisions: number;
  pendingFollowUps: number;
}

export interface PerformanceInfo {
  responseQuality: number;
  domainAccuracy: number;
  userSatisfaction: 'improving' | 'stable' | 'declining';
  strongDomains: string[];
  weakDomains: string[];
}

export interface RepairInfo {
  recentActions: number;
  pendingApprovals: number;
  lastRepairAt: number | null;
}

export interface SelfModelSnapshot {
  generatedAt: number;
  identity: IdentityInfo;
  memory: MemoryInfo;
  health: SystemPulse;
  performance: PerformanceInfo;
  repair: RepairInfo;
  selfNarrative: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/model-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/consciousness/src/model/ packages/consciousness/tests/model-types.test.ts
git commit -m "feat(consciousness): add self-model types (SelfModelSnapshot)"
```

---

### Task 10: Self-Model

**Files:**
- Create: `packages/consciousness/src/model/self-model.ts`
- Create: `packages/consciousness/tests/self-model.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/consciousness/tests/self-model.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelfModel } from '../src/model/self-model.js';
import type { SystemPulse } from '../src/monitor/monitor-types.js';

function createHealthyPulse(): SystemPulse {
  return {
    timestamp: Date.now(),
    overall: 'healthy',
    subsystems: [],
    anomalies: [],
    reasoning: { avgResponseQuality: 0.8, domainAccuracy: 0.9, preferenceStability: 0.95 },
    resources: { memoryUsageMb: 256, cpuPercent: 10, activeConnections: 2, uptimeSeconds: 7200 },
    capabilities: { totalCapabilities: 10, healthyCapabilities: 10, degradedCapabilities: [] },
  };
}

function createMockDeps() {
  return {
    journal: {
      getRecentSessions: vi.fn(async () => [
        {
          sessionId: 's1',
          startTime: Date.now() - 86400000,
          endTime: Date.now() - 82800000,
          messageCount: 20,
          domains: ['code_engineering', 'debugging'],
          decisions: ['d1'],
          corrections: 1,
          satisfaction: 'positive' as const,
          summary: 'Worked on code.',
        },
        {
          sessionId: 's2',
          startTime: Date.now() - 3600000,
          endTime: Date.now(),
          messageCount: 10,
          domains: ['security_review'],
          decisions: [],
          corrections: 0,
          satisfaction: 'positive' as const,
          summary: 'Security audit.',
        },
      ]),
    },
    monitor: {
      getPulse: vi.fn(() => createHealthyPulse()),
    },
    repair: {
      getRepairHistory: vi.fn(() => [
        { actionId: 'a1', diagnosisId: 'd1', tier: 'auto', status: 'executed', executedAt: Date.now() - 1000 },
      ]),
      getPendingApprovals: vi.fn(() => []),
    },
    decisionLog: {
      query: vi.fn(() => [
        { id: 'd1', timestamp: Date.now(), domain: 'code_engineering', summary: 'Use TypeScript', context: '', status: 'active', tags: [] },
      ]),
      getDueFollowUps: vi.fn(() => []),
    },
    feedbackStore: {
      getInsights: vi.fn(() => ({
        suggestedAdjustments: {},
        weakDomains: ['marketing_content'],
        trend: 'improving',
        totalFeedback: 15,
      })),
      getForDomain: vi.fn(() => [
        { id: 'f1', timestamp: Date.now(), domain: 'code_engineering', rating: 'helpful', traitSnapshot: {} },
        { id: 'f2', timestamp: Date.now(), domain: 'code_engineering', rating: 'helpful', traitSnapshot: {} },
        { id: 'f3', timestamp: Date.now(), domain: 'code_engineering', rating: 'helpful', traitSnapshot: {} },
        { id: 'f4', timestamp: Date.now(), domain: 'code_engineering', rating: 'helpful', traitSnapshot: {} },
      ]),
    },
    version: '1.4.0',
  };
}

type MockDeps = ReturnType<typeof createMockDeps>;

describe('SelfModel', () => {
  let deps: MockDeps;
  let model: SelfModel;

  beforeEach(() => {
    deps = createMockDeps();
    model = new SelfModel(deps as any);
  });

  it('produces a SelfModelSnapshot with all sections', async () => {
    const snapshot = await model.synthesize();
    expect(snapshot.generatedAt).toBeGreaterThan(0);
    expect(snapshot.identity).toBeDefined();
    expect(snapshot.memory).toBeDefined();
    expect(snapshot.health).toBeDefined();
    expect(snapshot.performance).toBeDefined();
    expect(snapshot.repair).toBeDefined();
    expect(snapshot.selfNarrative).toBeTruthy();
  });

  describe('identity', () => {
    it('uses correct name and version', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.identity.name).toBe('Auxiora');
      expect(snapshot.identity.version).toBe('1.4.0');
      expect(snapshot.identity.personality).toBe('The Architect');
    });

    it('reads uptime from pulse resources', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.identity.uptime).toBe(7200);
    });
  });

  describe('memory', () => {
    it('aggregates session data', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.memory.totalSessions).toBe(2);
      expect(snapshot.memory.totalMessages).toBe(30); // 20 + 10
    });

    it('extracts recent topics from session domains', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.memory.recentTopics).toContain('code_engineering');
      expect(snapshot.memory.recentTopics).toContain('security_review');
    });

    it('counts active decisions', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.memory.activeDecisions).toBe(1);
    });
  });

  describe('health', () => {
    it('includes the current SystemPulse', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.health.overall).toBe('healthy');
    });
  });

  describe('performance', () => {
    it('maps feedback insights', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.performance.userSatisfaction).toBe('improving');
      expect(snapshot.performance.weakDomains).toContain('marketing_content');
    });
  });

  describe('repair', () => {
    it('counts recent repair actions', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.repair.recentActions).toBe(1);
      expect(snapshot.repair.pendingApprovals).toBe(0);
    });
  });

  describe('selfNarrative', () => {
    it('contains identity sentence', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.selfNarrative).toContain('Auxiora');
      expect(snapshot.selfNarrative).toContain('1.4.0');
    });

    it('contains memory sentence', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.selfNarrative).toContain('2 conversations');
    });

    it('contains health sentence', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.selfNarrative).toContain('healthy');
    });

    it('mentions improving satisfaction', async () => {
      const snapshot = await model.synthesize();
      expect(snapshot.selfNarrative).toContain('improving');
    });
  });

  describe('empty state', () => {
    it('handles no sessions gracefully', async () => {
      deps.journal.getRecentSessions.mockResolvedValue([]);
      deps.decisionLog.query.mockReturnValue([]);
      const snapshot = await model.synthesize();
      expect(snapshot.memory.totalSessions).toBe(0);
      expect(snapshot.memory.totalMessages).toBe(0);
      expect(snapshot.selfNarrative).toContain('Auxiora');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/self-model.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/consciousness/src/model/self-model.ts
import type {
  SelfModelSnapshot,
  IdentityInfo,
  MemoryInfo,
  PerformanceInfo,
  RepairInfo,
} from './model-types.js';
import type { SystemPulse } from '../monitor/monitor-types.js';
import type { SessionSummary } from '../journal/journal-types.js';

export interface SessionJournalLike {
  getRecentSessions(limit?: number): Promise<SessionSummary[]>;
}

export interface SelfMonitorLike {
  getPulse(): SystemPulse;
}

export interface SelfRepairEngineLike {
  getRepairHistory(limit?: number): Array<{ actionId: string; executedAt: number }>;
  getPendingApprovals(): unknown[];
}

export interface DecisionLogLike {
  query(q: { status?: string; limit?: number }): Array<{ id: string; status: string }>;
  getDueFollowUps(): unknown[];
}

export interface FeedbackStoreLike {
  getInsights(): {
    weakDomains: string[];
    trend: 'improving' | 'declining' | 'stable';
    totalFeedback: number;
  };
}

export interface SelfModelDeps {
  journal: SessionJournalLike;
  monitor: SelfMonitorLike;
  repair: SelfRepairEngineLike;
  decisionLog: DecisionLogLike;
  feedbackStore: FeedbackStoreLike;
  version: string;
}

export class SelfModel {
  private deps: SelfModelDeps;

  constructor(deps: SelfModelDeps) {
    this.deps = deps;
  }

  async synthesize(): Promise<SelfModelSnapshot> {
    const pulse = this.deps.monitor.getPulse();
    const sessions = await this.deps.journal.getRecentSessions(100);
    const activeDecisions = this.deps.decisionLog.query({ status: 'active', limit: 50 });
    const dueFollowUps = this.deps.decisionLog.getDueFollowUps();
    const feedback = this.deps.feedbackStore.getInsights();
    const repairHistory = this.deps.repair.getRepairHistory();
    const pendingApprovals = this.deps.repair.getPendingApprovals();

    const identity = this.buildIdentity(pulse);
    const memory = this.buildMemory(sessions, activeDecisions, dueFollowUps);
    const performance = this.buildPerformance(pulse, feedback);
    const repair = this.buildRepairInfo(repairHistory, pendingApprovals);

    const snapshot: SelfModelSnapshot = {
      generatedAt: Date.now(),
      identity,
      memory,
      health: pulse,
      performance,
      repair,
      selfNarrative: this.generateNarrative(identity, memory, pulse, performance, repair),
    };

    return snapshot;
  }

  private buildIdentity(pulse: SystemPulse): IdentityInfo {
    return {
      name: 'Auxiora',
      version: this.deps.version,
      personality: 'The Architect',
      uptime: pulse.resources.uptimeSeconds,
    };
  }

  private buildMemory(
    sessions: SessionSummary[],
    activeDecisions: Array<{ id: string }>,
    dueFollowUps: unknown[],
  ): MemoryInfo {
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
    const allDomains = [...new Set(sessions.flatMap(s => s.domains))];
    const timestamps = sessions.flatMap(s => [s.startTime, s.endTime]).filter(t => t > 0);

    return {
      totalSessions: sessions.length,
      totalMessages,
      oldestMemory: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      recentTopics: allDomains.slice(0, 5),
      activeDecisions: activeDecisions.length,
      pendingFollowUps: dueFollowUps.length,
    };
  }

  private buildPerformance(
    pulse: SystemPulse,
    feedback: { weakDomains: string[]; trend: 'improving' | 'declining' | 'stable' },
  ): PerformanceInfo {
    return {
      responseQuality: pulse.reasoning.avgResponseQuality,
      domainAccuracy: pulse.reasoning.domainAccuracy,
      userSatisfaction: feedback.trend,
      strongDomains: [], // Could be computed from feedback, kept simple for now
      weakDomains: feedback.weakDomains,
    };
  }

  private buildRepairInfo(
    history: Array<{ actionId: string; executedAt: number }>,
    pendingApprovals: unknown[],
  ): RepairInfo {
    const dayAgo = Date.now() - 86_400_000;
    const recentActions = history.filter(h => h.executedAt > dayAgo).length;
    const lastAction = history.length > 0 ? history[history.length - 1] : null;

    return {
      recentActions,
      pendingApprovals: pendingApprovals.length,
      lastRepairAt: lastAction?.executedAt ?? null,
    };
  }

  private generateNarrative(
    identity: IdentityInfo,
    memory: MemoryInfo,
    pulse: SystemPulse,
    performance: PerformanceInfo,
    repair: RepairInfo,
  ): string {
    const parts: string[] = [];

    // Sentence 1: Identity
    const uptimeHours = Math.floor(identity.uptime / 3600);
    const uptimeStr = uptimeHours > 0 ? `${uptimeHours} hours` : `${Math.floor(identity.uptime / 60)} minutes`;
    parts.push(`I am ${identity.name} v${identity.version}, running for ${uptimeStr}. I use ${identity.personality} personality framework.`);

    // Sentence 2: Memory
    if (memory.totalSessions === 0) {
      parts.push('I have no conversation history yet.');
    } else {
      const topicStr = memory.recentTopics.length > 0
        ? ` My recent focus has been on ${memory.recentTopics.slice(0, 3).join(', ')}.`
        : '';
      parts.push(`I remember ${memory.totalSessions} conversations with ${memory.totalMessages} messages.${topicStr}`);
    }

    // Sentence 3: Health
    if (pulse.overall === 'healthy') {
      parts.push('My systems are healthy.');
    } else if (pulse.overall === 'degraded') {
      const issues = pulse.anomalies.map(a => a.description).slice(0, 2).join('; ');
      parts.push(`My systems are degraded. Issues: ${issues}.`);
    } else {
      parts.push('My systems are in critical state and need attention.');
    }

    // Sentence 4: Performance
    parts.push(`User satisfaction is ${performance.userSatisfaction}.`);

    // Sentence 5: Activity (only if relevant)
    if (memory.activeDecisions > 0 || repair.pendingApprovals > 0) {
      const decisionStr = memory.activeDecisions > 0
        ? `${memory.activeDecisions} active decisions`
        : '';
      const approvalStr = repair.pendingApprovals > 0
        ? `${repair.pendingApprovals} repair actions awaiting approval`
        : '';
      const combined = [decisionStr, approvalStr].filter(Boolean).join(' and ');
      parts.push(`I have ${combined}.`);
    }

    return parts.join(' ');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/self-model.test.ts`
Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add packages/consciousness/src/model/self-model.ts packages/consciousness/tests/self-model.test.ts
git commit -m "feat(consciousness): implement SelfModel with narrative generation"
```

---

### Task 11: Consciousness Orchestrator

**Files:**
- Create: `packages/consciousness/src/consciousness.ts`
- Create: `packages/consciousness/tests/consciousness.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/consciousness/tests/consciousness.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Consciousness } from '../src/consciousness.js';

function createMockVault() {
  const store = new Map<string, string>();
  return {
    add: vi.fn(async (name: string, value: string) => { store.set(name, value); }),
    get: vi.fn((name: string) => store.get(name)),
    has: vi.fn((name: string) => store.has(name)),
    list: vi.fn(() => [...store.keys()]),
    remove: vi.fn(async (name: string) => store.delete(name)),
  };
}

function createMockDeps() {
  return {
    vault: createMockVault(),
    healthMonitor: {
      getHealthState: vi.fn().mockReturnValue({
        overall: 'healthy',
        subsystems: [],
        issues: [],
        lastCheck: new Date().toISOString(),
      }),
    },
    feedbackStore: {
      getInsights: vi.fn().mockReturnValue({
        suggestedAdjustments: {},
        weakDomains: [],
        trend: 'stable',
        totalFeedback: 0,
      }),
      getForDomain: vi.fn().mockReturnValue([]),
      getRecentTrend: vi.fn().mockReturnValue('stable'),
    },
    correctionStore: {
      getStats: vi.fn().mockReturnValue({
        totalCorrections: 0,
        topMisclassifications: [],
        correctionRate: {},
      }),
    },
    preferenceHistory: {
      detectConflicts: vi.fn().mockReturnValue([]),
    },
    decisionLog: {
      query: vi.fn().mockReturnValue([]),
      getDueFollowUps: vi.fn().mockReturnValue([]),
    },
    getResourceMetrics: vi.fn().mockReturnValue({
      memoryUsageMb: 256,
      cpuPercent: 10,
      activeConnections: 1,
      uptimeSeconds: 3600,
    }),
    getCapabilityMetrics: vi.fn().mockReturnValue({
      totalCapabilities: 10,
      healthyCapabilities: 10,
      degradedCapabilities: [],
    }),
    actionExecutor: vi.fn(async () => 'ok'),
    onNotify: vi.fn(),
    onApprovalRequest: vi.fn(async () => true),
    version: '1.4.0',
    monitorIntervalMs: 60_000, // Long interval to avoid ticks in tests
  };
}

describe('Consciousness', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let consciousness: Consciousness;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = createMockDeps();
    consciousness = new Consciousness(deps as any);
  });

  afterEach(() => {
    consciousness.shutdown();
    vi.useRealTimers();
  });

  it('exposes journal, monitor, repair, model submodules', () => {
    expect(consciousness.journal).toBeDefined();
    expect(consciousness.monitor).toBeDefined();
    expect(consciousness.repair).toBeDefined();
    expect(consciousness.model).toBeDefined();
  });

  describe('initialize', () => {
    it('starts the monitor loop', async () => {
      await consciousness.initialize();
      const pulse = consciousness.monitor.getPulse();
      expect(pulse.timestamp).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('stops the monitor loop', async () => {
      await consciousness.initialize();
      consciousness.shutdown();
      const callCount = deps.healthMonitor.getHealthState.mock.calls.length;
      vi.advanceTimersByTime(120_000);
      // Should not have made additional calls after shutdown
      expect(deps.healthMonitor.getHealthState.mock.calls.length).toBe(callCount);
    });
  });

  describe('journal integration', () => {
    it('can record and retrieve entries', async () => {
      await consciousness.initialize();
      const id = await consciousness.journal.record({
        sessionId: 'test-session',
        type: 'message',
        message: { role: 'user', content: 'Hello' },
        context: { domains: ['general'] },
        selfState: { health: 'healthy', activeProviders: ['openai'], uptime: 100 },
      });
      expect(id).toBeTruthy();

      const entries = await consciousness.journal.getSession('test-session');
      expect(entries).toHaveLength(1);
    });
  });

  describe('model integration', () => {
    it('synthesizes a self-model snapshot', async () => {
      await consciousness.initialize();
      const snapshot = await consciousness.model.synthesize();
      expect(snapshot.identity.name).toBe('Auxiora');
      expect(snapshot.selfNarrative).toContain('Auxiora');
    });
  });

  describe('repair integration', () => {
    it('can diagnose and execute a repair', async () => {
      await consciousness.initialize();
      const diagnosis = await consciousness.repair.diagnose({
        subsystem: 'cache',
        severity: 'low',
        description: 'Stale cache entries',
        detectedAt: Date.now(),
      });
      expect(diagnosis.suggestedActions.length).toBeGreaterThanOrEqual(1);

      const log = await consciousness.repair.executeAction(
        diagnosis.suggestedActions[0],
        diagnosis.id,
      );
      expect(log.status).toBe('executed');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/consciousness/tests/consciousness.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/consciousness/src/consciousness.ts
import { SessionJournal } from './journal/session-journal.js';
import type { VaultLike } from './journal/session-journal.js';
import { SignalSynthesizer } from './monitor/signal-synthesizer.js';
import type { SignalSynthesizerDeps } from './monitor/signal-synthesizer.js';
import { SelfMonitor } from './monitor/self-monitor.js';
import { SelfRepairEngine } from './repair/self-repair-engine.js';
import type { SelfRepairEngineDeps } from './repair/self-repair-engine.js';
import { SelfModel } from './model/self-model.js';
import type { SelfModelDeps } from './model/self-model.js';
import type { Diagnosis, RepairAction } from './repair/repair-types.js';

export interface ConsciousnessDeps {
  vault: VaultLike;

  // For SignalSynthesizer
  healthMonitor: SignalSynthesizerDeps['healthMonitor'];
  feedbackStore: SignalSynthesizerDeps['feedbackStore'] & SelfModelDeps['feedbackStore'];
  correctionStore: SignalSynthesizerDeps['correctionStore'];
  preferenceHistory: SignalSynthesizerDeps['preferenceHistory'];
  getResourceMetrics: SignalSynthesizerDeps['getResourceMetrics'];
  getCapabilityMetrics: SignalSynthesizerDeps['getCapabilityMetrics'];

  // For SelfRepairEngine
  actionExecutor: SelfRepairEngineDeps['actionExecutor'];
  onNotify: SelfRepairEngineDeps['onNotify'];
  onApprovalRequest: SelfRepairEngineDeps['onApprovalRequest'];

  // For SelfModel
  decisionLog: SelfModelDeps['decisionLog'];
  version: string;

  // Configuration
  monitorIntervalMs?: number;
}

export class Consciousness {
  readonly journal: SessionJournal;
  readonly monitor: SelfMonitor;
  readonly repair: SelfRepairEngine;
  readonly model: SelfModel;

  constructor(deps: ConsciousnessDeps) {
    // Build journal
    this.journal = new SessionJournal(deps.vault);

    // Build signal synthesizer → monitor
    const synthesizer = new SignalSynthesizer({
      healthMonitor: deps.healthMonitor,
      feedbackStore: deps.feedbackStore,
      correctionStore: deps.correctionStore,
      preferenceHistory: deps.preferenceHistory,
      getResourceMetrics: deps.getResourceMetrics,
      getCapabilityMetrics: deps.getCapabilityMetrics,
    });
    this.monitor = new SelfMonitor(synthesizer, {
      intervalMs: deps.monitorIntervalMs,
    });

    // Build repair engine
    this.repair = new SelfRepairEngine({
      vault: deps.vault,
      onNotify: deps.onNotify,
      onApprovalRequest: deps.onApprovalRequest,
      actionExecutor: deps.actionExecutor,
    });

    // Build self-model
    this.model = new SelfModel({
      journal: this.journal,
      monitor: this.monitor,
      repair: this.repair,
      decisionLog: deps.decisionLog,
      feedbackStore: deps.feedbackStore,
      version: deps.version,
    });
  }

  async initialize(): Promise<void> {
    await this.journal.initialize();
    this.monitor.start();
  }

  shutdown(): void {
    this.monitor.stop();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/consciousness/tests/consciousness.test.ts`
Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add packages/consciousness/src/consciousness.ts packages/consciousness/tests/consciousness.test.ts
git commit -m "feat(consciousness): implement Consciousness orchestrator"
```

---

### Task 12: Barrel Exports & Full Integration

**Files:**
- Modify: `packages/consciousness/src/index.ts`

**Step 1: Write the complete barrel export**

```typescript
// packages/consciousness/src/index.ts

// Journal
export { SessionJournal } from './journal/session-journal.js';
export type { VaultLike } from './journal/session-journal.js';
export type {
  JournalEntry,
  JournalEntryType,
  JournalEntryMessage,
  JournalEntryContext,
  JournalEntrySelfState,
  SessionSummary,
  JournalSearchQuery,
} from './journal/journal-types.js';

// Monitor
export { SignalSynthesizer } from './monitor/signal-synthesizer.js';
export type { SignalSynthesizerDeps } from './monitor/signal-synthesizer.js';
export { SelfMonitor } from './monitor/self-monitor.js';
export type { SelfMonitorOptions } from './monitor/self-monitor.js';
export type {
  SystemPulse,
  SubsystemStatus,
  Anomaly,
  ReasoningMetrics,
  ResourceMetrics,
  CapabilityMetrics,
} from './monitor/monitor-types.js';

// Repair
export { SelfRepairEngine } from './repair/self-repair-engine.js';
export type { SelfRepairEngineDeps } from './repair/self-repair-engine.js';
export { BUILT_IN_PATTERNS } from './repair/repair-actions.js';
export type { RepairPattern } from './repair/repair-actions.js';
export type {
  Diagnosis,
  RepairAction,
  RepairLog,
  RepairTier,
} from './repair/repair-types.js';

// Model
export { SelfModel } from './model/self-model.js';
export type { SelfModelDeps } from './model/self-model.js';
export type {
  SelfModelSnapshot,
  IdentityInfo,
  MemoryInfo,
  PerformanceInfo,
  RepairInfo,
} from './model/model-types.js';

// Orchestrator
export { Consciousness } from './consciousness.js';
export type { ConsciousnessDeps } from './consciousness.js';
```

**Step 2: Run full type check**

Run: `cd /home/ai-work/git/auxiora/packages/consciousness && npx tsc --noEmit`
Expected: No errors.

**Step 3: Run all consciousness tests**

Run: `npx vitest run packages/consciousness/tests/`
Expected: All tests pass (should be ~40-50 tests across 8 test files).

**Step 4: Run the full test suite for regression**

Run: `npx vitest run`
Expected: All existing tests still pass. Zero regressions.

**Step 5: Commit**

```bash
git add packages/consciousness/src/index.ts
git commit -m "feat(consciousness): complete barrel exports and verify full integration"
```

---

## Verification Checklist

After all tasks complete, verify:

```bash
# Type check the new package
cd /home/ai-work/git/auxiora/packages/consciousness && npx tsc --noEmit

# Run all consciousness tests
npx vitest run packages/consciousness/tests/

# Full regression suite
cd /home/ai-work/git/auxiora && npx vitest run

# Verify package structure
ls -la packages/consciousness/src/
ls -la packages/consciousness/src/journal/
ls -la packages/consciousness/src/monitor/
ls -la packages/consciousness/src/repair/
ls -la packages/consciousness/src/model/
```

**Expected final file count:**
- 10 source files in `src/` (1 barrel + 1 orchestrator + 2 journal + 3 monitor + 2 repair + 2 model — but journal-types and monitor-types are inside subdirs)
- 8 test files in `tests/`
- ~40-50 total tests
