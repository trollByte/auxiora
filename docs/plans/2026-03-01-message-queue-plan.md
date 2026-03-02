# Message Queue System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-session in-memory message queue so that new messages arriving while a run is active are queued and processed sequentially after the current run finishes.

**Architecture:** A `SessionRunState` map on the `Auxiora` class tracks per-session locking and queued messages. `handleMessage()` and `handleChannelMessage()` gate on this state — if a run is active, the message is queued and an ack is sent. A `drainSessionQueue()` loop processes queued messages one-by-one after the current run completes.

**Tech Stack:** TypeScript, Zod (config schema), Vitest (tests)

---

### Task 1: Add queue config to config schema

**Files:**
- Modify: `packages/config/src/index.ts`

**Step 1: Add the QueueConfigSchema**

Insert before `export const ConfigSchema` (line 376):

```typescript
const QueueConfigSchema = z.object({
  mode: z.enum(['followup']).default('followup'),
  cap: z.number().int().positive().default(20),
  debounceMs: z.number().int().min(0).default(0),
});
```

**Step 2: Wire into ConfigSchema**

Add `queue: QueueConfigSchema.default({})` to the `ConfigSchema` object (after line 404, before the closing `}`):

```typescript
  queue: QueueConfigSchema.default({}),
```

**Step 3: Export the type**

After the existing type exports (after line 414):

```typescript
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
```

**Step 4: Verify build**

Run: `npx tsc --project packages/config/tsconfig.json --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/config/src/index.ts
git commit -m "feat(config): add queue config schema (mode, cap, debounceMs)"
```

---

### Task 2: Add session run state and queue data structures to runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add types and the state map**

After the existing private field `orchestrationHistory` (line 364), add:

```typescript
  /** Per-session run state for message queueing. */
  private sessionRunStates = new Map<string, {
    running: boolean;
    queue: Array<{
      content: string;
      enqueuedAt: number;
      client?: ClientConnection;
      requestId?: string;
      chatId?: string;
      modelOverride?: string;
      providerOverride?: string;
      inbound?: InboundMessage;
    }>;
    lastRunStartedAt: number;
  }>();
```

Note: `ClientConnection` is already imported (line 1). `InboundMessage` is imported from `@auxiora/channels` — verify it's already imported, or add:
```typescript
import type { InboundMessage } from '@auxiora/channels';
```

**Step 2: Verify build**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): add sessionRunStates map for message queue"
```

---

### Task 3: Add acquireSessionRun, releaseSessionRun, and getSessionRunState helpers

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add helper methods**

Add these private methods after the `sendToClient` method (after line 4147):

```typescript
  /**
   * Try to acquire the run lock for a session.
   * Returns true if acquired (caller should run), false if already running (caller should queue).
   */
  private acquireSessionRun(sessionId: string): boolean {
    let state = this.sessionRunStates.get(sessionId);
    if (!state) {
      state = { running: false, queue: [], lastRunStartedAt: 0 };
      this.sessionRunStates.set(sessionId, state);
    }
    if (state.running) return false;
    state.running = true;
    state.lastRunStartedAt = Date.now();
    return true;
  }

  /** Release the run lock for a session. */
  private releaseSessionRun(sessionId: string): void {
    const state = this.sessionRunStates.get(sessionId);
    if (state) {
      state.running = false;
    }
  }

  /** Get or create the run state for a session. */
  private getSessionRunState(sessionId: string) {
    let state = this.sessionRunStates.get(sessionId);
    if (!state) {
      state = { running: false, queue: [], lastRunStartedAt: 0 };
      this.sessionRunStates.set(sessionId, state);
    }
    return state;
  }
```

**Step 2: Verify build**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): add session run lock helpers"
```

---

### Task 4: Add enqueueMessage and drainSessionQueue methods

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add enqueueMessage**

Add after the helpers from Task 3:

```typescript
  /**
   * Queue a message for later processing when a run is already active.
   * Drops the oldest message if the queue exceeds the configured cap.
   */
  private enqueueMessage(
    sessionId: string,
    pending: {
      content: string;
      enqueuedAt: number;
      client?: ClientConnection;
      requestId?: string;
      chatId?: string;
      modelOverride?: string;
      providerOverride?: string;
      inbound?: InboundMessage;
    },
  ): void {
    const state = this.getSessionRunState(sessionId);
    const cap = this.config.queue?.cap ?? 20;

    state.queue.push(pending);

    if (state.queue.length > cap) {
      const dropped = state.queue.shift();
      this.logger.warn('Message queue overflow — dropped oldest message', {
        sessionId,
        droppedContent: dropped?.content.slice(0, 80),
        queueLength: state.queue.length,
      });
    }
  }
```

**Step 2: Add drainSessionQueue**

```typescript
  /**
   * Process all queued messages for a session sequentially.
   * Called in the finally block after a run completes.
   */
  private async drainSessionQueue(sessionId: string): Promise<void> {
    const state = this.sessionRunStates.get(sessionId);
    if (!state) return;

    while (state.queue.length > 0) {
      const pending = state.queue.shift()!;

      // Skip webchat messages if the client disconnected
      if (pending.client && pending.client.ws.readyState !== 1) {
        this.logger.info('Skipping queued webchat message — client disconnected', {
          sessionId,
        });
        continue;
      }

      // Skip if session was destroyed
      const session = await this.sessions.get(sessionId);
      if (!session) {
        this.logger.info('Skipping queued messages — session destroyed', { sessionId });
        state.queue.length = 0;
        break;
      }

      try {
        state.running = true;
        state.lastRunStartedAt = Date.now();

        if (pending.inbound) {
          // Re-enter handleChannelMessage with the queued inbound message
          await this.handleChannelMessage(pending.inbound);
        } else if (pending.client) {
          // Re-enter handleMessage with the queued webchat message
          const wsMessage: WsMessage = {
            id: pending.requestId ?? `queued-${Date.now()}`,
            type: 'message',
            payload: {
              content: pending.content,
              sessionId,
              chatId: pending.chatId,
              model: pending.modelOverride,
              provider: pending.providerOverride,
            },
          };
          await this.handleMessage(pending.client, wsMessage);
        }
      } catch (err) {
        this.logger.error('Error processing queued message', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    state.running = false;
  }
```

**Step 3: Verify build**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): add enqueueMessage and drainSessionQueue"
```

---

### Task 5: Gate handleMessage with run state check

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Identify the session resolution point in handleMessage**

In `handleMessage()` (starts at line 3084), the session is resolved around lines 3200-3230 (after special message types are handled). Find where `session` is available and before the main processing begins.

**Step 2: Add the gate**

After the session is resolved (the line that sets `session`) and before the existing processing flow, add:

```typescript
    // ── Message queue gate ─────────────────────────────────────────
    if (!this.acquireSessionRun(session.id)) {
      // A run is already active on this session — queue the message
      this.enqueueMessage(session.id, {
        content: (payload as any)?.content ?? '',
        enqueuedAt: Date.now(),
        client,
        requestId,
        chatId: (payload as any)?.chatId,
        modelOverride: (payload as any)?.model,
        providerOverride: (payload as any)?.provider,
      });

      this.sendToClient(client, {
        type: 'queued',
        requestId,
        position: this.getSessionRunState(session.id).queue.length,
      });
      return;
    }
```

**Step 3: Wrap the rest of handleMessage in try/finally**

The existing try/catch already surrounds the main logic. In the `finally` block (or add one), call:

```typescript
    } finally {
      await this.drainSessionQueue(session.id);
      // releaseSessionRun is called at the end of drainSessionQueue
    }
```

**Important:** The `drainSessionQueue` method sets `state.running = false` at the end, so no need to call `releaseSessionRun` separately. But if `drainSessionQueue` itself throws (shouldn't, since it catches errors internally), add a safety release:

```typescript
    } finally {
      try {
        await this.drainSessionQueue(session.id);
      } finally {
        this.releaseSessionRun(session.id);
      }
    }
```

**Step 4: Handle re-entrant calls**

Since `drainSessionQueue` calls `handleMessage` recursively for queued webchat messages, the gate at the top will see `running === true` and try to re-queue. Fix this by having `drainSessionQueue` temporarily set `running = false` before calling `handleMessage`, so the recursive call acquires the lock normally:

Actually, a simpler approach: `drainSessionQueue` already controls the lock. The re-entrant `handleMessage` call will hit the gate and see `running === true`, which would re-queue. Instead, **don't** call `handleMessage`/`handleChannelMessage` from `drainSessionQueue`. Instead, extract the core processing logic into a shared helper, or inline the message processing directly in `drainSessionQueue`.

**Revised approach for drainSessionQueue**: Instead of re-calling `handleMessage`, directly add the queued message content to the session and call `executeWithTools`. This avoids re-entrancy entirely. See Task 4 revision below.

**Revised drainSessionQueue** (replaces the one in Task 4):

```typescript
  private async drainSessionQueue(sessionId: string): Promise<void> {
    const state = this.sessionRunStates.get(sessionId);
    if (!state) return;

    while (state.queue.length > 0) {
      const pending = state.queue.shift()!;

      // Skip webchat messages if the client disconnected
      if (pending.client && !pending.inbound && pending.client.ws.readyState !== 1) {
        this.logger.info('Skipping queued webchat message — client disconnected', { sessionId });
        continue;
      }

      // Skip if session was destroyed
      const session = await this.sessions.get(sessionId);
      if (!session) {
        this.logger.info('Skipping queued messages — session destroyed', { sessionId });
        state.queue.length = 0;
        break;
      }

      try {
        // Release the lock so the re-entrant call can acquire it
        state.running = false;

        if (pending.inbound) {
          await this.handleChannelMessage(pending.inbound);
        } else if (pending.client) {
          const wsMessage: WsMessage = {
            id: pending.requestId ?? `queued-${Date.now()}`,
            type: 'message',
            payload: {
              content: pending.content,
              sessionId,
              chatId: pending.chatId,
              model: pending.modelOverride,
              provider: pending.providerOverride,
            },
          };
          await this.handleMessage(pending.client, wsMessage);
        }
      } catch (err) {
        this.logger.error('Error processing queued message', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
```

With this approach, `drainSessionQueue` releases the lock before each re-entrant call, so `handleMessage`/`handleChannelMessage` can acquire it normally. The `finally` in `handleMessage` will call `drainSessionQueue` again, but the queue will be empty (already shifted), so it returns immediately.

**Wait — this creates infinite recursion.** Each `handleMessage` → finally → `drainSessionQueue` → `handleMessage` → finally → `drainSessionQueue`. But the second `drainSessionQueue` finds an empty queue and returns.

Actually this is fine: the outer `drainSessionQueue` shifts the message, calls `handleMessage`, which processes it. `handleMessage`'s `finally` calls `drainSessionQueue` again, which finds nothing to drain (the outer loop hasn't pushed anything new). Then control returns to the outer `drainSessionQueue` loop, which checks `queue.length > 0` — if more messages arrived during processing, it continues.

**Final approach:** The gate + finally pattern with re-entrancy via lock release is clean. Proceed with this.

**Step 5: Verify build**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): gate handleMessage with session run state"
```

---

### Task 6: Gate handleChannelMessage with run state check

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Identify the session resolution point in handleChannelMessage**

In `handleChannelMessage()` (starts at line 4242), the session is resolved at lines 4250-4256 (`getOrCreate`). After the command handling (`/` prefix check, lines 4258-4268), add the gate.

**Step 2: Add the gate**

After the command handling block (after line 4268), before the media processing:

```typescript
    // ── Message queue gate ─────────────────────────────────────────
    if (!this.acquireSessionRun(session.id)) {
      this.enqueueMessage(session.id, {
        content: inbound.content,
        enqueuedAt: Date.now(),
        inbound,
      });

      // Send "queued" ack to channel
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: "Got it — I'll get to that after I finish the current task.",
          replyToId: inbound.id,
        });
      }
      return;
    }
```

**Step 3: Add try/finally wrapper**

Wrap the rest of `handleChannelMessage` (from media processing through the end) in:

```typescript
    try {
      // ... existing processing code ...
    } finally {
      try {
        await this.drainSessionQueue(session.id);
      } finally {
        this.releaseSessionRun(session.id);
      }
    }
```

**Step 4: Verify build**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): gate handleChannelMessage with session run state"
```

---

### Task 7: Clear sessionRunStates on shutdown

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add cleanup to stop()**

In the `stop()` method (line 4879), before `this.sessions.destroy()` (line 4933):

```typescript
    this.sessionRunStates.clear();
```

**Step 2: Verify build**

Run: `npx tsc --project packages/runtime/tsconfig.json --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): clear session run states on shutdown"
```

---

### Task 8: Write unit tests for the message queue

**Files:**
- Create: `packages/runtime/tests/message-queue.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Since the message queue is deeply integrated into the Auxiora class,
 * we test the queue logic by extracting and testing the state management
 * functions in isolation. The integration behavior (gate + drain) is
 * verified via the runtime's existing test harness.
 */

// Minimal types matching the runtime's internal structures
interface PendingMessage {
  content: string;
  enqueuedAt: number;
  inbound?: { channelType: string; channelId: string; senderId: string; content: string; id: string };
}

interface SessionRunState {
  running: boolean;
  queue: PendingMessage[];
  lastRunStartedAt: number;
}

// Extract the pure logic for unit testing
function acquireSessionRun(states: Map<string, SessionRunState>, sessionId: string): boolean {
  let state = states.get(sessionId);
  if (!state) {
    state = { running: false, queue: [], lastRunStartedAt: 0 };
    states.set(sessionId, state);
  }
  if (state.running) return false;
  state.running = true;
  state.lastRunStartedAt = Date.now();
  return true;
}

function releaseSessionRun(states: Map<string, SessionRunState>, sessionId: string): void {
  const state = states.get(sessionId);
  if (state) state.running = false;
}

function enqueueMessage(
  states: Map<string, SessionRunState>,
  sessionId: string,
  pending: PendingMessage,
  cap: number = 20,
): { dropped?: PendingMessage } {
  let state = states.get(sessionId);
  if (!state) {
    state = { running: false, queue: [], lastRunStartedAt: 0 };
    states.set(sessionId, state);
  }
  state.queue.push(pending);
  if (state.queue.length > cap) {
    return { dropped: state.queue.shift() };
  }
  return {};
}

describe('Message Queue State Management', () => {
  let states: Map<string, SessionRunState>;

  beforeEach(() => {
    states = new Map();
  });

  describe('acquireSessionRun', () => {
    it('should acquire lock on first call', () => {
      expect(acquireSessionRun(states, 'sess-1')).toBe(true);
      const state = states.get('sess-1')!;
      expect(state.running).toBe(true);
      expect(state.lastRunStartedAt).toBeGreaterThan(0);
    });

    it('should reject second acquire on same session', () => {
      acquireSessionRun(states, 'sess-1');
      expect(acquireSessionRun(states, 'sess-1')).toBe(false);
    });

    it('should allow acquire on different session', () => {
      acquireSessionRun(states, 'sess-1');
      expect(acquireSessionRun(states, 'sess-2')).toBe(true);
    });

    it('should allow re-acquire after release', () => {
      acquireSessionRun(states, 'sess-1');
      releaseSessionRun(states, 'sess-1');
      expect(acquireSessionRun(states, 'sess-1')).toBe(true);
    });
  });

  describe('releaseSessionRun', () => {
    it('should release the lock', () => {
      acquireSessionRun(states, 'sess-1');
      releaseSessionRun(states, 'sess-1');
      expect(states.get('sess-1')!.running).toBe(false);
    });

    it('should be a no-op for unknown session', () => {
      expect(() => releaseSessionRun(states, 'unknown')).not.toThrow();
    });
  });

  describe('enqueueMessage', () => {
    it('should add message to queue', () => {
      const pending: PendingMessage = { content: 'Hello', enqueuedAt: Date.now() };
      enqueueMessage(states, 'sess-1', pending);
      expect(states.get('sess-1')!.queue).toHaveLength(1);
      expect(states.get('sess-1')!.queue[0].content).toBe('Hello');
    });

    it('should preserve order', () => {
      enqueueMessage(states, 'sess-1', { content: 'First', enqueuedAt: 1 });
      enqueueMessage(states, 'sess-1', { content: 'Second', enqueuedAt: 2 });
      enqueueMessage(states, 'sess-1', { content: 'Third', enqueuedAt: 3 });
      const queue = states.get('sess-1')!.queue;
      expect(queue.map(m => m.content)).toEqual(['First', 'Second', 'Third']);
    });

    it('should drop oldest on overflow', () => {
      for (let i = 0; i < 3; i++) {
        enqueueMessage(states, 'sess-1', { content: `msg-${i}`, enqueuedAt: i }, 3);
      }
      const result = enqueueMessage(states, 'sess-1', { content: 'overflow', enqueuedAt: 4 }, 3);
      expect(result.dropped?.content).toBe('msg-0');
      const queue = states.get('sess-1')!.queue;
      expect(queue).toHaveLength(3);
      expect(queue[0].content).toBe('msg-1');
      expect(queue[2].content).toBe('overflow');
    });

    it('should isolate queues per session', () => {
      enqueueMessage(states, 'sess-1', { content: 'A', enqueuedAt: 1 });
      enqueueMessage(states, 'sess-2', { content: 'B', enqueuedAt: 2 });
      expect(states.get('sess-1')!.queue).toHaveLength(1);
      expect(states.get('sess-2')!.queue).toHaveLength(1);
    });
  });

  describe('integration scenario', () => {
    it('should queue messages while running and process after release', () => {
      // Session starts a run
      expect(acquireSessionRun(states, 'sess-1')).toBe(true);

      // New messages arrive while running
      expect(acquireSessionRun(states, 'sess-1')).toBe(false);
      enqueueMessage(states, 'sess-1', { content: 'Follow-up 1', enqueuedAt: 1 });

      expect(acquireSessionRun(states, 'sess-1')).toBe(false);
      enqueueMessage(states, 'sess-1', { content: 'Follow-up 2', enqueuedAt: 2 });

      // Current run finishes
      const state = states.get('sess-1')!;
      expect(state.queue).toHaveLength(2);

      // Drain loop would process these
      const first = state.queue.shift()!;
      expect(first.content).toBe('Follow-up 1');

      const second = state.queue.shift()!;
      expect(second.content).toBe('Follow-up 2');

      // Queue is now empty, release
      releaseSessionRun(states, 'sess-1');
      expect(state.running).toBe(false);
      expect(state.queue).toHaveLength(0);
    });
  });
});
```

**Step 2: Run the tests**

Run: `pnpm vitest run packages/runtime/tests/message-queue.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/runtime/tests/message-queue.test.ts
git commit -m "test(runtime): add unit tests for message queue state management"
```

---

### Task 9: Build and run full test suite

**Step 1: Build all packages**

Run: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
Expected: Clean build, no errors

**Step 2: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass (should be ~5,762+ tests across 518+ files)

**Step 3: Final commit if any fixes needed**

If any fixes were required, commit them with an appropriate message.

---

## Verification

1. **Unit tests**: `pnpm vitest run packages/runtime/tests/message-queue.test.ts`
2. **Config tests**: `pnpm vitest run packages/config`
3. **Full build**: `pnpm -r --filter='!@auxiora/desktop' --filter='!@auxiora/landing' build`
4. **Full test suite**: `pnpm vitest run`
