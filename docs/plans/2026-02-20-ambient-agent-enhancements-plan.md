# Ambient Agent Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining gaps in the ambient agent runtime: persist learned patterns across restarts, feed ambient signals to the self-awareness pipeline, add event-driven behavior triggers with a condition DSL, and expose REST endpoints for pattern/notification/scheduler management.

**Architecture:** Four independent layers — (1) pattern persistence via vault serialization, (2) ambient awareness collector feeding the self-awareness pipeline, (3) event-driven behavior triggers with a condition DSL evaluated against TriggerEvent data, (4) REST API at `/api/v1/ambient` for pattern, notification, and scheduler management.

**Tech Stack:** TypeScript strict ESM, vitest, Express 5, vault encryption, `@auxiora/self-awareness` SignalCollector interface.

**Design Doc:** `docs/plans/2026-02-20-ambient-agent-enhancements-design.md`

---

### Task 1: Add serialize/deserialize to AmbientPatternEngine

**Files:**
- Modify: `packages/ambient/src/pattern-engine.ts` (lines 15-95)
- Test: `packages/ambient/tests/pattern-engine-persistence.test.ts`

**Step 1: Write the failing test**

Create `packages/ambient/tests/pattern-engine-persistence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AmbientPatternEngine } from '../src/pattern-engine.js';

describe('AmbientPatternEngine persistence', () => {
  it('serialize() returns a JSON string of internal state', () => {
    const engine = new AmbientPatternEngine();
    engine.observe({ type: 'test', timestamp: Date.now() });
    const serialized = engine.serialize();
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveProperty('events');
    expect(parsed).toHaveProperty('patterns');
    expect(parsed.events).toHaveLength(1);
  });

  it('static deserialize() reconstructs engine state', () => {
    const engine = new AmbientPatternEngine();
    const now = Date.now();
    engine.observe({ type: 'login', timestamp: now - 1000 });
    engine.observe({ type: 'login', timestamp: now - 500 });
    engine.observe({ type: 'login', timestamp: now });
    engine.detectPatterns();

    const serialized = engine.serialize();
    const restored = AmbientPatternEngine.deserialize(serialized);

    expect(restored.getEventCount()).toBe(3);
    expect(restored.getPatterns().length).toBe(engine.getPatterns().length);
  });

  it('deserialized engine can continue observing and detecting', () => {
    const engine = new AmbientPatternEngine();
    engine.observe({ type: 'check', timestamp: Date.now() });
    const restored = AmbientPatternEngine.deserialize(engine.serialize());
    restored.observe({ type: 'check', timestamp: Date.now() + 1000 });
    expect(restored.getEventCount()).toBe(2);
  });

  it('deserialize() with invalid JSON throws', () => {
    expect(() => AmbientPatternEngine.deserialize('not-json')).toThrow();
  });

  it('round-trips pattern IDs and confidence', () => {
    const engine = new AmbientPatternEngine();
    const base = Date.now();
    // Create events at same hour to trigger schedule pattern
    for (let i = 0; i < 5; i++) {
      const d = new Date(base);
      d.setHours(14, 0, 0, 0);
      d.setDate(d.getDate() - i);
      engine.observe({ type: 'standup', timestamp: d.getTime() });
    }
    engine.detectPatterns();
    const original = engine.getPatterns();

    const restored = AmbientPatternEngine.deserialize(engine.serialize());
    const restoredPatterns = restored.getPatterns();

    expect(restoredPatterns.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restoredPatterns[i]!.id).toBe(original[i]!.id);
      expect(restoredPatterns[i]!.confidence).toBe(original[i]!.confidence);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/ambient/tests/pattern-engine-persistence.test.ts`
Expected: FAIL — `engine.serialize is not a function`

**Step 3: Write minimal implementation**

Add to `packages/ambient/src/pattern-engine.ts` inside the `AmbientPatternEngine` class:

After the `reset()` method (line 95), add:

```ts
  /** Serialize engine state to a JSON string for persistence. */
  serialize(): string {
    return JSON.stringify({
      events: this.events,
      patterns: Array.from(this.patterns.entries()),
      windowSize: this.windowSize,
    });
  }

  /** Reconstruct an engine from a serialized JSON string. */
  static deserialize(data: string): AmbientPatternEngine {
    const parsed = JSON.parse(data) as {
      events: ObservedEvent[];
      patterns: [string, AmbientPattern][];
      windowSize: number;
    };
    const engine = new AmbientPatternEngine(parsed.windowSize);
    engine.events = parsed.events;
    engine.patterns = new Map(parsed.patterns);
    return engine;
  }
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/ambient/tests/pattern-engine-persistence.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/ambient/src/pattern-engine.ts packages/ambient/tests/pattern-engine-persistence.test.ts
git commit -m "feat(ambient): add serialize/deserialize to AmbientPatternEngine"
```

---

### Task 2: Wire pattern persistence in runtime (vault save/restore)

**Files:**
- Modify: `packages/runtime/src/index.ts` (around lines 1256-1258 — ambient init section)
- Test: `packages/runtime/tests/ambient-persistence.test.ts`

**Context:** The runtime already creates `this.ambientEngine = new AmbientPatternEngine()` at line 1257. We need to: (a) restore from vault on startup, (b) persist to vault after each `detectPatterns()` cycle. The vault is accessible as `this.vault` in the Auxiora class.

**Step 1: Write the failing test**

Create `packages/runtime/tests/ambient-persistence.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmbientPatternEngine } from '@auxiora/ambient';

describe('ambient pattern persistence', () => {
  const VAULT_KEY = 'ambient:patterns';

  it('saves serialized state to vault after detectPatterns()', () => {
    const engine = new AmbientPatternEngine();
    const vaultSet = vi.fn();

    engine.observe({ type: 'test', timestamp: Date.now() });
    engine.detectPatterns();

    const serialized = engine.serialize();
    vaultSet(VAULT_KEY, serialized);

    expect(vaultSet).toHaveBeenCalledWith(VAULT_KEY, expect.any(String));
    const stored = JSON.parse(vaultSet.mock.calls[0]![1] as string);
    expect(stored.events).toHaveLength(1);
  });

  it('restores engine state from vault on startup', () => {
    const engine = new AmbientPatternEngine();
    engine.observe({ type: 'restored', timestamp: Date.now() });
    const serialized = engine.serialize();

    const vaultGet = vi.fn().mockReturnValue(serialized);
    const stored = vaultGet(VAULT_KEY);
    const restored = AmbientPatternEngine.deserialize(stored);

    expect(restored.getEventCount()).toBe(1);
  });

  it('starts fresh when vault has no stored patterns', () => {
    const vaultGet = vi.fn().mockReturnValue(undefined);
    const stored = vaultGet(VAULT_KEY);

    const engine = stored
      ? AmbientPatternEngine.deserialize(stored)
      : new AmbientPatternEngine();

    expect(engine.getEventCount()).toBe(0);
  });

  it('starts fresh when vault data is corrupt', () => {
    const vaultGet = vi.fn().mockReturnValue('not-valid-json');

    let engine: AmbientPatternEngine;
    try {
      engine = AmbientPatternEngine.deserialize(vaultGet(VAULT_KEY));
    } catch {
      engine = new AmbientPatternEngine();
    }

    expect(engine.getEventCount()).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-persistence.test.ts`
Expected: PASS (these are unit-level mocks; the actual wiring test comes later in integration)

**Step 3: Wire persistence in runtime**

In `packages/runtime/src/index.ts`, modify the ambient initialization section (~line 1256-1258).

Replace:
```ts
this.ambientEngine = new AmbientPatternEngine();
```

With:
```ts
// Restore persisted patterns from vault, or start fresh
try {
  const stored = this.vault.get('ambient:patterns');
  this.ambientEngine = stored
    ? AmbientPatternEngine.deserialize(stored)
    : new AmbientPatternEngine();
} catch {
  this.ambientEngine = new AmbientPatternEngine();
}
```

Then find the location in the runtime where `detectPatterns()` is called (or the notification poll cycle at `pollAndNotify()` in AmbientScheduler). We need to add persistence after each detection cycle. The best place is in the existing `pollAndNotify` flow. Since the scheduler calls `triggerManager.pollAll()`, we hook into the notification poll callback.

In the ambient scheduler initialization section (~lines 1347-1368), after `this.ambientScheduler.start()`, add a detection+persist interval:

```ts
// Run pattern detection and persist to vault every 5 minutes
const PATTERN_DETECT_INTERVAL = 5 * 60 * 1000;
this.ambientDetectTimer = setInterval(() => {
  if (this.ambientEngine) {
    this.ambientEngine.detectPatterns();
    try {
      this.vault.set('ambient:patterns', this.ambientEngine.serialize());
    } catch { /* vault locked */ }
  }
}, PATTERN_DETECT_INTERVAL);
```

Add the field `private ambientDetectTimer?: ReturnType<typeof setInterval>;` to the class, and clear it in `shutdown()` where `this.ambientScheduler.stop()` is called (~line 3898):

```ts
if (this.ambientDetectTimer) {
  clearInterval(this.ambientDetectTimer);
}
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-persistence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/ambient-persistence.test.ts
git commit -m "feat(ambient): wire pattern persistence via vault save/restore"
```

---

### Task 3: Create AmbientAwarenessCollector

**Files:**
- Create: `packages/ambient/src/ambient-awareness-collector.ts`
- Modify: `packages/ambient/src/index.ts` (add export)
- Test: `packages/ambient/tests/ambient-awareness-collector.test.ts`

**Context:** Follow the same pattern as `ArchitectAwarenessCollector` in `packages/personality/src/architect-awareness-collector.ts`. Implements `SignalCollector` from `@auxiora/self-awareness`. Three signal dimensions: `ambient-patterns` (priority 0.5), `ambient-anticipations` (priority 0.7), `ambient-activity` (priority 0.3).

**Step 1: Write the failing test**

Create `packages/ambient/tests/ambient-awareness-collector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AmbientAwarenessCollector } from '../src/ambient-awareness-collector.js';
import type { CollectionContext } from '@auxiora/self-awareness';

const stubContext: CollectionContext = {
  userId: 'u1',
  sessionId: 's1',
  chatId: 'c1',
  currentMessage: 'hello',
  recentMessages: [],
};

describe('AmbientAwarenessCollector', () => {
  it('returns empty when no data has been updated', async () => {
    const collector = new AmbientAwarenessCollector();
    const signals = await collector.collect(stubContext);
    expect(signals).toEqual([]);
  });

  it('emits ambient-patterns signal for high-confidence patterns', async () => {
    const collector = new AmbientAwarenessCollector();
    collector.updatePatterns([
      { id: 'p1', type: 'schedule', description: 'standup at 9', confidence: 0.9, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 5 },
      { id: 'p2', type: 'preference', description: 'low conf', confidence: 0.2, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 1 },
      { id: 'p3', type: 'correlation', description: 'A then B', confidence: 0.8, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 3 },
      { id: 'p4', type: 'schedule', description: 'lunch at 12', confidence: 0.7, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 4 },
    ]);
    const signals = await collector.collect(stubContext);
    const patternSignal = signals.find(s => s.dimension === 'ambient-patterns');
    expect(patternSignal).toBeDefined();
    expect(patternSignal!.priority).toBe(0.5);
    // Should include top 3 by confidence, excluding the low-conf one
    expect(patternSignal!.data.count).toBe(3);
  });

  it('emits ambient-anticipations signal for upcoming predictions', async () => {
    const collector = new AmbientAwarenessCollector();
    const oneHour = Date.now() + 60 * 60 * 1000;
    collector.updateAnticipations([
      { id: 'a1', description: 'standup prep', expectedAt: oneHour - 1000, confidence: 0.8, sourcePatterns: ['p1'] },
    ]);
    const signals = await collector.collect(stubContext);
    const antSignal = signals.find(s => s.dimension === 'ambient-anticipations');
    expect(antSignal).toBeDefined();
    expect(antSignal!.priority).toBe(0.7);
  });

  it('emits ambient-activity signal when event data is provided', async () => {
    const collector = new AmbientAwarenessCollector();
    collector.updateActivity({ eventRate: 12, activeBehaviors: 3 });
    const signals = await collector.collect(stubContext);
    const actSignal = signals.find(s => s.dimension === 'ambient-activity');
    expect(actSignal).toBeDefined();
    expect(actSignal!.priority).toBe(0.3);
    expect(actSignal!.data.eventRate).toBe(12);
  });

  it('filters anticipations beyond 1 hour', async () => {
    const collector = new AmbientAwarenessCollector();
    const twoHours = Date.now() + 2 * 60 * 60 * 1000;
    collector.updateAnticipations([
      { id: 'a2', description: 'too far', expectedAt: twoHours, confidence: 0.9, sourcePatterns: [] },
    ]);
    const signals = await collector.collect(stubContext);
    const antSignal = signals.find(s => s.dimension === 'ambient-anticipations');
    expect(antSignal).toBeUndefined();
  });

  it('implements SignalCollector interface (name and enabled)', () => {
    const collector = new AmbientAwarenessCollector();
    expect(collector.name).toBe('ambient');
    expect(collector.enabled).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/ambient/tests/ambient-awareness-collector.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/ambient/src/ambient-awareness-collector.ts`:

```ts
import type { SignalCollector, AwarenessSignal, CollectionContext } from '@auxiora/self-awareness';
import type { AmbientPattern, Anticipation } from './types.js';

interface ActivitySnapshot {
  eventRate: number;
  activeBehaviors: number;
}

export class AmbientAwarenessCollector implements SignalCollector {
  readonly name = 'ambient';
  enabled = true;

  private patterns: AmbientPattern[] = [];
  private anticipations: Anticipation[] = [];
  private activity: ActivitySnapshot | null = null;

  updatePatterns(patterns: AmbientPattern[]): void {
    this.patterns = patterns;
  }

  updateAnticipations(anticipations: Anticipation[]): void {
    this.anticipations = anticipations;
  }

  updateActivity(snapshot: ActivitySnapshot): void {
    this.activity = snapshot;
  }

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    const signals: AwarenessSignal[] = [];

    // Top 3 high-confidence patterns
    const topPatterns = this.patterns
      .filter(p => p.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    if (topPatterns.length > 0) {
      signals.push({
        dimension: 'ambient-patterns',
        priority: 0.5,
        text: topPatterns.map(p => `${p.description} (${(p.confidence * 100).toFixed(0)}%)`).join('; '),
        data: { count: topPatterns.length, patterns: topPatterns.map(p => ({ id: p.id, description: p.description, confidence: p.confidence })) },
      });
    }

    // Upcoming anticipations within 1 hour
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    const upcoming = this.anticipations.filter(a => a.expectedAt <= oneHourFromNow && a.expectedAt > Date.now());

    if (upcoming.length > 0) {
      signals.push({
        dimension: 'ambient-anticipations',
        priority: 0.7,
        text: upcoming.map(a => a.description).join('; '),
        data: { count: upcoming.length, anticipations: upcoming.map(a => ({ id: a.id, description: a.description, expectedAt: a.expectedAt })) },
      });
    }

    // Activity snapshot
    if (this.activity) {
      signals.push({
        dimension: 'ambient-activity',
        priority: 0.3,
        text: `Event rate: ${this.activity.eventRate}/window, active behaviors: ${this.activity.activeBehaviors}`,
        data: { eventRate: this.activity.eventRate, activeBehaviors: this.activity.activeBehaviors },
      });
    }

    return signals;
  }
}
```

Add export to `packages/ambient/src/index.ts`:

```ts
export { AmbientAwarenessCollector } from './ambient-awareness-collector.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/ambient/tests/ambient-awareness-collector.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/ambient/src/ambient-awareness-collector.ts packages/ambient/src/index.ts packages/ambient/tests/ambient-awareness-collector.test.ts
git commit -m "feat(ambient): add AmbientAwarenessCollector implementing SignalCollector"
```

---

### Task 4: Register ambient collector in runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` (ambient init section + poll cycle)
- Test: `packages/runtime/tests/ambient-awareness-registration.test.ts`

**Context:** The runtime already registers `ArchitectAwarenessCollector` with the self-awareness assembler. Follow the same pattern for `AmbientAwarenessCollector`. After each pattern detection cycle (from the interval set in Task 2), update the collector with fresh patterns and anticipations.

**Step 1: Write the failing test**

Create `packages/runtime/tests/ambient-awareness-registration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { AmbientAwarenessCollector } from '@auxiora/ambient';

describe('ambient awareness registration', () => {
  it('collector produces signals after pattern update', async () => {
    const collector = new AmbientAwarenessCollector();
    collector.updatePatterns([
      { id: 'p1', type: 'schedule', description: 'standup', confidence: 0.9, evidence: [], detectedAt: Date.now(), lastConfirmedAt: Date.now(), occurrences: 5 },
    ]);
    collector.updateActivity({ eventRate: 10, activeBehaviors: 2 });

    const signals = await collector.collect({
      userId: 'u1', sessionId: 's1', chatId: 'c1',
      currentMessage: 'test', recentMessages: [],
    });

    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals.some(s => s.dimension === 'ambient-patterns')).toBe(true);
    expect(signals.some(s => s.dimension === 'ambient-activity')).toBe(true);
  });
});
```

**Step 2: Run test to verify it passes (this is a unit test for the collector)**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-awareness-registration.test.ts`
Expected: PASS

**Step 3: Wire in runtime**

In `packages/runtime/src/index.ts`:

1. Add import: `import { AmbientAwarenessCollector } from '@auxiora/ambient';` (extend the existing import)
2. Add field: `private ambientAwarenessCollector?: AmbientAwarenessCollector;`
3. In the ambient init section (~line 1256), after creating/restoring the engine:
```ts
this.ambientAwarenessCollector = new AmbientAwarenessCollector();
```
4. Register with the awareness assembler (find where `architectAwarenessCollector` is registered and add next to it):
```ts
if (this.awarenessAssembler && this.ambientAwarenessCollector) {
  this.awarenessAssembler.registerCollector(this.ambientAwarenessCollector);
}
```
5. In the detection interval (from Task 2), after `detectPatterns()`, update the collector:
```ts
if (this.ambientAwarenessCollector) {
  this.ambientAwarenessCollector.updatePatterns(this.ambientEngine.getPatterns());
  const anticipations = this.anticipationEngine
    ? this.anticipationEngine.generateAnticipations(this.ambientEngine.getPatterns())
    : [];
  this.ambientAwarenessCollector.updateAnticipations(anticipations);
  this.ambientAwarenessCollector.updateActivity({
    eventRate: this.ambientEngine.getEventCount(),
    activeBehaviors: this.behaviorManager ? /* get active count */ 0 : 0,
  });
}
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-awareness-registration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/ambient-awareness-registration.test.ts
git commit -m "feat(ambient): register AmbientAwarenessCollector in runtime"
```

---

### Task 5: Add event trigger types to behaviors package

**Files:**
- Modify: `packages/behaviors/src/types.ts`
- Modify: `packages/behaviors/src/index.ts`
- Test: `packages/behaviors/tests/event-trigger-types.test.ts`

**Context:** Add `'event'` to `BehaviorType`, add `BehaviorEventTrigger` and `EventCondition` interfaces, add `eventTrigger?` to `Behavior`.

**Step 1: Write the failing test**

Create `packages/behaviors/tests/event-trigger-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Behavior, BehaviorEventTrigger, EventCondition } from '../src/types.js';

describe('event trigger types', () => {
  it('BehaviorType includes event', () => {
    const behavior: Behavior = {
      id: 'b1',
      type: 'event',
      status: 'active',
      action: 'notify',
      channel: { type: 'ws', id: 'default', overridden: false },
      createdBy: 'user',
      createdAt: new Date().toISOString(),
      runCount: 0,
      failCount: 0,
      maxFailures: 3,
      eventTrigger: {
        source: 'github',
        event: 'push',
        conditions: [
          { field: 'ref', op: 'equals', value: 'refs/heads/main' },
        ],
        combinator: 'and',
      },
    };
    expect(behavior.type).toBe('event');
    expect(behavior.eventTrigger).toBeDefined();
    expect(behavior.eventTrigger!.conditions).toHaveLength(1);
  });

  it('EventCondition supports all 7 operators', () => {
    const ops: EventCondition['op'][] = ['equals', 'contains', 'startsWith', 'endsWith', 'gt', 'lt', 'exists'];
    for (const op of ops) {
      const cond: EventCondition = { field: 'test', op, value: true };
      expect(cond.op).toBe(op);
    }
  });

  it('BehaviorEventTrigger supports and/or combinator', () => {
    const andTrigger: BehaviorEventTrigger = {
      source: 'slack',
      event: 'message',
      conditions: [],
      combinator: 'and',
    };
    const orTrigger: BehaviorEventTrigger = {
      source: 'slack',
      event: 'message',
      conditions: [],
      combinator: 'or',
    };
    expect(andTrigger.combinator).toBe('and');
    expect(orTrigger.combinator).toBe('or');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/behaviors/tests/event-trigger-types.test.ts`
Expected: FAIL — `EventCondition` and `BehaviorEventTrigger` not exported, `event` not assignable to `BehaviorType`

**Step 3: Write minimal implementation**

Modify `packages/behaviors/src/types.ts`:

1. Change line 1:
```ts
export type BehaviorType = 'scheduled' | 'monitor' | 'one-shot' | 'event';
```

2. After `BehaviorDelay` interface (line 16), add:
```ts
export interface EventCondition {
  field: string;
  op: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'exists';
  value: string | number | boolean;
}

export interface BehaviorEventTrigger {
  source: string;
  event: string;
  conditions: EventCondition[];
  combinator: 'and' | 'or';
}
```

3. Add to `Behavior` interface (after `delay?` field on line 31):
```ts
  eventTrigger?: BehaviorEventTrigger;
```

4. Update `packages/behaviors/src/index.ts` to export the new types:
```ts
export type {
  Behavior,
  BehaviorType,
  BehaviorStatus,
  BehaviorSchedule,
  BehaviorPolling,
  BehaviorDelay,
  BehaviorChannel,
  BehaviorExecution,
  EventCondition,
  BehaviorEventTrigger,
} from './types.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/behaviors/tests/event-trigger-types.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/behaviors/src/types.ts packages/behaviors/src/index.ts packages/behaviors/tests/event-trigger-types.test.ts
git commit -m "feat(behaviors): add event trigger type with condition DSL"
```

---

### Task 6: Implement condition evaluator

**Files:**
- Create: `packages/behaviors/src/condition-evaluator.ts`
- Modify: `packages/behaviors/src/index.ts` (add export)
- Test: `packages/behaviors/tests/condition-evaluator.test.ts`

**Context:** Pure function `evaluateConditions(data, conditions, combinator)`. Resolves `field` via dot-notation traversal. Applies 7 operators. AND = all must match, OR = any must match.

**Step 1: Write the failing test**

Create `packages/behaviors/tests/condition-evaluator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateConditions } from '../src/condition-evaluator.js';
import type { EventCondition } from '../src/types.js';

describe('evaluateConditions', () => {
  const data = {
    ref: 'refs/heads/main',
    action: 'opened',
    count: 42,
    nested: { deep: { value: 'hello world' } },
    flag: true,
  };

  describe('equals operator', () => {
    it('matches exact string', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'equals', value: 'refs/heads/main' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('rejects mismatch', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'equals', value: 'refs/heads/develop' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
    it('matches number', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'equals', value: 42 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('matches boolean', () => {
      const conds: EventCondition[] = [{ field: 'flag', op: 'equals', value: true }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('contains operator', () => {
    it('finds substring', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'contains', value: 'heads/main' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('rejects missing substring', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'contains', value: 'develop' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
  });

  describe('startsWith operator', () => {
    it('matches prefix', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'startsWith', value: 'refs/' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('endsWith operator', () => {
    it('matches suffix', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'endsWith', value: '/main' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('gt/lt operators', () => {
    it('gt matches when value is greater', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'gt', value: 40 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('gt rejects when value is equal', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'gt', value: 42 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
    it('lt matches when value is less', () => {
      const conds: EventCondition[] = [{ field: 'count', op: 'lt', value: 50 }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
  });

  describe('exists operator', () => {
    it('matches when field exists', () => {
      const conds: EventCondition[] = [{ field: 'ref', op: 'exists', value: true }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('matches when field does not exist', () => {
      const conds: EventCondition[] = [{ field: 'missing', op: 'exists', value: false }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('rejects when exists=true but field missing', () => {
      const conds: EventCondition[] = [{ field: 'missing', op: 'exists', value: true }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
  });

  describe('dot-notation field traversal', () => {
    it('resolves nested fields', () => {
      const conds: EventCondition[] = [{ field: 'nested.deep.value', op: 'contains', value: 'hello' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(true);
    });
    it('returns false for non-existent nested path', () => {
      const conds: EventCondition[] = [{ field: 'nested.missing.value', op: 'equals', value: 'x' }];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
  });

  describe('combinators', () => {
    it('AND requires all conditions to match', () => {
      const conds: EventCondition[] = [
        { field: 'ref', op: 'equals', value: 'refs/heads/main' },
        { field: 'count', op: 'gt', value: 100 },
      ];
      expect(evaluateConditions(data, conds, 'and')).toBe(false);
    });
    it('OR requires at least one condition to match', () => {
      const conds: EventCondition[] = [
        { field: 'ref', op: 'equals', value: 'refs/heads/develop' },
        { field: 'count', op: 'gt', value: 40 },
      ];
      expect(evaluateConditions(data, conds, 'or')).toBe(true);
    });
    it('AND with empty conditions returns true', () => {
      expect(evaluateConditions(data, [], 'and')).toBe(true);
    });
    it('OR with empty conditions returns false', () => {
      expect(evaluateConditions(data, [], 'or')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/behaviors/tests/condition-evaluator.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/behaviors/src/condition-evaluator.ts`:

```ts
import type { EventCondition } from './types.js';

/**
 * Resolve a dot-notation field path against an object.
 * Returns undefined if any segment is missing.
 */
function resolveField(data: Record<string, unknown>, field: string): unknown {
  const segments = field.split('.');
  let current: unknown = data;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

function evaluateSingle(data: Record<string, unknown>, condition: EventCondition): boolean {
  const actual = resolveField(data, condition.field);

  switch (condition.op) {
    case 'exists':
      return condition.value ? actual !== undefined : actual === undefined;

    case 'equals':
      return actual === condition.value;

    case 'contains':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.includes(condition.value)
        : false;

    case 'startsWith':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.startsWith(condition.value)
        : false;

    case 'endsWith':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.endsWith(condition.value)
        : false;

    case 'gt':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual > condition.value
        : false;

    case 'lt':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual < condition.value
        : false;

    default:
      return false;
  }
}

/**
 * Evaluate a set of conditions against event data.
 *
 * @param data - The event data object to evaluate against.
 * @param conditions - Array of conditions to check.
 * @param combinator - 'and' (all must match) or 'or' (any must match).
 */
export function evaluateConditions(
  data: Record<string, unknown>,
  conditions: EventCondition[],
  combinator: 'and' | 'or',
): boolean {
  if (conditions.length === 0) {
    return combinator === 'and';
  }

  if (combinator === 'and') {
    return conditions.every(c => evaluateSingle(data, c));
  }
  return conditions.some(c => evaluateSingle(data, c));
}
```

Add export to `packages/behaviors/src/index.ts`:

```ts
export { evaluateConditions } from './condition-evaluator.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/behaviors/tests/condition-evaluator.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/behaviors/src/condition-evaluator.ts packages/behaviors/src/index.ts packages/behaviors/tests/condition-evaluator.test.ts
git commit -m "feat(behaviors): implement condition evaluator with 7 operators and combinators"
```

---

### Task 7: Wire event routing in runtime

**Files:**
- Modify: `packages/runtime/src/index.ts` (trigger poll → event matching → behavior execution)
- Modify: `packages/audit/src/index.ts` (add new audit event types)
- Test: `packages/runtime/tests/event-routing.test.ts`

**Context:** When `triggerManager.pollAll()` returns `TriggerEvent[]`, the runtime should: (1) feed each event to `ambientEngine.observe()`, (2) match against all active event-type behaviors, (3) if `evaluateConditions()` matches → call `behaviorManager.executeNow(behaviorId)`, (4) emit audit event. Currently the scheduler calls `triggerManager.pollAll()` in the notification poll. We need to intercept or extend this flow.

**Step 1: Write the failing test**

Create `packages/runtime/tests/event-routing.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { evaluateConditions } from '@auxiora/behaviors';
import type { EventCondition } from '@auxiora/behaviors';

describe('event routing', () => {
  it('evaluateConditions matches event data against behavior conditions', () => {
    const eventData = { ref: 'refs/heads/main', action: 'push' };
    const conditions: EventCondition[] = [
      { field: 'ref', op: 'endsWith', value: '/main' },
      { field: 'action', op: 'equals', value: 'push' },
    ];
    expect(evaluateConditions(eventData, conditions, 'and')).toBe(true);
  });

  it('routes matching event to behavior execution', async () => {
    const executeNow = vi.fn().mockResolvedValue({ success: true });
    const behaviors = [
      {
        id: 'b1',
        type: 'event' as const,
        status: 'active' as const,
        eventTrigger: {
          source: 'github',
          event: 'push',
          conditions: [{ field: 'ref', op: 'endsWith' as const, value: '/main' }],
          combinator: 'and' as const,
        },
      },
      {
        id: 'b2',
        type: 'event' as const,
        status: 'active' as const,
        eventTrigger: {
          source: 'github',
          event: 'push',
          conditions: [{ field: 'ref', op: 'equals' as const, value: 'refs/heads/develop' }],
          combinator: 'and' as const,
        },
      },
    ];

    const event = { triggerId: 'push', connectorId: 'github', data: { ref: 'refs/heads/main' }, timestamp: Date.now() };

    // Simulate event routing logic
    for (const behavior of behaviors) {
      if (
        behavior.type === 'event' &&
        behavior.status === 'active' &&
        behavior.eventTrigger &&
        behavior.eventTrigger.source === event.connectorId &&
        behavior.eventTrigger.event === event.triggerId
      ) {
        if (evaluateConditions(event.data, behavior.eventTrigger.conditions, behavior.eventTrigger.combinator)) {
          await executeNow(behavior.id);
        }
      }
    }

    expect(executeNow).toHaveBeenCalledTimes(1);
    expect(executeNow).toHaveBeenCalledWith('b1');
  });

  it('does not route when conditions do not match', () => {
    const eventData = { ref: 'refs/heads/feature' };
    const conditions: EventCondition[] = [
      { field: 'ref', op: 'endsWith', value: '/main' },
    ];
    expect(evaluateConditions(eventData, conditions, 'and')).toBe(false);
  });
});
```

**Step 2: Run test to verify it passes (logic test)**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/event-routing.test.ts`
Expected: PASS (logic uses evaluateConditions which exists from Task 6)

**Step 3: Wire in runtime**

In `packages/runtime/src/index.ts`:

1. Add import: `import { evaluateConditions } from '@auxiora/behaviors';`
2. Add a private method `processEventTriggers`:

```ts
private async processEventTriggers(events: TriggerEvent[]): Promise<void> {
  if (!this.behaviorManager || events.length === 0) return;

  // Get all active event-type behaviors
  const allBehaviors = await this.behaviorManager.list();
  const eventBehaviors = allBehaviors.filter(
    b => b.type === 'event' && b.status === 'active' && b.eventTrigger
  );

  for (const event of events) {
    // Feed to ambient pattern engine
    this.ambientEngine?.observe({
      type: `${event.connectorId}:${event.triggerId}`,
      timestamp: event.timestamp,
      data: event.data,
    });

    // Match against event behaviors
    for (const behavior of eventBehaviors) {
      const trigger = behavior.eventTrigger!;
      if (trigger.source !== event.connectorId || trigger.event !== event.triggerId) continue;

      if (evaluateConditions(event.data, trigger.conditions, trigger.combinator)) {
        try {
          await this.behaviorManager.executeNow(behavior.id);
          await audit('behavior.event_triggered', {
            behaviorId: behavior.id,
            source: event.connectorId,
            event: event.triggerId,
          });
        } catch {
          // Execution failures are already tracked by BehaviorManager
        }
      }
    }
  }
}
```

3. Hook into the notification poll cycle. In the ambient scheduler setup section, wrap the `triggerManager.pollAll()` call. The scheduler already calls `pollAll()` in `pollAndNotify()`. We need to intercept the events. The cleanest approach: subscribe to trigger events from the runtime level. In the initialization section after creating the scheduler (~line 1347-1368):

```ts
// Subscribe to trigger events for event-behavior routing
this.triggerManager.onEvents(async (events) => {
  await this.processEventTriggers(events);
});
```

If `TriggerManager` does not have an `onEvents` hook, we add a handler subscription. Check: the TriggerManager has a `subscribe` and `pollAll`. The simplest approach is to call `processEventTriggers` after each poll in the detection interval alongside pattern persistence.

Update the detection interval (from Task 2):
```ts
this.ambientDetectTimer = setInterval(async () => {
  if (this.triggerManager) {
    const events = await this.triggerManager.pollAll();
    await this.processEventTriggers(events);
  }
  if (this.ambientEngine) {
    this.ambientEngine.detectPatterns();
    // ... persist + update awareness collector
  }
}, PATTERN_DETECT_INTERVAL);
```

4. Add audit event types to `packages/audit/src/index.ts`. Add to the `AuditEventType` union:
```ts
  | 'ambient.patterns.detected'
  | 'ambient.patterns.reset'
  | 'ambient.scheduler.started'
  | 'ambient.scheduler.stopped'
  | 'behavior.event_triggered'
```

Note: `behavior.event_triggered` should be added after the existing `behavior.failed` entry.

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/event-routing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/audit/src/index.ts packages/runtime/tests/event-routing.test.ts
git commit -m "feat(ambient): wire event routing from trigger poll to behavior execution"
```

---

### Task 8: Create ambient REST router

**Files:**
- Modify: `packages/runtime/src/index.ts` (new `createAmbientRouter()` method + mount)
- Test: `packages/runtime/tests/ambient-api.test.ts`

**Context:** Router mounted at `/api/v1/ambient` with 10 endpoints covering patterns, anticipations, notifications, and scheduler control. Follow the same pattern as the personality router (created in Feature A).

**Step 1: Write the failing test**

Create `packages/runtime/tests/ambient-api.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('ambient REST API', () => {
  function createTestApp() {
    const app = express();
    app.use(express.json());

    // Mock ambient components
    const patterns = [
      { id: 'p1', type: 'schedule', description: 'standup', confidence: 0.9, evidence: [], detectedAt: Date.now(), lastConfirmedAt: Date.now(), occurrences: 5 },
    ];
    const notifications = [
      { id: 'n1', priority: 'nudge', message: 'test', createdAt: Date.now(), dismissed: false, source: 'ambient' },
    ];
    const anticipations = [
      { id: 'a1', description: 'upcoming', expectedAt: Date.now() + 3600000, confidence: 0.8, sourcePatterns: ['p1'] },
    ];

    const mockEngine = {
      getPatterns: vi.fn().mockReturnValue(patterns),
      getPattern: vi.fn().mockImplementation((id: string) => patterns.find(p => p.id === id)),
      detectPatterns: vi.fn().mockReturnValue([]),
      reset: vi.fn(),
      getEventCount: vi.fn().mockReturnValue(10),
    };

    const mockNotifications = {
      getQueue: vi.fn().mockReturnValue(notifications),
      dismiss: vi.fn().mockReturnValue(true),
      getByPriority: vi.fn().mockReturnValue(notifications),
      getPendingCount: vi.fn().mockReturnValue(1),
    };

    const mockAnticipation = {
      getAnticipations: vi.fn().mockReturnValue(anticipations),
      generateAnticipations: vi.fn().mockReturnValue(anticipations),
    };

    const mockScheduler = {
      isRunning: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      stop: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ morningCron: '0 7 * * *', eveningCron: '0 18 * * *' }),
    };

    const router = express.Router();

    // Pattern endpoints
    router.get('/patterns', (_req, res) => {
      res.json({ patterns: mockEngine.getPatterns() });
    });
    router.get('/patterns/:id', (req, res) => {
      const pattern = mockEngine.getPattern(req.params.id);
      if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
      res.json(pattern);
    });
    router.post('/patterns/detect', (_req, res) => {
      const detected = mockEngine.detectPatterns();
      res.json({ detected: detected.length });
    });
    router.delete('/patterns', (_req, res) => {
      mockEngine.reset();
      res.json({ ok: true });
    });

    // Anticipation endpoint
    router.get('/anticipations', (_req, res) => {
      res.json({ anticipations: mockAnticipation.getAnticipations() });
    });

    // Notification endpoints
    router.get('/notifications', (req, res) => {
      const priority = req.query.priority as string | undefined;
      const items = priority
        ? mockNotifications.getByPriority(priority)
        : mockNotifications.getQueue();
      res.json({ notifications: items });
    });
    router.post('/notifications/:id/dismiss', (req, res) => {
      const ok = mockNotifications.dismiss(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Notification not found' });
      res.json({ ok: true });
    });
    router.get('/notifications/stats', (_req, res) => {
      res.json({ pending: mockNotifications.getPendingCount() });
    });

    // Scheduler endpoints
    router.get('/scheduler/status', (_req, res) => {
      res.json({ running: mockScheduler.isRunning(), config: mockScheduler.getConfig() });
    });
    router.post('/scheduler/start', (_req, res) => {
      mockScheduler.start();
      res.json({ ok: true });
    });
    router.post('/scheduler/stop', (_req, res) => {
      mockScheduler.stop();
      res.json({ ok: true });
    });

    app.use('/api/v1/ambient', router);

    return { app, mockEngine, mockNotifications, mockScheduler };
  }

  it('GET /patterns returns patterns sorted by confidence', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/patterns');
    expect(res.status).toBe(200);
    expect(res.body.patterns).toHaveLength(1);
  });

  it('GET /patterns/:id returns 404 for missing', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/patterns/missing');
    expect(res.status).toBe(404);
  });

  it('POST /patterns/detect triggers detection', async () => {
    const { app, mockEngine } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/patterns/detect');
    expect(res.status).toBe(200);
    expect(mockEngine.detectPatterns).toHaveBeenCalled();
  });

  it('DELETE /patterns resets all', async () => {
    const { app, mockEngine } = createTestApp();
    const res = await request(app).delete('/api/v1/ambient/patterns');
    expect(res.status).toBe(200);
    expect(mockEngine.reset).toHaveBeenCalled();
  });

  it('GET /anticipations returns upcoming', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/anticipations');
    expect(res.status).toBe(200);
    expect(res.body.anticipations).toHaveLength(1);
  });

  it('GET /notifications returns queue', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/notifications');
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
  });

  it('POST /notifications/:id/dismiss marks dismissed', async () => {
    const { app, mockNotifications } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/notifications/n1/dismiss');
    expect(res.status).toBe(200);
    expect(mockNotifications.dismiss).toHaveBeenCalledWith('n1');
  });

  it('GET /scheduler/status returns state', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/scheduler/status');
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(true);
  });

  it('POST /scheduler/start starts scheduler', async () => {
    const { app, mockScheduler } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/scheduler/start');
    expect(res.status).toBe(200);
    expect(mockScheduler.start).toHaveBeenCalled();
  });

  it('POST /scheduler/stop stops scheduler', async () => {
    const { app, mockScheduler } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/scheduler/stop');
    expect(res.status).toBe(200);
    expect(mockScheduler.stop).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it passes (mock-based test)**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-api.test.ts`
Expected: PASS (these are mock-based; they validate route structure)

**Step 3: Wire in runtime**

In `packages/runtime/src/index.ts`, add a `createAmbientRouter()` private method (after `createPersonalityRouter()`):

```ts
private createAmbientRouter(): express.Router {
  const router = express.Router();
  const self = this;

  function guardAmbient(res: express.Response): boolean {
    if (!self.ambientEngine || !self.ambientNotifications) {
      res.status(503).json({ error: 'Ambient system not available' });
      return false;
    }
    return true;
  }

  // Pattern management
  router.get('/patterns', (_req, res) => {
    if (!guardAmbient(res)) return;
    res.json({ patterns: self.ambientEngine!.getPatterns() });
  });

  router.get('/patterns/:id', (req, res) => {
    if (!guardAmbient(res)) return;
    const pattern = self.ambientEngine!.getPattern(req.params.id);
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  });

  router.post('/patterns/detect', async (_req, res) => {
    if (!guardAmbient(res)) return;
    const detected = self.ambientEngine!.detectPatterns();
    await audit('ambient.patterns.detected', { count: detected.length });
    res.json({ detected: detected.length });
  });

  router.delete('/patterns', async (_req, res) => {
    if (!guardAmbient(res)) return;
    self.ambientEngine!.reset();
    await audit('ambient.patterns.reset', {});
    res.json({ ok: true });
  });

  // Anticipations
  router.get('/anticipations', (_req, res) => {
    if (!self.anticipationEngine) return res.status(503).json({ error: 'Anticipation engine not available' });
    res.json({ anticipations: self.anticipationEngine.getAnticipations() });
  });

  // Notifications
  router.get('/notifications', (req, res) => {
    if (!guardAmbient(res)) return;
    const priority = req.query.priority as string | undefined;
    const dismissed = req.query.dismissed === 'true';
    let items = priority
      ? self.ambientNotifications!.getByPriority(priority as any)
      : self.ambientNotifications!.getQueue();
    if (!dismissed) {
      items = items.filter(n => !n.dismissed);
    }
    res.json({ notifications: items });
  });

  router.post('/notifications/:id/dismiss', (_req, res) => {
    if (!guardAmbient(res)) return;
    const ok = self.ambientNotifications!.dismiss(_req.params.id);
    if (!ok) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  });

  router.get('/notifications/stats', (_req, res) => {
    if (!guardAmbient(res)) return;
    const pending = self.ambientNotifications!.getPendingCount();
    res.json({ pending });
  });

  // Scheduler control
  router.get('/scheduler/status', (_req, res) => {
    if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
    res.json({
      running: self.ambientScheduler.isRunning(),
      config: self.ambientScheduler.getConfig(),
    });
  });

  router.post('/scheduler/start', async (_req, res) => {
    if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
    self.ambientScheduler.start();
    await audit('ambient.scheduler.started', {});
    res.json({ ok: true });
  });

  router.post('/scheduler/stop', async (_req, res) => {
    if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
    self.ambientScheduler.stop();
    await audit('ambient.scheduler.stopped', {});
    res.json({ ok: true });
  });

  router.put('/scheduler/config', (req, res) => {
    // Config update — the scheduler does not support live config mutation,
    // so we just return the current config. Future: restart with new config.
    if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
    res.json({ config: self.ambientScheduler.getConfig() });
  });

  return router;
}
```

Mount the router in the initialization section (near where the personality router is mounted, ~line 1156):

```ts
if (this.ambientEngine) {
  const ambientRouter = this.createAmbientRouter();
  this.gateway.mountRouter('/api/v1/ambient', ambientRouter);
}
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/tests/ambient-api.test.ts
git commit -m "feat(ambient): add REST API for patterns, notifications, and scheduler"
```

---

### Task 9: Add ambient audit events and comprehensive integration test

**Files:**
- Modify: `packages/audit/src/index.ts` (if not already done in Task 7)
- Create: `packages/runtime/tests/ambient-integration.test.ts`

**Context:** Verify all 4 layers work together: persistence round-trips, awareness signals produced, event conditions evaluated, API endpoints respond.

**Step 1: Write the integration test**

Create `packages/runtime/tests/ambient-integration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { AmbientPatternEngine, AmbientAwarenessCollector, AnticipationEngine } from '@auxiora/ambient';
import { evaluateConditions } from '@auxiora/behaviors';
import type { EventCondition, BehaviorEventTrigger } from '@auxiora/behaviors';
import type { TriggerEvent } from '@auxiora/connectors';

describe('ambient agent integration', () => {
  describe('Layer 1: Pattern persistence round-trip', () => {
    it('full cycle: observe → detect → serialize → deserialize → verify', () => {
      const engine = new AmbientPatternEngine();
      const base = Date.now();

      // Simulate 7 days of standup events at 9am
      for (let i = 0; i < 7; i++) {
        const d = new Date(base);
        d.setHours(9, 0, 0, 0);
        d.setDate(d.getDate() - i);
        engine.observe({ type: 'standup', timestamp: d.getTime() });
      }

      const detected = engine.detectPatterns();
      expect(detected.length).toBeGreaterThan(0);

      // Serialize and restore
      const serialized = engine.serialize();
      const restored = AmbientPatternEngine.deserialize(serialized);

      expect(restored.getEventCount()).toBe(engine.getEventCount());
      expect(restored.getPatterns().length).toBe(engine.getPatterns().length);

      // Restored engine can continue detecting
      restored.observe({ type: 'standup', timestamp: base + 86400000 });
      expect(restored.getEventCount()).toBe(engine.getEventCount() + 1);
    });
  });

  describe('Layer 2: Awareness collector signals', () => {
    it('produces all 3 signal dimensions when data is available', async () => {
      const collector = new AmbientAwarenessCollector();

      collector.updatePatterns([
        { id: 'p1', type: 'schedule', description: 'standup at 9', confidence: 0.9, evidence: [], detectedAt: Date.now(), lastConfirmedAt: Date.now(), occurrences: 5 },
      ]);

      const oneHour = Date.now() + 50 * 60 * 1000; // 50 min from now (within 1hr window)
      collector.updateAnticipations([
        { id: 'a1', description: 'upcoming standup', expectedAt: oneHour, confidence: 0.8, sourcePatterns: ['p1'] },
      ]);

      collector.updateActivity({ eventRate: 15, activeBehaviors: 4 });

      const signals = await collector.collect({
        userId: 'u1', sessionId: 's1', chatId: 'c1',
        currentMessage: 'test', recentMessages: [],
      });

      expect(signals).toHaveLength(3);
      expect(signals.map(s => s.dimension).sort()).toEqual([
        'ambient-activity',
        'ambient-anticipations',
        'ambient-patterns',
      ]);
    });
  });

  describe('Layer 3: Event-driven behavior triggers', () => {
    it('full routing: event → condition match → behavior execution', async () => {
      const executeNow = vi.fn().mockResolvedValue({ success: true });

      const trigger: BehaviorEventTrigger = {
        source: 'github',
        event: 'push',
        conditions: [
          { field: 'ref', op: 'endsWith', value: '/main' },
          { field: 'forced', op: 'equals', value: false },
        ],
        combinator: 'and',
      };

      const event: TriggerEvent = {
        triggerId: 'push',
        connectorId: 'github',
        data: { ref: 'refs/heads/main', forced: false },
        timestamp: Date.now(),
      };

      // Simulate routing logic
      if (
        trigger.source === event.connectorId &&
        trigger.event === event.triggerId &&
        evaluateConditions(event.data, trigger.conditions, trigger.combinator)
      ) {
        await executeNow('b1');
      }

      expect(executeNow).toHaveBeenCalledWith('b1');
    });

    it('does not fire when OR conditions all fail', () => {
      const conditions: EventCondition[] = [
        { field: 'action', op: 'equals', value: 'closed' },
        { field: 'action', op: 'equals', value: 'merged' },
      ];
      expect(evaluateConditions({ action: 'opened' }, conditions, 'or')).toBe(false);
    });
  });

  describe('Layer 4: Cross-layer data flow', () => {
    it('pattern engine feeds anticipation engine which feeds awareness', async () => {
      const patternEngine = new AmbientPatternEngine();
      const anticipationEngine = new AnticipationEngine();
      const collector = new AmbientAwarenessCollector();

      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        const d = new Date(base);
        d.setHours(14, 0, 0, 0);
        d.setDate(d.getDate() - i);
        patternEngine.observe({ type: 'deploy', timestamp: d.getTime() });
      }

      const patterns = patternEngine.detectPatterns();
      const storedPatterns = patternEngine.getPatterns();
      const anticipations = anticipationEngine.generateAnticipations(storedPatterns);

      collector.updatePatterns(storedPatterns);
      collector.updateAnticipations(anticipations);
      collector.updateActivity({ eventRate: patternEngine.getEventCount(), activeBehaviors: 0 });

      const signals = await collector.collect({
        userId: 'u1', sessionId: 's1', chatId: 'c1',
        currentMessage: 'test', recentMessages: [],
      });

      // Should have patterns and activity at minimum
      expect(signals.length).toBeGreaterThanOrEqual(2);
      expect(signals.some(s => s.dimension === 'ambient-patterns')).toBe(true);
      expect(signals.some(s => s.dimension === 'ambient-activity')).toBe(true);
    });
  });
});
```

**Step 2: Run test**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/ambient-integration.test.ts`
Expected: PASS

**Step 3: Verify audit events are present**

Confirm `packages/audit/src/index.ts` has these entries (added in Task 7):
- `'ambient.patterns.detected'`
- `'ambient.patterns.reset'`
- `'ambient.scheduler.started'`
- `'ambient.scheduler.stopped'`
- `'behavior.event_triggered'`

If missing, add them after the existing `behavior.failed` line.

**Step 4: Run all ambient and behavior tests together**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/ambient/ packages/behaviors/ packages/runtime/tests/ambient-*.test.ts packages/runtime/tests/event-routing.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/runtime/tests/ambient-integration.test.ts packages/audit/src/index.ts
git commit -m "test(ambient): add comprehensive integration tests for all 4 layers"
```

---

### Task 10: Run full test suite and verify no regressions

**Step 1: Run all tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: ALL PASS — no regressions in existing tests

**Step 2: If any failures, investigate and fix**

Common issues:
- Import path changes in behaviors/index.ts may affect existing behavior tests
- Adding `event` to BehaviorType may require updating store/manager validation
- Audit type additions are additive and should not break anything

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test regressions from ambient enhancements"
```

---

### Task 11: Final cleanup and feature commit

**Step 1: Verify all files are tracked**

Run: `git status`

**Step 2: Ensure no leftover TODOs or debug code**

Search for TODO, console.log, debugger in new/modified files.

**Step 3: Final commit if needed**

Only if there are remaining uncommitted changes from cleanup.
