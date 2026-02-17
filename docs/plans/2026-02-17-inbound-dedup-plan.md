# Inbound Message Deduplication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent duplicate message processing when webhook platforms retry delivery, by adding a TTL-based dedup cache in the channel manager.

**Architecture:** A new `inbound-dedup.ts` module provides `isDuplicate(channelType, channelId, messageId)` backed by an in-memory `Map<string, number>` with TTL expiry and max-size eviction. The channel manager calls this before forwarding inbound messages to the runtime.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest

---

## Codebase Context

**InboundMessage type** (`packages/channels/src/types.ts:3-14`):
```typescript
export interface InboundMessage {
  id: string;             // Platform-specific message ID
  channelType: ChannelType;
  channelId: string;
  senderId: string;
  content: string;
  timestamp: number;
  // ...
}
```

**Channel manager message handler** (`packages/channels/src/manager.ts:102-106`):
```typescript
adapter.onMessage(async (message) => {
  if (this.messageHandler) {
    await this.messageHandler(message);
  }
});
```

**Barrel export** (`packages/channels/src/index.ts`): Exports adapters, types, and `ChannelManager`.

---

## Task 1: Dedup Cache Module

**Files:**
- Create: `packages/channels/src/inbound-dedup.ts`
- Create: `packages/channels/tests/inbound-dedup.test.ts`

**Step 1: Write the failing tests**

Create `packages/channels/tests/inbound-dedup.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isDuplicate, resetInboundDedup } from '../src/inbound-dedup.js';

describe('inbound-dedup', () => {
  beforeEach(() => {
    resetInboundDedup();
    vi.restoreAllMocks();
  });

  describe('isDuplicate', () => {
    it('should return false for the first occurrence of a message', () => {
      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(false);
    });

    it('should return true for a duplicate message ID', () => {
      isDuplicate('telegram', 'chat-123', 'msg-1');
      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(true);
    });

    it('should treat different channelTypes as distinct', () => {
      isDuplicate('telegram', 'chat-123', 'msg-1');
      expect(isDuplicate('discord', 'chat-123', 'msg-1')).toBe(false);
    });

    it('should treat different channelIds as distinct', () => {
      isDuplicate('telegram', 'chat-A', 'msg-1');
      expect(isDuplicate('telegram', 'chat-B', 'msg-1')).toBe(false);
    });

    it('should return false for empty messageId (bypass dedup)', () => {
      expect(isDuplicate('telegram', 'chat-123', '')).toBe(false);
      expect(isDuplicate('telegram', 'chat-123', '')).toBe(false);
    });
  });

  describe('TTL expiry', () => {
    it('should allow reprocessing after TTL expires', () => {
      vi.useFakeTimers();

      isDuplicate('telegram', 'chat-123', 'msg-1');
      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(true);

      // Advance past 20-minute TTL
      vi.advanceTimersByTime(21 * 60_000);

      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(false);

      vi.useRealTimers();
    });

    it('should NOT allow reprocessing before TTL expires', () => {
      vi.useFakeTimers();

      isDuplicate('telegram', 'chat-123', 'msg-1');

      // Advance to just before expiry
      vi.advanceTimersByTime(19 * 60_000);

      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('max size eviction', () => {
    it('should evict oldest entries when max size exceeded', () => {
      // Fill cache to max (5000 entries)
      for (let i = 0; i < 5000; i++) {
        isDuplicate('telegram', 'chat', `msg-${i}`);
      }

      // msg-0 should still be there
      expect(isDuplicate('telegram', 'chat', 'msg-0')).toBe(true);

      // Add one more — should evict oldest (msg-0)
      isDuplicate('telegram', 'chat', 'msg-5000');

      // msg-0 was evicted, should be treated as new
      expect(isDuplicate('telegram', 'chat', 'msg-0')).toBe(false);

      // msg-1 should still be there (not evicted yet)
      expect(isDuplicate('telegram', 'chat', 'msg-1')).toBe(true);
    });
  });

  describe('resetInboundDedup', () => {
    it('should clear all cached entries', () => {
      isDuplicate('telegram', 'chat-123', 'msg-1');
      isDuplicate('discord', 'server-1', 'msg-2');

      resetInboundDedup();

      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(false);
      expect(isDuplicate('discord', 'server-1', 'msg-2')).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/inbound-dedup.test.ts`
Expected: FAIL — module not found

**Step 3: Implement dedup cache**

Create `packages/channels/src/inbound-dedup.ts`:

```typescript
/**
 * In-memory TTL-based deduplication cache for inbound channel messages.
 *
 * Prevents duplicate processing when webhook platforms retry delivery.
 * Key: channelType|channelId|messageId. Entries auto-expire after ttlMs.
 */

const DEFAULT_TTL_MS = 20 * 60_000; // 20 minutes
const DEFAULT_MAX_SIZE = 5000;

const cache = new Map<string, number>();

function buildKey(channelType: string, channelId: string, messageId: string): string {
  return `${channelType}|${channelId}|${messageId}`;
}

function evictExpired(now: number): void {
  for (const [key, insertedAt] of cache) {
    if (now - insertedAt > DEFAULT_TTL_MS) {
      cache.delete(key);
    }
  }
}

function evictOldest(): void {
  if (cache.size <= DEFAULT_MAX_SIZE) return;
  // Map iterates in insertion order — first entry is oldest
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) {
    cache.delete(firstKey);
  }
}

/**
 * Check if a message is a duplicate.
 *
 * Returns `true` if this exact channelType+channelId+messageId was seen
 * within the TTL window. Returns `false` (and records the message) if new.
 * Empty messageId always returns `false` (bypass dedup).
 */
export function isDuplicate(channelType: string, channelId: string, messageId: string): boolean {
  if (!messageId) return false;

  const now = Date.now();
  evictExpired(now);

  const key = buildKey(channelType, channelId, messageId);
  const insertedAt = cache.get(key);

  if (insertedAt !== undefined && now - insertedAt <= DEFAULT_TTL_MS) {
    return true;
  }

  cache.set(key, now);
  evictOldest();
  return false;
}

/** Clear all cached entries. For testing. */
export function resetInboundDedup(): void {
  cache.clear();
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/inbound-dedup.test.ts`
Expected: PASS (all 10 tests)

**Step 5: Commit**

```bash
git add packages/channels/src/inbound-dedup.ts packages/channels/tests/inbound-dedup.test.ts
git commit -m "feat(channels): add inbound message deduplication cache"
```

---

## Task 2: Channel Manager Integration & Barrel Export

**Files:**
- Modify: `packages/channels/src/manager.ts:102-106`
- Modify: `packages/channels/src/index.ts`

**Step 1: Write the failing test**

No new test file needed — this is a ~3 line integration in the existing manager. The existing channel tests plus the Task 1 unit tests cover correctness. Verify by running the full channel test suite.

**Step 2: Integrate dedup into channel manager**

In `packages/channels/src/manager.ts`, add the import at the top:

```typescript
import { isDuplicate } from './inbound-dedup.js';
```

Replace lines 102-106 (the `onMessage` handler inside `connectAll()`):

```typescript
          adapter.onMessage(async (message) => {
            if (isDuplicate(message.channelType, message.channelId, message.id)) {
              logger.debug(`Duplicate inbound dropped: ${message.channelType}:${message.id}`);
              return;
            }
            if (this.messageHandler) {
              await this.messageHandler(message);
            }
          });
```

**Step 3: Add barrel export**

In `packages/channels/src/index.ts`, add after the Manager export block:

```typescript
// Dedup
export { isDuplicate, resetInboundDedup } from './inbound-dedup.js';
```

**Step 4: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/channels/src/manager.ts packages/channels/src/index.ts
git commit -m "feat(channels): integrate inbound dedup into channel manager"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | Dedup Cache | `inbound-dedup.test.ts` | 10 |
| 2 | Manager Integration | (existing tests) | 0 |
| **Total** | | | **10** |
