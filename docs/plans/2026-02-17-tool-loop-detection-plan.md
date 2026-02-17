# Tool Loop Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 4-detector sliding-window tool loop detection system that catches stuck tool loops early, saving tokens and money.

**Architecture:** Single new file `packages/runtime/src/tool-loop-detection.ts` exporting pure functions. Integrated into the existing `executeWithTools()` loop in `packages/runtime/src/index.ts`. Ephemeral per-execution state (no persistence). TDD — tests first.

**Tech Stack:** TypeScript strict ESM, Node.js `crypto` for SHA-256 hashing, vitest for tests.

---

### Task 1: Hashing Utilities

**Files:**
- Create: `packages/runtime/src/tool-loop-detection.ts`
- Create: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write the failing tests for hashing**

```typescript
// packages/runtime/tests/tool-loop-detection.test.ts
import { describe, it, expect } from 'vitest';
import { hashToolCall, hashOutcome } from '../src/tool-loop-detection.js';

describe('Tool Loop Detection — Hashing', () => {
  it('should produce deterministic hash for same tool+args', () => {
    const h1 = hashToolCall('bash', { command: 'ls', timeout: 30 });
    const h2 = hashToolCall('bash', { command: 'ls', timeout: 30 });
    expect(h1).toBe(h2);
  });

  it('should produce same hash regardless of key order', () => {
    const h1 = hashToolCall('bash', { command: 'ls', timeout: 30 });
    const h2 = hashToolCall('bash', { timeout: 30, command: 'ls' });
    expect(h1).toBe(h2);
  });

  it('should produce different hash for different args', () => {
    const h1 = hashToolCall('bash', { command: 'ls' });
    const h2 = hashToolCall('bash', { command: 'pwd' });
    expect(h1).not.toBe(h2);
  });

  it('should produce different hash for different tool names', () => {
    const h1 = hashToolCall('bash', { command: 'ls' });
    const h2 = hashToolCall('web_search', { command: 'ls' });
    expect(h1).not.toBe(h2);
  });

  it('should handle nested objects with stable sorting', () => {
    const h1 = hashToolCall('tool', { a: { z: 1, a: 2 }, b: 3 });
    const h2 = hashToolCall('tool', { b: 3, a: { a: 2, z: 1 } });
    expect(h1).toBe(h2);
  });

  it('should handle null, undefined, and empty args', () => {
    expect(() => hashToolCall('tool', null)).not.toThrow();
    expect(() => hashToolCall('tool', undefined)).not.toThrow();
    expect(() => hashToolCall('tool', {})).not.toThrow();
  });

  it('should produce deterministic outcome hash', () => {
    const h1 = hashOutcome('Success: file created');
    const h2 = hashOutcome('Success: file created');
    expect(h1).toBe(h2);
  });

  it('should truncate long outcomes before hashing', () => {
    const long1 = 'x'.repeat(10000);
    const long2 = 'x'.repeat(10000);
    // Should not throw and should be deterministic
    expect(hashOutcome(long1)).toBe(hashOutcome(long2));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/runtime/src/tool-loop-detection.ts
import { createHash } from 'node:crypto';

const OUTCOME_TRUNCATE_LENGTH = 4096;

/**
 * Recursively sorts object keys for deterministic JSON serialization.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort();
  return '{' + sorted.map(k =>
    JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])
  ).join(',') + '}';
}

/**
 * SHA-256 hash of tool name + stable-sorted args for fingerprinting calls.
 */
export function hashToolCall(toolName: string, args: unknown): string {
  const input = toolName + ':' + stableStringify(args);
  return createHash('sha256').update(input).digest('hex');
}

/**
 * SHA-256 hash of a tool result string, truncated for performance.
 */
export function hashOutcome(result: string): string {
  const truncated = result.length > OUTCOME_TRUNCATE_LENGTH
    ? result.slice(0, OUTCOME_TRUNCATE_LENGTH)
    : result;
  return createHash('sha256').update(truncated).digest('hex');
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-loop-detection.ts packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "feat(runtime): add tool loop detection hashing utilities"
```

---

### Task 2: State Management & Recording

**Files:**
- Modify: `packages/runtime/src/tool-loop-detection.ts`
- Modify: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write the failing tests**

Add to the test file:

```typescript
import {
  hashToolCall,
  hashOutcome,
  createLoopDetectionState,
  recordToolCall,
  recordToolOutcome,
} from '../src/tool-loop-detection.js';
import type { LoopDetectionState } from '../src/tool-loop-detection.js';

describe('Tool Loop Detection — State & Recording', () => {
  it('should create state with default config', () => {
    const state = createLoopDetectionState();
    expect(state.window).toEqual([]);
    expect(state.warnedPatterns.size).toBe(0);
    expect(state.config.windowSize).toBe(30);
  });

  it('should create state with custom config', () => {
    const state = createLoopDetectionState({ windowSize: 10, genericRepeatWarn: 3 });
    expect(state.config.windowSize).toBe(10);
    expect(state.config.genericRepeatWarn).toBe(3);
    // Other values should still have defaults
    expect(state.config.genericRepeatCritical).toBe(10);
  });

  it('should record tool calls into the sliding window', () => {
    const state = createLoopDetectionState();
    recordToolCall(state, 'call-1', 'bash', { command: 'ls' });
    expect(state.window).toHaveLength(1);
    expect(state.window[0].toolName).toBe('bash');
    expect(state.window[0].toolCallId).toBe('call-1');
  });

  it('should evict oldest entries when window is full', () => {
    const state = createLoopDetectionState({ windowSize: 3 });
    recordToolCall(state, 'c1', 'a', {});
    recordToolCall(state, 'c2', 'b', {});
    recordToolCall(state, 'c3', 'c', {});
    recordToolCall(state, 'c4', 'd', {});
    expect(state.window).toHaveLength(3);
    expect(state.window[0].toolCallId).toBe('c2');
    expect(state.window[2].toolCallId).toBe('c4');
  });

  it('should record outcome hash matched by toolCallId', () => {
    const state = createLoopDetectionState();
    recordToolCall(state, 'c1', 'bash', { command: 'ls' });
    recordToolOutcome(state, 'c1', 'file1.txt\nfile2.txt');
    expect(state.window[0].outcomeHash).toBeDefined();
    expect(state.window[0].outcomeHash).toBe(hashOutcome('file1.txt\nfile2.txt'));
  });

  it('should ignore outcome for unknown toolCallId', () => {
    const state = createLoopDetectionState();
    recordToolCall(state, 'c1', 'bash', { command: 'ls' });
    recordToolOutcome(state, 'unknown-id', 'result');
    expect(state.window[0].outcomeHash).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify new ones fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: FAIL — `createLoopDetectionState` not exported

**Step 3: Implement state management**

Add to `tool-loop-detection.ts`:

```typescript
export interface ToolCallEntry {
  toolName: string;
  argsHash: string;
  toolCallId: string;
  timestamp: number;
  outcomeHash?: string;
}

export interface LoopDetectionConfig {
  windowSize: number;
  genericRepeatWarn: number;
  genericRepeatCritical: number;
  noProgressWarn: number;
  noProgressCritical: number;
  pingPongWarnCycles: number;
  pingPongCriticalCycles: number;
  circuitBreakerLimit: number;
}

export interface LoopDetectionState {
  window: ToolCallEntry[];
  warnedPatterns: Set<string>;
  config: LoopDetectionConfig;
}

const DEFAULT_CONFIG: LoopDetectionConfig = {
  windowSize: 30,
  genericRepeatWarn: 5,
  genericRepeatCritical: 10,
  noProgressWarn: 8,
  noProgressCritical: 15,
  pingPongWarnCycles: 3,
  pingPongCriticalCycles: 5,
  circuitBreakerLimit: 20,
};

export function createLoopDetectionState(
  config?: Partial<LoopDetectionConfig>
): LoopDetectionState {
  return {
    window: [],
    warnedPatterns: new Set(),
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

export function recordToolCall(
  state: LoopDetectionState,
  toolCallId: string,
  toolName: string,
  args: unknown,
): void {
  const entry: ToolCallEntry = {
    toolName,
    argsHash: hashToolCall(toolName, args),
    toolCallId,
    timestamp: Date.now(),
  };
  state.window.push(entry);
  if (state.window.length > state.config.windowSize) {
    state.window.shift();
  }
}

export function recordToolOutcome(
  state: LoopDetectionState,
  toolCallId: string,
  result: string,
): void {
  const entry = state.window.findLast(e => e.toolCallId === toolCallId);
  if (entry) {
    entry.outcomeHash = hashOutcome(result);
  }
}
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-loop-detection.ts packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "feat(runtime): add tool loop state management and recording"
```

---

### Task 3: Generic Repeat Detector

**Files:**
- Modify: `packages/runtime/src/tool-loop-detection.ts`
- Modify: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write failing tests**

```typescript
import { detectLoop } from '../src/tool-loop-detection.js';
import type { LoopDetectionResult } from '../src/tool-loop-detection.js';

describe('Tool Loop Detection — Generic Repeat Detector', () => {
  it('should return none when no loops', () => {
    const state = createLoopDetectionState();
    recordToolCall(state, 'c1', 'bash', { command: 'ls' });
    recordToolCall(state, 'c2', 'bash', { command: 'pwd' });
    recordToolCall(state, 'c3', 'web_search', { query: 'hello' });
    const result = detectLoop(state);
    expect(result.severity).toBe('none');
  });

  it('should warn when same call repeated genericRepeatWarn times', () => {
    const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 6 });
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: 'ls' });
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('warning');
    expect(result.detector).toBe('generic_repeat');
  });

  it('should escalate to critical when repeated genericRepeatCritical times', () => {
    const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 6 });
    for (let i = 0; i < 6; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: 'ls' });
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.detector).toBe('generic_repeat');
  });

  it('should not re-warn for the same pattern after first warning', () => {
    const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 10 });
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: 'ls' });
    }
    const first = detectLoop(state);
    expect(first.severity).toBe('warning');
    // Call again — should suppress the warning
    recordToolCall(state, 'c4', 'bash', { command: 'ls' });
    const second = detectLoop(state);
    expect(second.severity).toBe('none');
  });

  it('should still escalate to critical even after warning was suppressed', () => {
    const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 6 });
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: 'ls' });
    }
    detectLoop(state); // consume warning
    for (let i = 3; i < 6; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: 'ls' });
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
  });
});
```

**Step 2: Run tests to verify new ones fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: FAIL — `detectLoop` not exported

**Step 3: Implement generic repeat detector**

Add to `tool-loop-detection.ts`:

```typescript
export interface LoopDetectionResult {
  severity: 'none' | 'warning' | 'critical';
  detector?: 'generic_repeat' | 'no_progress' | 'ping_pong' | 'circuit_breaker';
  message?: string;
  details?: {
    toolName?: string;
    repeatCount?: number;
    cycleCount?: number;
  };
}

function detectGenericRepeat(state: LoopDetectionState): LoopDetectionResult {
  const counts = new Map<string, { count: number; toolName: string }>();
  for (const entry of state.window) {
    const existing = counts.get(entry.argsHash);
    if (existing) {
      existing.count++;
    } else {
      counts.set(entry.argsHash, { count: 1, toolName: entry.toolName });
    }
  }

  for (const [hash, { count, toolName }] of counts) {
    if (count >= state.config.genericRepeatCritical) {
      return {
        severity: 'critical',
        detector: 'generic_repeat',
        message: `Tool loop detected: "${toolName}" called ${count} times with identical arguments. Execution stopped.`,
        details: { toolName, repeatCount: count },
      };
    }
    const warnKey = `generic_repeat:${hash}`;
    if (count >= state.config.genericRepeatWarn && !state.warnedPatterns.has(warnKey)) {
      state.warnedPatterns.add(warnKey);
      return {
        severity: 'warning',
        detector: 'generic_repeat',
        message: `Warning: You have called "${toolName}" ${count} times with identical arguments. Change your approach — try different parameters, a different tool, or explain to the user why you are stuck.`,
        details: { toolName, repeatCount: count },
      };
    }
  }
  return { severity: 'none' };
}

export function detectLoop(state: LoopDetectionState): LoopDetectionResult {
  // Check detectors in priority order — critical results take precedence
  const results = [
    detectGenericRepeat(state),
  ];

  // Return highest severity
  const critical = results.find(r => r.severity === 'critical');
  if (critical) return critical;
  const warning = results.find(r => r.severity === 'warning');
  if (warning) return warning;
  return { severity: 'none' };
}
```

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-loop-detection.ts packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "feat(runtime): add generic repeat tool loop detector"
```

---

### Task 4: No-Progress Detector

**Files:**
- Modify: `packages/runtime/src/tool-loop-detection.ts`
- Modify: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Tool Loop Detection — No-Progress Detector', () => {
  it('should return none when outcomes differ', () => {
    const state = createLoopDetectionState({ noProgressWarn: 3, noProgressCritical: 5 });
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `c${i}`, 'check_status', { id: '123' });
      recordToolOutcome(state, `c${i}`, `status: running, progress: ${i * 30}%`);
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('none');
  });

  it('should warn when same outcome repeats noProgressWarn times', () => {
    const state = createLoopDetectionState({
      noProgressWarn: 3,
      noProgressCritical: 6,
      genericRepeatWarn: 100,     // disable generic repeat for this test
      genericRepeatCritical: 100,
    });
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `c${i}`, 'check_status', { id: '123' });
      recordToolOutcome(state, `c${i}`, 'status: pending');
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('warning');
    expect(result.detector).toBe('no_progress');
  });

  it('should escalate to critical at noProgressCritical', () => {
    const state = createLoopDetectionState({
      noProgressWarn: 3,
      noProgressCritical: 5,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
    });
    for (let i = 0; i < 5; i++) {
      recordToolCall(state, `c${i}`, 'check_status', { id: '123' });
      recordToolOutcome(state, `c${i}`, 'status: pending');
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.detector).toBe('no_progress');
  });

  it('should not count calls without outcomes', () => {
    const state = createLoopDetectionState({
      noProgressWarn: 3,
      noProgressCritical: 5,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
    });
    for (let i = 0; i < 5; i++) {
      recordToolCall(state, `c${i}`, 'check_status', { id: '123' });
      // No recordToolOutcome — outcomes not yet recorded
    }
    const result = detectLoop(state);
    // Should not trigger no_progress without outcomes
    expect(result.detector).not.toBe('no_progress');
  });
});
```

**Step 2: Run to verify failure**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: FAIL on new tests (no_progress detector not implemented)

**Step 3: Implement no-progress detector**

Add `detectNoProgress` function and add it to the `detectLoop` results array:

```typescript
function detectNoProgress(state: LoopDetectionState): LoopDetectionResult {
  // Group by argsHash, count entries with matching outcomeHash
  const groups = new Map<string, { toolName: string; outcomes: Map<string, number> }>();
  for (const entry of state.window) {
    if (!entry.outcomeHash) continue;
    let group = groups.get(entry.argsHash);
    if (!group) {
      group = { toolName: entry.toolName, outcomes: new Map() };
      groups.set(entry.argsHash, group);
    }
    group.outcomes.set(entry.outcomeHash, (group.outcomes.get(entry.outcomeHash) || 0) + 1);
  }

  for (const [hash, { toolName, outcomes }] of groups) {
    for (const [, count] of outcomes) {
      if (count >= state.config.noProgressCritical) {
        return {
          severity: 'critical',
          detector: 'no_progress',
          message: `Tool loop detected: "${toolName}" returned identical results ${count} times. No progress is being made. Execution stopped.`,
          details: { toolName, repeatCount: count },
        };
      }
      const warnKey = `no_progress:${hash}`;
      if (count >= state.config.noProgressWarn && !state.warnedPatterns.has(warnKey)) {
        state.warnedPatterns.add(warnKey);
        return {
          severity: 'warning',
          detector: 'no_progress',
          message: `Warning: "${toolName}" has returned identical results ${count} times. You appear stuck — try a different approach or different parameters.`,
          details: { toolName, repeatCount: count },
        };
      }
    }
  }
  return { severity: 'none' };
}
```

Add `detectNoProgress(state)` to the `results` array in `detectLoop()`.

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-loop-detection.ts packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "feat(runtime): add no-progress tool loop detector"
```

---

### Task 5: Ping-Pong Detector

**Files:**
- Modify: `packages/runtime/src/tool-loop-detection.ts`
- Modify: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Tool Loop Detection — Ping-Pong Detector', () => {
  it('should return none for non-alternating patterns', () => {
    const state = createLoopDetectionState({ pingPongWarnCycles: 2, pingPongCriticalCycles: 4 });
    recordToolCall(state, 'c1', 'bash', { command: 'ls' });
    recordToolCall(state, 'c2', 'web_search', { query: 'foo' });
    recordToolCall(state, 'c3', 'bash', { command: 'pwd' }); // different args from c1
    const result = detectLoop(state);
    expect(result.detector).not.toBe('ping_pong');
  });

  it('should warn on A-B-A-B alternating pattern', () => {
    const state = createLoopDetectionState({
      pingPongWarnCycles: 2,
      pingPongCriticalCycles: 4,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
    });
    // 2 cycles = A B A B
    recordToolCall(state, 'c1', 'bash', { command: 'ls' });
    recordToolCall(state, 'c2', 'web_search', { query: 'fix' });
    recordToolCall(state, 'c3', 'bash', { command: 'ls' });
    recordToolCall(state, 'c4', 'web_search', { query: 'fix' });
    const result = detectLoop(state);
    expect(result.severity).toBe('warning');
    expect(result.detector).toBe('ping_pong');
  });

  it('should escalate to critical on enough cycles', () => {
    const state = createLoopDetectionState({
      pingPongWarnCycles: 2,
      pingPongCriticalCycles: 4,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
    });
    for (let i = 0; i < 4; i++) {
      recordToolCall(state, `a${i}`, 'bash', { command: 'ls' });
      recordToolCall(state, `b${i}`, 'web_search', { query: 'fix' });
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.detector).toBe('ping_pong');
  });

  it('should not trigger on interleaved non-alternating', () => {
    const state = createLoopDetectionState({
      pingPongWarnCycles: 2,
      pingPongCriticalCycles: 4,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
    });
    recordToolCall(state, 'c1', 'a', { x: 1 });
    recordToolCall(state, 'c2', 'b', { x: 2 });
    recordToolCall(state, 'c3', 'c', { x: 3 }); // breaks alternation
    recordToolCall(state, 'c4', 'a', { x: 1 });
    const result = detectLoop(state);
    expect(result.detector).not.toBe('ping_pong');
  });
});
```

**Step 2: Run to verify failure**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`

**Step 3: Implement ping-pong detector**

```typescript
function detectPingPong(state: LoopDetectionState): LoopDetectionResult {
  const hashes = state.window.map(e => e.argsHash);
  if (hashes.length < 4) return { severity: 'none' };

  // Count consecutive alternating pairs from the end
  let cycles = 0;
  let i = hashes.length - 1;
  while (i >= 3) {
    const a1 = hashes[i];
    const b1 = hashes[i - 1];
    const a0 = hashes[i - 2];
    const b0 = hashes[i - 3];
    if (a1 === a0 && b1 === b0 && a1 !== b1) {
      cycles++;
      i -= 2; // step back one cycle
    } else {
      break;
    }
  }

  if (cycles >= state.config.pingPongCriticalCycles) {
    const toolA = state.window[state.window.length - 1].toolName;
    const toolB = state.window[state.window.length - 2].toolName;
    return {
      severity: 'critical',
      detector: 'ping_pong',
      message: `Tool loop detected: "${toolA}" and "${toolB}" are alternating in a deadlock (${cycles} cycles). Execution stopped.`,
      details: { cycleCount: cycles },
    };
  }

  const warnKey = `ping_pong:${hashes[hashes.length - 1]}:${hashes[hashes.length - 2]}`;
  if (cycles >= state.config.pingPongWarnCycles && !state.warnedPatterns.has(warnKey)) {
    state.warnedPatterns.add(warnKey);
    const toolA = state.window[state.window.length - 1].toolName;
    const toolB = state.window[state.window.length - 2].toolName;
    return {
      severity: 'warning',
      detector: 'ping_pong',
      message: `Warning: "${toolA}" and "${toolB}" appear to be alternating without progress (${cycles} cycles). Break the cycle — try a completely different approach.`,
      details: { cycleCount: cycles },
    };
  }

  return { severity: 'none' };
}
```

Add `detectPingPong(state)` to the `results` array in `detectLoop()`.

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-loop-detection.ts packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "feat(runtime): add ping-pong tool loop detector"
```

---

### Task 6: Global Circuit Breaker

**Files:**
- Modify: `packages/runtime/src/tool-loop-detection.ts`
- Modify: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Tool Loop Detection — Circuit Breaker', () => {
  it('should not trigger when outcomes differ', () => {
    const state = createLoopDetectionState({
      circuitBreakerLimit: 5,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
      noProgressWarn: 100,
      noProgressCritical: 100,
    });
    for (let i = 0; i < 5; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: `cmd${i}` });
      recordToolOutcome(state, `c${i}`, `result-${i}`);
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('none');
  });

  it('should trigger critical when no-progress calls exceed limit', () => {
    const state = createLoopDetectionState({
      circuitBreakerLimit: 5,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
      noProgressWarn: 100,
      noProgressCritical: 100,
    });
    // Mix of different tools, but all returning the same result for their argsHash
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `a${i}`, 'bash', { command: 'ls' });
      recordToolOutcome(state, `a${i}`, 'same output');
    }
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `b${i}`, 'web_search', { query: 'help' });
      recordToolOutcome(state, `b${i}`, 'no results');
    }
    // Total no-progress: 3-1 + 3-1 = 4 (first of each is baseline, not no-progress)
    // Actually 2+2=4 which is < 5, so need more
    recordToolCall(state, 'a3', 'bash', { command: 'ls' });
    recordToolOutcome(state, 'a3', 'same output');
    // Now 3+2=5 no-progress calls
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.detector).toBe('circuit_breaker');
  });

  it('should always be active and cannot be bypassed by warnedPatterns', () => {
    const state = createLoopDetectionState({
      circuitBreakerLimit: 3,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
      noProgressWarn: 100,
      noProgressCritical: 100,
    });
    // Pre-populate warnedPatterns to simulate suppressed warnings
    state.warnedPatterns.add('circuit_breaker:global');
    for (let i = 0; i < 4; i++) {
      recordToolCall(state, `c${i}`, 'bash', { command: 'ls' });
      recordToolOutcome(state, `c${i}`, 'same');
    }
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
  });
});
```

**Step 2: Run to verify failure**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`

**Step 3: Implement circuit breaker**

```typescript
function detectCircuitBreaker(state: LoopDetectionState): LoopDetectionResult {
  // Count total no-progress calls: entries whose argsHash+outcomeHash combo
  // appeared in a previous entry (i.e., same call, same result = no progress)
  let noProgressCount = 0;
  const seen = new Map<string, string>(); // argsHash -> first outcomeHash

  for (const entry of state.window) {
    if (!entry.outcomeHash) continue;
    const key = entry.argsHash;
    const firstOutcome = seen.get(key);
    if (firstOutcome === undefined) {
      seen.set(key, entry.outcomeHash);
    } else if (firstOutcome === entry.outcomeHash) {
      noProgressCount++;
    }
    // Different outcome for same args = progress, don't count
  }

  if (noProgressCount >= state.config.circuitBreakerLimit) {
    return {
      severity: 'critical',
      detector: 'circuit_breaker',
      message: `Global circuit breaker: ${noProgressCount} tool calls made no progress. Execution stopped to prevent further waste.`,
      details: { repeatCount: noProgressCount },
    };
  }
  return { severity: 'none' };
}
```

Add `detectCircuitBreaker(state)` to the `results` array in `detectLoop()`.

**Step 4: Run tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/tool-loop-detection.ts packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "feat(runtime): add global circuit breaker detector"
```

---

### Task 7: Integration into executeWithTools()

**Files:**
- Modify: `packages/runtime/src/index.ts:2393-2562`

**Step 1: Add the import**

At the top of `packages/runtime/src/index.ts` (after the existing imports around line 1-30), add:

```typescript
import {
  createLoopDetectionState,
  recordToolCall,
  recordToolOutcome,
  detectLoop,
} from './tool-loop-detection.js';
```

**Step 2: Integrate into the tool loop**

Modify `executeWithTools()` at line 2401 — after `const maxRounds` and before the `for` loop:

```typescript
    const loopState = createLoopDetectionState();
```

After the tool execution loop (after line 2524, where `toolResultParts` is fully built), add recording and detection:

```typescript
      // Record tool calls and outcomes for loop detection
      for (let t = 0; t < toolUses.length; t++) {
        recordToolCall(loopState, toolUses[t].id, toolUses[t].name, toolUses[t].input);
        recordToolOutcome(loopState, toolUses[t].id, toolResultParts[t]);
      }

      // Check for tool loops
      const loopDetection = detectLoop(loopState);
      if (loopDetection.severity === 'critical') {
        this.logger.warn('Tool loop detected (critical)', {
          detector: loopDetection.detector,
          message: loopDetection.message,
          sessionId,
          round,
        });
        // Force synthesis on next iteration
        lastRoundHadTools = true;
        break;
      }
      if (loopDetection.severity === 'warning' && loopDetection.message) {
        this.logger.warn('Tool loop detected (warning)', {
          detector: loopDetection.detector,
          message: loopDetection.message,
          sessionId,
          round,
        });
        currentMessages.push({ role: 'user', content: loopDetection.message });
      }
```

**Step 3: Modify the synthesis message for loop-detected exits**

Change the existing synthesis message at line 2542 to be context-aware. Replace:

```typescript
currentMessages.push({ role: 'user', content: 'Now synthesize all the information gathered above into your final response. Do not call any more tools.' });
```

With:

```typescript
currentMessages.push({ role: 'user', content: 'Now synthesize all the information gathered above into your final response. Do not call any more tools. If you were unable to complete the task, explain what went wrong and suggest next steps.' });
```

**Step 4: Run full test suite to verify no regressions**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/`
Expected: PASS (all existing tests + new tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): integrate tool loop detection into executeWithTools"
```

---

### Task 8: Integration Test

**Files:**
- Modify: `packages/runtime/tests/tool-loop-detection.test.ts`

**Step 1: Write integration tests**

Add a final describe block testing the full flow end-to-end:

```typescript
describe('Tool Loop Detection — Integration Flow', () => {
  it('should detect a full stuck loop scenario', () => {
    const state = createLoopDetectionState({
      genericRepeatWarn: 3,
      genericRepeatCritical: 6,
    });

    // Simulate a stuck loop: bash ls called 6 times with identical results
    for (let i = 0; i < 6; i++) {
      recordToolCall(state, `call-${i}`, 'bash', { command: 'ls /nonexistent' });
      recordToolOutcome(state, `call-${i}`, 'Error: No such file or directory');
    }

    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.message).toContain('bash');
    expect(result.message).toContain('6');
  });

  it('should handle mixed productive and stuck calls', () => {
    const state = createLoopDetectionState({
      genericRepeatWarn: 4,
      genericRepeatCritical: 8,
      noProgressWarn: 3,
      noProgressCritical: 5,
    });

    // Some productive calls
    recordToolCall(state, 'c1', 'bash', { command: 'ls' });
    recordToolOutcome(state, 'c1', 'file1.txt');
    recordToolCall(state, 'c2', 'bash', { command: 'cat file1.txt' });
    recordToolOutcome(state, 'c2', 'contents');

    // Now gets stuck polling
    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `poll-${i}`, 'check_status', { id: '123' });
      recordToolOutcome(state, `poll-${i}`, 'status: pending');
    }

    const result = detectLoop(state);
    expect(result.severity).toBe('warning');
    expect(result.detector).toBe('no_progress');
  });

  it('should detect ping-pong between two tools', () => {
    const state = createLoopDetectionState({
      pingPongWarnCycles: 2,
      pingPongCriticalCycles: 3,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
    });

    for (let i = 0; i < 3; i++) {
      recordToolCall(state, `read-${i}`, 'read_file', { path: '/app/config.json' });
      recordToolOutcome(state, `read-${i}`, '{"key": "value"}');
      recordToolCall(state, `write-${i}`, 'write_file', { path: '/app/config.json', content: '{"key": "new"}' });
      recordToolOutcome(state, `write-${i}`, 'Success');
    }

    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.detector).toBe('ping_pong');
  });

  it('circuit breaker catches diverse no-progress across tools', () => {
    const state = createLoopDetectionState({
      circuitBreakerLimit: 6,
      genericRepeatWarn: 100,
      genericRepeatCritical: 100,
      noProgressWarn: 100,
      noProgressCritical: 100,
      pingPongWarnCycles: 100,
      pingPongCriticalCycles: 100,
    });

    // Different tools, all stuck
    for (let i = 0; i < 4; i++) {
      recordToolCall(state, `a${i}`, 'tool_a', { x: 1 });
      recordToolOutcome(state, `a${i}`, 'error A');
    }
    for (let i = 0; i < 4; i++) {
      recordToolCall(state, `b${i}`, 'tool_b', { y: 2 });
      recordToolOutcome(state, `b${i}`, 'error B');
    }
    // no-progress: 3 (tool_a repeats) + 3 (tool_b repeats) = 6
    const result = detectLoop(state);
    expect(result.severity).toBe('critical');
    expect(result.detector).toBe('circuit_breaker');
  });
});
```

**Step 2: Run all tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/runtime/tests/tool-loop-detection.test.ts`
Expected: PASS

**Step 3: Run full project test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all 2,722+ tests)

**Step 4: Commit**

```bash
git add packages/runtime/tests/tool-loop-detection.test.ts
git commit -m "test(runtime): add integration tests for tool loop detection"
```

---

### Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Hashing utilities | `tool-loop-detection.ts` (create) | 8 |
| 2 | State management | `tool-loop-detection.ts` (extend) | 5 |
| 3 | Generic repeat detector | `tool-loop-detection.ts` (extend) | 5 |
| 4 | No-progress detector | `tool-loop-detection.ts` (extend) | 4 |
| 5 | Ping-pong detector | `tool-loop-detection.ts` (extend) | 4 |
| 6 | Circuit breaker | `tool-loop-detection.ts` (extend) | 3 |
| 7 | Integration into executeWithTools | `index.ts` (modify) | 0 (existing tests) |
| 8 | Integration tests | test file (extend) | 4 |
| **Total** | | **2 files** | **~33 tests** |
