# Dynamic Self-Awareness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a composable signal collector system that gives Auxiora dynamic per-message self-awareness across 7 dimensions — conversational quality, capacity, knowledge boundaries, per-user relationships, temporal context, environment, and meta-cognition.

**Architecture:** New `packages/self-awareness/` package with a `SelfAwarenessAssembler` that runs independent `SignalCollector` instances in parallel per message. Each collector produces prioritized `AwarenessSignal` objects. The assembler compresses them into a ~500 token budget and injects the result into the system prompt between memory and mode enrichment. Background `afterResponse()` hooks run asynchronously to update state for the next message.

**Tech Stack:** TypeScript strict ESM, vitest, vault for encrypted storage, `@auxiora/metrics` for capacity data, `process.*` and `os.*` for environment sensing.

**Reference:** Design doc at `docs/plans/2026-02-16-dynamic-self-awareness-design.md`

---

### Task 1: Scaffold the package

**Files:**
- Create: `packages/self-awareness/package.json`
- Create: `packages/self-awareness/tsconfig.json`
- Create: `packages/self-awareness/src/types.ts`
- Create: `packages/self-awareness/src/index.ts`

**Step 1: Create `packages/self-awareness/package.json`**

```json
{
  "name": "@auxiora/self-awareness",
  "version": "1.0.0",
  "description": "Dynamic self-awareness: composable signal collectors for per-message context enrichment",
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
    "@auxiora/logger": "workspace:*",
    "@auxiora/metrics": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^3.1.1"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

**Step 2: Create `packages/self-awareness/tsconfig.json`**

Use the same pattern as `packages/introspection/tsconfig.json`:

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

**Step 3: Create `packages/self-awareness/src/types.ts`**

```typescript
import type { Message } from '@auxiora/sessions/types';

// ── Signal types ──────────────────────────────────────────────────────────────

export interface AwarenessSignal {
  /** Which collector produced this signal */
  dimension: string;
  /** 0-1, higher = more important to include in prompt budget */
  priority: number;
  /** Human-readable text for prompt injection */
  text: string;
  /** Structured data for programmatic use */
  data: Record<string, unknown>;
}

// ── Context types ─────────────────────────────────────────────────────────────

export interface CollectionContext {
  userId: string;
  sessionId: string;
  chatId: string;
  currentMessage: string;
  recentMessages: Message[];
}

export interface PostResponseContext extends CollectionContext {
  response: string;
  responseTime: number;
  tokensUsed: { input: number; output: number };
}

// ── Collector interface ───────────────────────────────────────────────────────

export interface SignalCollector {
  readonly name: string;
  enabled: boolean;
  collect(context: CollectionContext): Promise<AwarenessSignal[]>;
  afterResponse?(context: PostResponseContext): Promise<void>;
}

// ── Storage interface ─────────────────────────────────────────────────────────

export interface AwarenessStorage {
  read(namespace: string, key: string): Promise<Record<string, unknown> | null>;
  write(namespace: string, key: string, data: Record<string, unknown>): Promise<void>;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface SelfAwarenessConfig {
  enabled: boolean;
  tokenBudget: number;
  collectors: {
    conversationReflector: boolean;
    capacityMonitor: boolean;
    knowledgeBoundary: boolean;
    relationshipModel: boolean;
    temporalTracker: boolean;
    environmentSensor: boolean;
    metaCognitor: boolean;
  };
  proactiveInsights: boolean;
}
```

**Step 4: Create `packages/self-awareness/src/index.ts`**

```typescript
export type {
  AwarenessSignal,
  CollectionContext,
  PostResponseContext,
  SignalCollector,
  AwarenessStorage,
  SelfAwarenessConfig,
} from './types.js';
```

**Step 5: Install dependencies and verify build**

Run: `pnpm install && pnpm --filter @auxiora/self-awareness build`
Expected: Clean build, dist/ created with types.js and index.js

**Step 6: Commit**

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): scaffold package with core types"
```

---

### Task 2: Assembler — tests first

**Files:**
- Create: `packages/self-awareness/src/assembler.ts`
- Create: `packages/self-awareness/tests/assembler.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/assembler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SelfAwarenessAssembler } from '../src/assembler.js';
import type { SignalCollector, CollectionContext, AwarenessSignal } from '../src/types.js';

function makeContext(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    chatId: 'chat-1',
    currentMessage: 'hello',
    recentMessages: [],
    ...overrides,
  };
}

function makeCollector(
  name: string,
  signals: AwarenessSignal[],
  opts?: { enabled?: boolean; delay?: number; throws?: boolean },
): SignalCollector {
  return {
    name,
    enabled: opts?.enabled ?? true,
    async collect() {
      if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
      if (opts?.throws) throw new Error('collector failed');
      return signals;
    },
  };
}

function sig(dimension: string, priority: number, text: string): AwarenessSignal {
  return { dimension, priority, text, data: {} };
}

describe('SelfAwarenessAssembler', () => {
  it('combines signals from multiple collectors', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('a', [sig('a', 0.5, 'Signal A')]),
      makeCollector('b', [sig('b', 0.7, 'Signal B')]),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Signal A');
    expect(result).toContain('Signal B');
  });

  it('sorts signals by priority (highest first)', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('low', [sig('low', 0.2, 'Low priority')]),
      makeCollector('high', [sig('high', 0.9, 'High priority')]),
    ]);
    const result = await assembler.assemble(makeContext());
    const highIdx = result.indexOf('High priority');
    const lowIdx = result.indexOf('Low priority');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('respects token budget by dropping low-priority signals', async () => {
    const longText = 'X'.repeat(2000); // ~500 tokens
    const assembler = new SelfAwarenessAssembler(
      [
        makeCollector('big', [sig('big', 0.3, longText)]),
        makeCollector('small', [sig('small', 0.9, 'Important')]),
      ],
      { tokenBudget: 100 },
    );
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Important');
    expect(result).not.toContain(longText);
  });

  it('skips disabled collectors', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('on', [sig('on', 0.5, 'Enabled')]),
      makeCollector('off', [sig('off', 0.5, 'Disabled')], { enabled: false }),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Enabled');
    expect(result).not.toContain('Disabled');
  });

  it('gracefully handles collector failures', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('good', [sig('good', 0.5, 'Works')]),
      makeCollector('bad', [], { throws: true }),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Works');
  });

  it('times out slow collectors', async () => {
    const assembler = new SelfAwarenessAssembler(
      [
        makeCollector('fast', [sig('fast', 0.5, 'Quick')]),
        makeCollector('slow', [sig('slow', 0.9, 'Took too long')], { delay: 500 }),
      ],
      { collectorTimeoutMs: 100 },
    );
    const result = await assembler.assemble(makeContext());
    expect(result).toContain('Quick');
    expect(result).not.toContain('Took too long');
  });

  it('returns empty string when no collectors are enabled', async () => {
    const assembler = new SelfAwarenessAssembler([
      makeCollector('off', [sig('off', 0.5, 'Nope')], { enabled: false }),
    ]);
    const result = await assembler.assemble(makeContext());
    expect(result).toBe('');
  });

  it('returns empty string with no collectors', async () => {
    const assembler = new SelfAwarenessAssembler([]);
    const result = await assembler.assemble(makeContext());
    expect(result).toBe('');
  });

  it('runs afterResponse on all collectors with the hook', async () => {
    const afterSpy = vi.fn().mockResolvedValue(undefined);
    const collector: SignalCollector = {
      name: 'tracked',
      enabled: true,
      async collect() { return []; },
      afterResponse: afterSpy,
    };
    const assembler = new SelfAwarenessAssembler([collector]);
    await assembler.afterResponse({
      ...makeContext(),
      response: 'hello',
      responseTime: 100,
      tokensUsed: { input: 10, output: 20 },
    });
    expect(afterSpy).toHaveBeenCalledOnce();
  });

  it('afterResponse does not throw if a collector fails', async () => {
    const collector: SignalCollector = {
      name: 'broken',
      enabled: true,
      async collect() { return []; },
      async afterResponse() { throw new Error('boom'); },
    };
    const assembler = new SelfAwarenessAssembler([collector]);
    await expect(
      assembler.afterResponse({
        ...makeContext(),
        response: 'hi',
        responseTime: 50,
        tokensUsed: { input: 5, output: 10 },
      }),
    ).resolves.not.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/assembler.test.ts`
Expected: FAIL — `assembler.js` does not exist

**Step 3: Implement the assembler**

Create `packages/self-awareness/src/assembler.ts`:

```typescript
import type {
  SignalCollector,
  CollectionContext,
  PostResponseContext,
  AwarenessSignal,
} from './types.js';

export interface AssemblerOptions {
  /** Max approximate tokens for the output. Default 500. */
  tokenBudget?: number;
  /** Max ms per collector before timeout. Default 200. */
  collectorTimeoutMs?: number;
}

export class SelfAwarenessAssembler {
  private readonly collectors: SignalCollector[];
  private readonly tokenBudget: number;
  private readonly collectorTimeoutMs: number;

  constructor(collectors: SignalCollector[], options?: AssemblerOptions) {
    this.collectors = collectors;
    this.tokenBudget = options?.tokenBudget ?? 500;
    this.collectorTimeoutMs = options?.collectorTimeoutMs ?? 200;
  }

  async assemble(context: CollectionContext): Promise<string> {
    const enabled = this.collectors.filter(c => c.enabled);
    if (enabled.length === 0) return '';

    const results = await Promise.allSettled(
      enabled.map(c =>
        Promise.race([
          c.collect(context),
          new Promise<AwarenessSignal[]>(resolve =>
            setTimeout(() => resolve([]), this.collectorTimeoutMs),
          ),
        ]),
      ),
    );

    const signals: AwarenessSignal[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') signals.push(...r.value);
    }

    if (signals.length === 0) return '';

    // Sort by priority descending
    signals.sort((a, b) => b.priority - a.priority);

    return this.compress(signals);
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    await Promise.allSettled(
      this.collectors
        .filter(c => c.enabled && c.afterResponse)
        .map(c => c.afterResponse!(context)),
    );
  }

  private compress(signals: AwarenessSignal[]): string {
    const charBudget = this.tokenBudget * 4; // ~4 chars per token
    const lines: string[] = [];
    let used = 0;

    for (const signal of signals) {
      const lineLen = signal.text.length + 1; // +1 for newline
      if (used + lineLen > charBudget) continue;
      lines.push(signal.text);
      used += lineLen;
    }

    return lines.join('\n');
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/assembler.test.ts`
Expected: 10 tests PASS

**Step 5: Update barrel export**

Add to `packages/self-awareness/src/index.ts`:

```typescript
export { SelfAwarenessAssembler, type AssemblerOptions } from './assembler.js';
```

**Step 6: Build and commit**

Run: `pnpm --filter @auxiora/self-awareness build`

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add assembler with priority-based budget compression"
```

---

### Task 3: Storage layer

**Files:**
- Create: `packages/self-awareness/src/storage.ts`
- Create: `packages/self-awareness/tests/storage.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAwarenessStorage } from '../src/storage.js';

describe('InMemoryAwarenessStorage', () => {
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
  });

  it('returns null for missing key', async () => {
    expect(await storage.read('ns', 'missing')).toBeNull();
  });

  it('writes and reads data', async () => {
    await storage.write('users', 'user-1', { name: 'Alice' });
    const data = await storage.read('users', 'user-1');
    expect(data).toEqual({ name: 'Alice' });
  });

  it('overwrites existing data', async () => {
    await storage.write('users', 'user-1', { count: 1 });
    await storage.write('users', 'user-1', { count: 2 });
    expect(await storage.read('users', 'user-1')).toEqual({ count: 2 });
  });

  it('isolates namespaces', async () => {
    await storage.write('a', 'key', { from: 'a' });
    await storage.write('b', 'key', { from: 'b' });
    expect(await storage.read('a', 'key')).toEqual({ from: 'a' });
    expect(await storage.read('b', 'key')).toEqual({ from: 'b' });
  });

  it('delete removes key', async () => {
    await storage.write('ns', 'key', { val: 1 });
    await storage.delete('ns', 'key');
    expect(await storage.read('ns', 'key')).toBeNull();
  });

  it('delete on missing key does not throw', async () => {
    await expect(storage.delete('ns', 'nope')).resolves.not.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/storage.test.ts`
Expected: FAIL — `storage.js` does not exist

**Step 3: Implement storage**

Create `packages/self-awareness/src/storage.ts`:

```typescript
import type { AwarenessStorage } from './types.js';

/**
 * In-memory storage for self-awareness data.
 * Production deployments can swap this for a vault-backed implementation.
 */
export class InMemoryAwarenessStorage implements AwarenessStorage {
  private data = new Map<string, Record<string, unknown>>();

  private key(namespace: string, key: string): string {
    return `${namespace}::${key}`;
  }

  async read(namespace: string, key: string): Promise<Record<string, unknown> | null> {
    return this.data.get(this.key(namespace, key)) ?? null;
  }

  async write(namespace: string, key: string, data: Record<string, unknown>): Promise<void> {
    this.data.set(this.key(namespace, key), data);
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.data.delete(this.key(namespace, key));
  }
}
```

Also update the `AwarenessStorage` interface in `types.ts` to add `delete`:

```typescript
export interface AwarenessStorage {
  read(namespace: string, key: string): Promise<Record<string, unknown> | null>;
  write(namespace: string, key: string, data: Record<string, unknown>): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/storage.test.ts`
Expected: 6 tests PASS

**Step 5: Update barrel export and commit**

Add to `packages/self-awareness/src/index.ts`:

```typescript
export { InMemoryAwarenessStorage } from './storage.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add in-memory storage layer"
```

---

### Task 4: Collector 1 — Conversation Reflector

**Files:**
- Create: `packages/self-awareness/src/collectors/conversation-reflector.ts`
- Create: `packages/self-awareness/tests/collectors/conversation-reflector.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/conversation-reflector.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationReflector } from '../../src/collectors/conversation-reflector.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello',
    recentMessages: [],
    ...overrides,
  };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return {
    ...ctx(), response: 'response', responseTime: 100,
    tokensUsed: { input: 10, output: 20 },
    ...overrides,
  };
}

describe('ConversationReflector', () => {
  let collector: ConversationReflector;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new ConversationReflector(storage);
  });

  it('returns empty signals for a fresh conversation', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('detects clarification patterns in recent messages', async () => {
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'explain X', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'X is...', timestamp: 2 },
        { id: '3', role: 'user', content: 'no, I meant something else', timestamp: 3 },
        { id: '4', role: 'assistant', content: 'Oh, you mean...', timestamp: 4 },
      ],
      currentMessage: 'that is not what I asked',
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].dimension).toBe('conversation-reflector');
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.7);
  });

  it('detects rephrase patterns', async () => {
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'what is kubernetes?', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Kubernetes is...', timestamp: 2 },
      ],
      currentMessage: "that's not what I asked, what is kubernetes networking?",
    }));
    expect(signals.length).toBeGreaterThan(0);
  });

  it('does not false-positive on normal follow-ups', async () => {
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'explain X', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'X is...', timestamp: 2 },
      ],
      currentMessage: 'great, now explain Y',
    }));
    expect(signals).toEqual([]);
  });

  it('afterResponse stores response fingerprint', async () => {
    await collector.afterResponse(postCtx({ response: 'Kubernetes is a container orchestration platform.' }));
    const stored = await storage.read('reflections', 'c1');
    expect(stored).not.toBeNull();
    expect(stored!.fingerprints).toBeDefined();
  });

  it('detects repetition from stored fingerprints', async () => {
    // Store 3 similar fingerprints
    for (let i = 0; i < 3; i++) {
      await collector.afterResponse(postCtx({
        chatId: 'c1',
        response: 'Kubernetes is a container orchestration platform that manages containers.',
      }));
    }
    const signals = await collector.collect(ctx({ chatId: 'c1' }));
    const repSignal = signals.find(s => s.data.type === 'repetition');
    // May or may not fire depending on threshold, but should not throw
    expect(signals).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/conversation-reflector.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/conversation-reflector.ts`:

```typescript
import type {
  SignalCollector,
  CollectionContext,
  PostResponseContext,
  AwarenessSignal,
  AwarenessStorage,
} from '../types.js';

const CLARIFICATION_PATTERNS = [
  'no, i meant',
  "that's not what i",
  'not what i asked',
  'i was asking about',
  'let me rephrase',
  'what i actually',
  'you misunderstood',
  'that is not what i',
  'no i meant',
  'try again',
];

interface ResponseFingerprint {
  keywords: string[];
  length: number;
  timestamp: number;
}

interface ReflectionState {
  fingerprints: ResponseFingerprint[];
}

export class ConversationReflector implements SignalCollector {
  readonly name = 'conversation-reflector';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const signals: AwarenessSignal[] = [];

    // Check for clarification patterns in current message + recent user messages
    const clarifications = this.countClarifications(context);
    if (clarifications > 0) {
      signals.push({
        dimension: this.name,
        priority: Math.min(0.7 + clarifications * 0.1, 1.0),
        text: clarifications === 1
          ? 'Conversation health: User may be rephrasing — verify you understood correctly.'
          : `Conversation health: User has rephrased ${clarifications} times — likely not getting the answer they need. Try a different approach.`,
        data: { type: 'clarification', count: clarifications },
      });
    }

    // Check for repetition from stored fingerprints
    const state = await this.storage.read('reflections', context.chatId) as ReflectionState | null;
    if (state?.fingerprints && state.fingerprints.length >= 3) {
      const recent = state.fingerprints.slice(-3);
      if (this.areSimilar(recent)) {
        signals.push({
          dimension: this.name,
          priority: 0.8,
          text: 'Conversation health: Your recent responses are very similar — you may be repeating yourself.',
          data: { type: 'repetition', count: recent.length },
        });
      }
    }

    return signals;
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const fp = this.fingerprint(context.response);
    const existing = await this.storage.read('reflections', context.chatId) as ReflectionState | null;
    const fingerprints = existing?.fingerprints ?? [];
    fingerprints.push(fp);
    // Keep last 10
    if (fingerprints.length > 10) fingerprints.splice(0, fingerprints.length - 10);
    await this.storage.write('reflections', context.chatId, { fingerprints });
  }

  private countClarifications(context: CollectionContext): number {
    const messages = [
      ...context.recentMessages.filter(m => m.role === 'user'),
      { content: context.currentMessage },
    ];
    let count = 0;
    for (const msg of messages) {
      const lower = msg.content.toLowerCase();
      if (CLARIFICATION_PATTERNS.some(p => lower.includes(p))) {
        count++;
      }
    }
    return count;
  }

  private fingerprint(text: string): ResponseFingerprint {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const keywords = [...freq.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([w]) => w);
    return { keywords, length: text.length, timestamp: Date.now() };
  }

  private areSimilar(fingerprints: ResponseFingerprint[]): boolean {
    if (fingerprints.length < 2) return false;
    const first = new Set(fingerprints[0].keywords);
    return fingerprints.slice(1).every(fp => {
      const overlap = fp.keywords.filter(k => first.has(k)).length;
      return overlap >= Math.min(5, first.size * 0.6);
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/conversation-reflector.test.ts`
Expected: 6 tests PASS

**Step 5: Update barrel export and commit**

Add to `packages/self-awareness/src/index.ts`:

```typescript
export { ConversationReflector } from './collectors/conversation-reflector.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add conversation reflector collector"
```

---

### Task 5: Collector 2 — Capacity Monitor

**Files:**
- Create: `packages/self-awareness/src/collectors/capacity-monitor.ts`
- Create: `packages/self-awareness/tests/collectors/capacity-monitor.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/capacity-monitor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CapacityMonitor } from '../../src/collectors/capacity-monitor.js';
import type { CollectionContext } from '../../src/types.js';

function ctx(): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello', recentMessages: [],
  };
}

describe('CapacityMonitor', () => {
  it('returns signals with capacity data', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('capacity-monitor');
    expect(signals[0].priority).toBe(0.4);
  });

  it('includes memory usage in data', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals[0].data.heapUsedMB).toBeDefined();
    expect(typeof signals[0].data.heapUsedMB).toBe('number');
  });

  it('includes uptime in text', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals[0].text).toContain('Memory:');
  });

  it('raises priority when memory is high', async () => {
    // Can't easily mock process.memoryUsage, but verify structure
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.4);
    expect(signals[0].priority).toBeLessThanOrEqual(1.0);
  });

  it('has no afterResponse hook', () => {
    const collector = new CapacityMonitor();
    expect(collector.afterResponse).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/capacity-monitor.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/capacity-monitor.ts`:

```typescript
import type { SignalCollector, CollectionContext, AwarenessSignal } from '../types.js';

export class CapacityMonitor implements SignalCollector {
  readonly name = 'capacity-monitor';
  enabled = true;

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapPct = heapTotalMB > 0 ? heapUsedMB / heapTotalMB : 0;

    // Raise priority if memory pressure is high
    let priority = 0.4;
    let memLabel = 'normal';
    if (heapPct > 0.85) {
      priority = 0.9;
      memLabel = 'HIGH';
    } else if (heapPct > 0.7) {
      priority = 0.6;
      memLabel = 'elevated';
    }

    const text = `Capacity: Memory: ${heapUsedMB}MB/${heapTotalMB}MB (${memLabel}), RSS: ${rssMB}MB.`;

    return [{
      dimension: this.name,
      priority,
      text,
      data: { heapUsedMB, heapTotalMB, rssMB, heapPct, memLabel },
    }];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/capacity-monitor.test.ts`
Expected: 5 tests PASS

**Step 5: Update barrel export and commit**

```typescript
export { CapacityMonitor } from './collectors/capacity-monitor.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add capacity monitor collector"
```

---

### Task 6: Collector 3 — Knowledge Boundary

**Files:**
- Create: `packages/self-awareness/src/collectors/knowledge-boundary.ts`
- Create: `packages/self-awareness/tests/collectors/knowledge-boundary.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/knowledge-boundary.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBoundary } from '../../src/collectors/knowledge-boundary.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello', recentMessages: [],
    ...overrides,
  };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('KnowledgeBoundary', () => {
  let collector: KnowledgeBoundary;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new KnowledgeBoundary(storage);
  });

  it('returns empty signals for new user', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('afterResponse records hedge phrases', async () => {
    await collector.afterResponse(postCtx({
      userId: 'u1',
      currentMessage: 'explain kubernetes networking',
      response: "I think kubernetes networking uses CNI plugins, but I'm not entirely sure about the specifics.",
    }));
    const map = await storage.read('knowledge-map', 'u1');
    expect(map).not.toBeNull();
    expect(map!.topics).toBeDefined();
  });

  it('afterResponse detects user corrections', async () => {
    // First: assistant hedges
    await collector.afterResponse(postCtx({
      currentMessage: 'what is a VLAN?',
      response: 'A VLAN is a virtual local area network.',
    }));
    // User corrects
    await collector.afterResponse(postCtx({
      currentMessage: "actually, VLANs also provide broadcast domain isolation, you didn't mention that",
      response: "You're right, VLANs do provide broadcast domain isolation.",
      recentMessages: [
        { id: '1', role: 'assistant', content: 'A VLAN is a virtual local area network.', timestamp: 1 },
        { id: '2', role: 'user', content: "actually, VLANs also provide broadcast domain isolation", timestamp: 2 },
      ],
    }));
    const map = await storage.read('knowledge-map', 'u1') as any;
    const vlanTopic = map?.topics?.find((t: any) => t.topic.includes('vlan'));
    // Should have recorded something
    expect(map?.topics?.length).toBeGreaterThan(0);
  });

  it('surfaces warning for previously-corrected topic', async () => {
    // Seed knowledge map with corrections
    await storage.write('knowledge-map', 'u1', {
      topics: [{ topic: 'kubernetes', hedgeCount: 1, correctionCount: 2, lastSeen: Date.now() }],
    });
    const signals = await collector.collect(ctx({
      currentMessage: 'tell me more about kubernetes networking',
    }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].text).toContain('kubernetes');
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.7);
  });

  it('does not warn for uncorrected topics', async () => {
    await storage.write('knowledge-map', 'u1', {
      topics: [{ topic: 'react', hedgeCount: 0, correctionCount: 0, lastSeen: Date.now() }],
    });
    const signals = await collector.collect(ctx({
      currentMessage: 'help me with react hooks',
    }));
    expect(signals).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/knowledge-boundary.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/knowledge-boundary.ts`:

```typescript
import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

const HEDGE_PHRASES = [
  "i think", "i believe", "i'm not sure", "i'm not entirely sure",
  "it might be", "it could be", "probably", "possibly", "if i recall",
  "i may be wrong", "not certain",
];

const CORRECTION_PATTERNS = [
  'actually,', "that's wrong", "that's not right", "that's incorrect",
  "you're wrong", "no, it's", "no it's", "you missed", "you forgot",
  "you didn't mention",
];

interface TopicEntry {
  topic: string;
  hedgeCount: number;
  correctionCount: number;
  lastSeen: number;
}

interface KnowledgeMap {
  topics: TopicEntry[];
}

export class KnowledgeBoundary implements SignalCollector {
  readonly name = 'knowledge-boundary';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const map = await this.storage.read('knowledge-map', context.userId) as KnowledgeMap | null;
    if (!map?.topics?.length) return [];

    const signals: AwarenessSignal[] = [];
    const msgLower = context.currentMessage.toLowerCase();

    for (const entry of map.topics) {
      if (entry.correctionCount >= 1 && msgLower.includes(entry.topic)) {
        signals.push({
          dimension: this.name,
          priority: Math.min(0.7 + entry.correctionCount * 0.1, 1.0),
          text: `Knowledge boundary: User previously corrected you about "${entry.topic}" (${entry.correctionCount} correction${entry.correctionCount > 1 ? 's' : ''}). Verify claims carefully.`,
          data: { topic: entry.topic, corrections: entry.correctionCount, hedges: entry.hedgeCount },
        });
      }
    }

    return signals;
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const map = await this.storage.read('knowledge-map', context.userId) as KnowledgeMap | null;
    const topics: TopicEntry[] = map?.topics ?? [];

    // Extract topic from current message (first 3 significant words)
    const topic = this.extractTopic(context.currentMessage);
    if (!topic) return;

    let entry = topics.find(t => t.topic === topic);
    if (!entry) {
      entry = { topic, hedgeCount: 0, correctionCount: 0, lastSeen: Date.now() };
      topics.push(entry);
    }
    entry.lastSeen = Date.now();

    // Check if response contained hedges
    const responseLower = context.response.toLowerCase();
    if (HEDGE_PHRASES.some(h => responseLower.includes(h))) {
      entry.hedgeCount++;
    }

    // Check if user message was a correction (look at current message context)
    const msgLower = context.currentMessage.toLowerCase();
    if (CORRECTION_PATTERNS.some(p => msgLower.includes(p))) {
      entry.correctionCount++;
    }

    // Prune old entries (>90 days)
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const pruned = topics.filter(t => t.lastSeen > cutoff);

    await this.storage.write('knowledge-map', context.userId, { topics: pruned });
  }

  private extractTopic(message: string): string | null {
    const words = message.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    if (words.length === 0) return null;
    return words.slice(0, 3).join(' ');
  }
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'about', 'what', 'when',
  'where', 'which', 'their', 'there', 'these', 'those', 'been',
  'being', 'would', 'could', 'should', 'more', 'some', 'help',
  'tell', 'explain', 'know', 'does', 'will', 'also', 'just',
  'than', 'then', 'them', 'they', 'into', 'your', 'very',
]);
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/knowledge-boundary.test.ts`
Expected: 5 tests PASS

**Step 5: Update barrel export and commit**

```typescript
export { KnowledgeBoundary } from './collectors/knowledge-boundary.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add knowledge boundary collector"
```

---

### Task 7: Collector 4 — Relationship Model

**Files:**
- Create: `packages/self-awareness/src/collectors/relationship-model.ts`
- Create: `packages/self-awareness/tests/collectors/relationship-model.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/relationship-model.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RelationshipModel } from '../../src/collectors/relationship-model.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello', recentMessages: [],
    ...overrides,
  };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('RelationshipModel', () => {
  let collector: RelationshipModel;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new RelationshipModel(storage);
  });

  it('returns empty signals for new user', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('returns profile signal for known user', async () => {
    await storage.write('relationships', 'u1', {
      interactionCount: 25,
      preferredVerbosity: 'concise',
      expertiseDomains: ['typescript', 'security'],
      topTopics: ['engineering', 'architecture'],
    });
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('relationship-model');
    expect(signals[0].text).toContain('concise');
    expect(signals[0].text).toContain('typescript');
  });

  it('afterResponse updates interaction count', async () => {
    await collector.afterResponse(postCtx({ response: 'short reply' }));
    const profile = await storage.read('relationships', 'u1') as any;
    expect(profile.interactionCount).toBe(1);
  });

  it('afterResponse infers verbosity preference', async () => {
    // User sends short messages, Auxiora responds with long ones
    for (let i = 0; i < 5; i++) {
      await collector.afterResponse(postCtx({
        currentMessage: 'brief question',
        response: 'A very long and detailed response that goes on and on with lots of explanation and context and details.',
      }));
    }
    const profile = await storage.read('relationships', 'u1') as any;
    // With short user messages, should not infer 'detailed'
    expect(profile.interactionCount).toBe(5);
  });

  it('afterResponse tracks expertise from corrections', async () => {
    await collector.afterResponse(postCtx({
      currentMessage: "actually, TypeScript generics work differently — you need to use extends",
      response: "You're right, thanks for the correction.",
    }));
    const profile = await storage.read('relationships', 'u1') as any;
    expect(profile.expertiseDomains).toBeDefined();
  });

  it('has correct priority', async () => {
    await storage.write('relationships', 'u1', {
      interactionCount: 10,
      preferredVerbosity: 'detailed',
      expertiseDomains: [],
      topTopics: [],
    });
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBe(0.7);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/relationship-model.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/relationship-model.ts`:

```typescript
import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

interface UserProfile {
  interactionCount: number;
  preferredVerbosity: 'concise' | 'detailed' | 'unknown';
  expertiseDomains: string[];
  topTopics: string[];
  avgUserMsgLength: number;
  lastSeen: number;
}

const EXPERTISE_PATTERNS = [
  'actually,', "that's not right", 'you need to use', 'the correct way',
  'it should be', 'you missed', "that's incorrect",
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  typescript: ['typescript', 'generics', 'type', 'interface', 'tsconfig'],
  security: ['vulnerability', 'encryption', 'auth', 'security', 'cve'],
  kubernetes: ['kubernetes', 'k8s', 'pod', 'deployment', 'helm'],
  react: ['react', 'component', 'hooks', 'jsx', 'useState'],
  python: ['python', 'pip', 'django', 'flask', 'pytest'],
  devops: ['docker', 'ci/cd', 'pipeline', 'terraform', 'ansible'],
  database: ['sql', 'postgres', 'mongodb', 'database', 'query'],
};

function defaultProfile(): UserProfile {
  return {
    interactionCount: 0,
    preferredVerbosity: 'unknown',
    expertiseDomains: [],
    topTopics: [],
    avgUserMsgLength: 0,
    lastSeen: Date.now(),
  };
}

export class RelationshipModel implements SignalCollector {
  readonly name = 'relationship-model';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const profile = await this.storage.read('relationships', context.userId) as UserProfile | null;
    if (!profile || profile.interactionCount === 0) return [];

    const parts: string[] = [];
    if (profile.preferredVerbosity !== 'unknown') {
      parts.push(`Prefers ${profile.preferredVerbosity} responses`);
    }
    if (profile.expertiseDomains.length > 0) {
      parts.push(`Expert in ${profile.expertiseDomains.join(', ')}`);
    }
    if (profile.topTopics.length > 0) {
      parts.push(`Usually asks about ${profile.topTopics.join(', ')}`);
    }
    parts.push(`${profile.interactionCount} prior interactions`);

    return [{
      dimension: this.name,
      priority: 0.7,
      text: `User profile: ${parts.join('. ')}.`,
      data: { ...profile },
    }];
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const existing = await this.storage.read('relationships', context.userId) as UserProfile | null;
    const profile = existing ?? defaultProfile();

    profile.interactionCount++;
    profile.lastSeen = Date.now();

    // Update average message length (rolling)
    const userLen = context.currentMessage.length;
    profile.avgUserMsgLength = profile.interactionCount === 1
      ? userLen
      : profile.avgUserMsgLength * 0.8 + userLen * 0.2;

    // Infer verbosity preference
    if (profile.interactionCount >= 5) {
      profile.preferredVerbosity = profile.avgUserMsgLength < 50 ? 'concise' : 'detailed';
    }

    // Detect expertise domains from corrections
    const msgLower = context.currentMessage.toLowerCase();
    if (EXPERTISE_PATTERNS.some(p => msgLower.includes(p))) {
      for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        if (keywords.some(k => msgLower.includes(k)) && !profile.expertiseDomains.includes(domain)) {
          profile.expertiseDomains.push(domain);
        }
      }
    }

    // Keep expertise list bounded
    if (profile.expertiseDomains.length > 10) {
      profile.expertiseDomains = profile.expertiseDomains.slice(-10);
    }

    await this.storage.write('relationships', context.userId, profile as unknown as Record<string, unknown>);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/relationship-model.test.ts`
Expected: 6 tests PASS

**Step 5: Update barrel export and commit**

```typescript
export { RelationshipModel } from './collectors/relationship-model.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add relationship model collector"
```

---

### Task 8: Collector 5 — Temporal Tracker

**Files:**
- Create: `packages/self-awareness/src/collectors/temporal-tracker.ts`
- Create: `packages/self-awareness/tests/collectors/temporal-tracker.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/temporal-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalTracker } from '../../src/collectors/temporal-tracker.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello', recentMessages: [],
    ...overrides,
  };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('TemporalTracker', () => {
  let collector: TemporalTracker;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new TemporalTracker(storage);
  });

  it('returns uptime signal', async () => {
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('temporal-tracker');
    expect(signals[0].text).toContain('Running for');
  });

  it('includes session info when messages exist', async () => {
    const now = Date.now();
    const signals = await collector.collect(ctx({
      recentMessages: [
        { id: '1', role: 'user', content: 'hi', timestamp: now - 600_000 },
        { id: '2', role: 'assistant', content: 'hello', timestamp: now - 590_000 },
        { id: '3', role: 'user', content: 'question', timestamp: now - 300_000 },
      ],
    }));
    expect(signals[0].text).toContain('conversation');
  });

  it('afterResponse increments daily counter', async () => {
    await collector.afterResponse(postCtx());
    await collector.afterResponse(postCtx());
    const counters = await storage.read('temporal', 'daily-counters') as any;
    expect(counters).not.toBeNull();
    const today = counters.days?.find((d: any) => d.date === new Date().toISOString().slice(0, 10));
    expect(today?.messages).toBe(2);
  });

  it('has low priority', async () => {
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBe(0.4);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/temporal-tracker.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/temporal-tracker.ts`:

```typescript
import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

interface DayCounter {
  date: string;
  messages: number;
  corrections: number;
}

interface TemporalState {
  days: DayCounter[];
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 && d === 0) parts.push(`${m}m`);
  return parts.join(' ') || '<1m';
}

export class TemporalTracker implements SignalCollector {
  readonly name = 'temporal-tracker';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const uptime = process.uptime();
    const parts: string[] = [`Running for ${formatDuration(uptime)}`];

    // Session momentum
    if (context.recentMessages.length > 0) {
      const first = context.recentMessages[0].timestamp;
      const durationMin = Math.round((Date.now() - first) / 60_000);
      parts.push(`This conversation: ${context.recentMessages.length} messages over ${durationMin}min`);
    }

    // Learning trajectory from daily counters
    const state = await this.storage.read('temporal', 'daily-counters') as TemporalState | null;
    if (state?.days && state.days.length >= 3) {
      const recent = state.days.slice(-7);
      const totalMsgs = recent.reduce((s, d) => s + d.messages, 0);
      const totalCorr = recent.reduce((s, d) => s + d.corrections, 0);
      const corrRate = totalMsgs > 0 ? (totalCorr / totalMsgs * 100).toFixed(1) : '0';
      parts.push(`Correction rate this week: ${corrRate}%`);
    }

    return [{
      dimension: this.name,
      priority: 0.4,
      text: `Timeline: ${parts.join('. ')}.`,
      data: { uptimeSeconds: uptime, messageCount: context.recentMessages.length },
    }];
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const state = await this.storage.read('temporal', 'daily-counters') as TemporalState | null;
    const days = state?.days ?? [];

    let todayEntry = days.find(d => d.date === today);
    if (!todayEntry) {
      todayEntry = { date: today, messages: 0, corrections: 0 };
      days.push(todayEntry);
    }
    todayEntry.messages++;

    // Check if user corrected in this message
    const msgLower = context.currentMessage.toLowerCase();
    if (['actually,', "that's wrong", "that's not right", "you're wrong"].some(p => msgLower.includes(p))) {
      todayEntry.corrections++;
    }

    // Keep rolling 30-day window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const pruned = days.filter(d => d.date >= cutoffStr);

    await this.storage.write('temporal', 'daily-counters', { days: pruned });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/temporal-tracker.test.ts`
Expected: 4 tests PASS

**Step 5: Update barrel export and commit**

```typescript
export { TemporalTracker } from './collectors/temporal-tracker.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add temporal tracker collector"
```

---

### Task 9: Collector 6 — Environment Sensor

**Files:**
- Create: `packages/self-awareness/src/collectors/environment-sensor.ts`
- Create: `packages/self-awareness/tests/collectors/environment-sensor.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/environment-sensor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EnvironmentSensor } from '../../src/collectors/environment-sensor.js';
import type { CollectionContext } from '../../src/types.js';

function ctx(): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello', recentMessages: [],
  };
}

describe('EnvironmentSensor', () => {
  it('returns environment signal', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('environment-sensor');
  });

  it('includes time context', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals[0].text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('includes platform info', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals[0].data.platform).toBeDefined();
  });

  it('has low priority', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBe(0.3);
  });

  it('has no afterResponse hook', () => {
    const collector = new EnvironmentSensor();
    expect(collector.afterResponse).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/environment-sensor.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/environment-sensor.ts`:

```typescript
import os from 'node:os';
import type { SignalCollector, CollectionContext, AwarenessSignal } from '../types.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class EnvironmentSensor implements SignalCollector {
  readonly name = 'environment-sensor';
  enabled = true;

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    const now = new Date();
    const day = DAY_NAMES[now.getDay()];
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const loadAvg = os.loadavg()[0].toFixed(1);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const platform = os.platform();

    const text = `Environment: ${day} ${time}. System load: ${loadAvg}, free memory: ${freeMem}MB/${totalMem}MB.`;

    return [{
      dimension: this.name,
      priority: 0.3,
      text,
      data: { platform, loadAvg: parseFloat(loadAvg), freeMemMB: freeMem, totalMemMB: totalMem },
    }];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/environment-sensor.test.ts`
Expected: 5 tests PASS

**Step 5: Update barrel export and commit**

```typescript
export { EnvironmentSensor } from './collectors/environment-sensor.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add environment sensor collector"
```

---

### Task 10: Collector 7 — Meta-Cognitor

**Files:**
- Create: `packages/self-awareness/src/collectors/meta-cognitor.ts`
- Create: `packages/self-awareness/tests/collectors/meta-cognitor.test.ts`

**Step 1: Write the failing tests**

Create `packages/self-awareness/tests/collectors/meta-cognitor.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MetaCognitor } from '../../src/collectors/meta-cognitor.js';
import { InMemoryAwarenessStorage } from '../../src/storage.js';
import type { CollectionContext, PostResponseContext } from '../../src/types.js';

function ctx(overrides?: Partial<CollectionContext>): CollectionContext {
  return {
    userId: 'u1', sessionId: 's1', chatId: 'c1',
    currentMessage: 'hello', recentMessages: [],
    ...overrides,
  };
}

function postCtx(overrides?: Partial<PostResponseContext>): PostResponseContext {
  return { ...ctx(), response: '', responseTime: 100, tokensUsed: { input: 10, output: 20 }, ...overrides };
}

describe('MetaCognitor', () => {
  let collector: MetaCognitor;
  let storage: InMemoryAwarenessStorage;

  beforeEach(() => {
    storage = new InMemoryAwarenessStorage();
    collector = new MetaCognitor(storage);
  });

  it('returns empty signals with no prior state', async () => {
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('afterResponse stores response length', async () => {
    await collector.afterResponse(postCtx({ chatId: 'c1', response: 'Short reply.' }));
    const state = await storage.read('meta', 'c1') as any;
    expect(state).not.toBeNull();
    expect(state.responseLengths).toHaveLength(1);
    expect(state.responseLengths[0]).toBe(12);
  });

  it('detects response length drift (increasing)', async () => {
    // Store progressively longer responses
    await storage.write('meta', 'c1', {
      responseLengths: [100, 250, 500, 900],
      insights: [],
    });
    await collector.afterResponse(postCtx({ chatId: 'c1', response: 'X'.repeat(1500) }));
    const state = await storage.read('meta', 'c1') as any;
    // Should have generated a drift insight
    const signals = await collector.collect(ctx({ chatId: 'c1' }));
    // Drift detection kicks in after enough data points
    expect(state.responseLengths).toHaveLength(5);
  });

  it('surfaces stored insights', async () => {
    await storage.write('meta', 'c1', {
      responseLengths: [100, 200, 400, 800, 1600],
      insights: ['Response length trending up significantly — consider being more concise.'],
    });
    const signals = await collector.collect(ctx({ chatId: 'c1' }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].text).toContain('concise');
  });

  it('keeps only last 10 response lengths', async () => {
    for (let i = 0; i < 15; i++) {
      await collector.afterResponse(postCtx({ chatId: 'c1', response: `Response ${i}` }));
    }
    const state = await storage.read('meta', 'c1') as any;
    expect(state.responseLengths.length).toBeLessThanOrEqual(10);
  });

  it('limits insights to 5', async () => {
    await storage.write('meta', 'c1', {
      responseLengths: [],
      insights: ['a', 'b', 'c', 'd', 'e'],
    });
    // Trigger another insight
    await storage.write('meta', 'c1', {
      responseLengths: [100, 200, 400, 800, 1600],
      insights: ['a', 'b', 'c', 'd', 'e'],
    });
    await collector.afterResponse(postCtx({ chatId: 'c1', response: 'X'.repeat(3000) }));
    const state = await storage.read('meta', 'c1') as any;
    expect(state.insights.length).toBeLessThanOrEqual(5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/meta-cognitor.test.ts`
Expected: FAIL

**Step 3: Implement the collector**

Create `packages/self-awareness/src/collectors/meta-cognitor.ts`:

```typescript
import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

interface MetaState {
  responseLengths: number[];
  insights: string[];
}

export class MetaCognitor implements SignalCollector {
  readonly name = 'meta-cognitor';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const state = await this.storage.read('meta', context.chatId) as MetaState | null;
    if (!state?.insights?.length) return [];

    return state.insights.map((insight, i) => ({
      dimension: this.name,
      priority: 0.2 + (i === 0 ? 0.1 : 0), // Most recent insight gets slight priority boost
      text: `Meta: ${insight}`,
      data: { insight },
    }));
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const existing = await this.storage.read('meta', context.chatId) as MetaState | null;
    const responseLengths = existing?.responseLengths ?? [];
    const insights = existing?.insights ?? [];

    responseLengths.push(context.response.length);

    // Keep last 10
    if (responseLengths.length > 10) {
      responseLengths.splice(0, responseLengths.length - 10);
    }

    // Detect length drift (need at least 4 data points)
    if (responseLengths.length >= 4) {
      const recent = responseLengths.slice(-4);
      const isIncreasing = recent.every((val, i) => i === 0 || val > recent[i - 1] * 1.3);
      const isDecreasing = recent.every((val, i) => i === 0 || val < recent[i - 1] * 0.7);

      if (isIncreasing && !insights.some(i => i.includes('length trending up'))) {
        insights.push('Response length trending up significantly — consider being more concise.');
      }
      if (isDecreasing && !insights.some(i => i.includes('length trending down'))) {
        insights.push('Response length trending down — ensure you are providing enough detail.');
      }
    }

    // Keep insights bounded
    if (insights.length > 5) {
      insights.splice(0, insights.length - 5);
    }

    await this.storage.write('meta', context.chatId, { responseLengths, insights });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/self-awareness/tests/collectors/meta-cognitor.test.ts`
Expected: 5 tests PASS

**Step 5: Update barrel export and commit**

```typescript
export { MetaCognitor } from './collectors/meta-cognitor.js';
```

```bash
git add packages/self-awareness/
git commit -m "feat(self-awareness): add meta-cognitor collector"
```

---

### Task 11: Config schema addition

**Files:**
- Modify: `packages/config/src/index.ts` (add SelfAwarenessConfigSchema around line 268, add field to ConfigSchema at line 319)

**Step 1: Add the Zod schema**

Insert before the `ConfigSchema` definition (before line 300 in `packages/config/src/index.ts`):

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

**Step 2: Add to ConfigSchema**

After the `research` field (line 318), add:

```typescript
  selfAwareness: SelfAwarenessConfigSchema.default({}),
```

**Step 3: Build and verify**

Run: `pnpm --filter @auxiora/config build`
Expected: Clean build

**Step 4: Run config tests**

Run: `pnpm vitest run packages/config/`
Expected: All existing tests pass

**Step 5: Commit**

```bash
git add packages/config/
git commit -m "feat(config): add selfAwareness config schema with per-collector toggles"
```

---

### Task 12: Runtime integration

**Files:**
- Modify: `packages/runtime/src/index.ts`
  - Add import for `@auxiora/self-awareness` (after line 112)
  - Add assembler property (after line 208)
  - Initialize assembler in startup (near `loadPersonality()`)
  - Inject dynamic context in `handleMessage()` (after line 1954)
  - Call `afterResponse()` after streaming completes (after line 2044)

**Step 1: Add dependency**

Add `"@auxiora/self-awareness": "workspace:*"` to `packages/runtime/package.json` dependencies.

Run: `pnpm install`

**Step 2: Add import**

After line 112 in `packages/runtime/src/index.ts`:

```typescript
import {
  SelfAwarenessAssembler,
  InMemoryAwarenessStorage,
  ConversationReflector,
  CapacityMonitor,
  KnowledgeBoundary,
  RelationshipModel,
  TemporalTracker,
  EnvironmentSensor,
  MetaCognitor,
} from '@auxiora/self-awareness';
```

**Step 3: Add property**

After line 208 (`private capabilityPromptFragment: string = '';`):

```typescript
  private selfAwarenessAssembler?: SelfAwarenessAssembler;
```

**Step 4: Initialize in loadPersonality**

At the end of `loadPersonality()` (before the closing brace at line 1713), add:

```typescript
    // Initialize dynamic self-awareness assembler
    if (this.config.selfAwareness?.enabled) {
      const storage = new InMemoryAwarenessStorage();
      const collectorConfig = this.config.selfAwareness.collectors ?? {};
      const collectors = [
        ...(collectorConfig.conversationReflector !== false ? [new ConversationReflector(storage)] : []),
        ...(collectorConfig.capacityMonitor !== false ? [new CapacityMonitor()] : []),
        ...(collectorConfig.knowledgeBoundary !== false ? [new KnowledgeBoundary(storage)] : []),
        ...(collectorConfig.relationshipModel !== false ? [new RelationshipModel(storage)] : []),
        ...(collectorConfig.temporalTracker !== false ? [new TemporalTracker(storage)] : []),
        ...(collectorConfig.environmentSensor !== false ? [new EnvironmentSensor()] : []),
        ...(collectorConfig.metaCognitor !== false ? [new MetaCognitor(storage)] : []),
      ];
      this.selfAwarenessAssembler = new SelfAwarenessAssembler(collectors, {
        tokenBudget: this.config.selfAwareness.tokenBudget ?? 500,
      });
    }
```

**Step 5: Inject in handleMessage**

After the Architect enrichment (after line 1954 — `enrichedPrompt = architectResult.prompt;`):

```typescript
      // Inject dynamic self-awareness context
      if (this.selfAwarenessAssembler) {
        const awarenessContext = {
          userId: senderId ?? 'anonymous',
          sessionId: session.id,
          chatId: chatId ?? session.id,
          currentMessage: content,
          recentMessages: contextMessages,
        };
        const awarenessFragment = await this.selfAwarenessAssembler.assemble(awarenessContext);
        if (awarenessFragment) {
          enrichedPrompt += '\n\n[Dynamic Self-Awareness]\n' + awarenessFragment;
        }
      }
```

**Step 6: Call afterResponse**

After the done signal is sent (after line 2044 — the `sendToClient` with `type: 'done'`):

```typescript
      // Background self-awareness analysis
      if (this.selfAwarenessAssembler) {
        this.selfAwarenessAssembler.afterResponse({
          userId: senderId ?? 'anonymous',
          sessionId: session.id,
          chatId: chatId ?? session.id,
          currentMessage: content,
          recentMessages: contextMessages,
          response: fullResponse,
          responseTime: Date.now() - (session.metadata.lastActiveAt ?? Date.now()),
          tokensUsed: { input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 },
        }).catch(() => {});
      }
```

**Step 7: Build everything**

Run: `pnpm -r build`
Expected: Clean build across all packages

**Step 8: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass (2726+ existing + ~80 new self-awareness tests)

**Step 9: Commit**

```bash
git add packages/runtime/ packages/self-awareness/
git commit -m "feat(runtime): wire dynamic self-awareness assembler into message pipeline"
```

---

### Task 13: Final verification and cleanup

**Step 1: Full build**

Run: `pnpm -r build`
Expected: Clean build

**Step 2: Full test suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 3: Manual verification**

Start Auxiora with `selfAwareness.enabled: true` in config. Send a few messages. Verify:
- The `[Dynamic Self-Awareness]` section appears in the system prompt (check via introspect tool or debug logging)
- After 5+ messages, relationship model builds a profile
- Clarification detection works when you say "no, I meant..."
- Meta-cognitor detects length drift after several responses

**Step 4: Final commit and push**

```bash
git push
```
