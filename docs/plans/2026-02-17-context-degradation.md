# Progressive Context Degradation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When conversations exceed the context budget, insert omission markers and truncate oversized messages instead of silently dropping history.

**Architecture:** New `context-degradation.ts` module in `packages/sessions/src/` with pure functions. `getContextMessages()` in `manager.ts` calls `degradeContext()` after selecting messages. Runtime passes real `maxContextTokens` from provider metadata.

**Tech Stack:** TypeScript, vitest, Node.js

---

### Task 1: Create context degradation module with tests

**Files:**
- Create: `packages/sessions/src/context-degradation.ts`
- Create: `packages/sessions/tests/context-degradation.test.ts`

**Step 1: Write the failing tests**

Create `packages/sessions/tests/context-degradation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { degradeContext, insertOmissionMarker, truncateLargeMessage } from '../src/context-degradation.js';
import type { Message } from '../src/types.js';

function makeMsg(id: string, content: string, role: 'user' | 'assistant' = 'user'): Message {
  return { id, role, content, timestamp: Date.now() };
}

describe('insertOmissionMarker', () => {
  it('returns undefined when no messages were omitted', () => {
    expect(insertOmissionMarker(5, 5)).toBeUndefined();
  });

  it('returns a system message with correct count', () => {
    const marker = insertOmissionMarker(10, 3);
    expect(marker).toBeDefined();
    expect(marker!.role).toBe('system');
    expect(marker!.content).toContain('7 earlier messages omitted');
  });

  it('handles singular message', () => {
    const marker = insertOmissionMarker(3, 2);
    expect(marker!.content).toContain('1 earlier message omitted');
  });
});

describe('truncateLargeMessage', () => {
  it('returns content unchanged when under threshold', () => {
    const short = 'Hello world';
    expect(truncateLargeMessage(short, 8000)).toBe(short);
  });

  it('truncates oversized content with head + tail', () => {
    const large = 'A'.repeat(10000);
    const result = truncateLargeMessage(large, 8000);
    expect(result.length).toBeLessThan(large.length);
    expect(result).toContain('[...truncated');
    // Head starts with A's
    expect(result.startsWith('A')).toBe(true);
    // Tail ends with A's
    expect(result.endsWith('A')).toBe(true);
  });
});

describe('degradeContext', () => {
  it('returns selected messages unchanged when all fit', () => {
    const all = [makeMsg('1', 'hi'), makeMsg('2', 'hello'), makeMsg('3', 'bye')];
    const result = degradeContext(all, all, 100000);
    expect(result).toEqual(all);
  });

  it('inserts omission marker when messages were dropped', () => {
    const all = [makeMsg('1', 'first'), makeMsg('2', 'second'), makeMsg('3', 'third'), makeMsg('4', 'fourth')];
    const selected = [makeMsg('1', 'first'), makeMsg('4', 'fourth')];
    const result = degradeContext(all, selected, 100000);
    expect(result).toHaveLength(3); // first + marker + fourth
    expect(result[0].content).toBe('first');
    expect(result[1].role).toBe('system');
    expect(result[1].content).toContain('2 earlier messages omitted');
    expect(result[2].content).toBe('fourth');
  });

  it('keeps first 2 messages for context anchoring', () => {
    const all = Array.from({ length: 10 }, (_, i) => makeMsg(String(i), `msg-${i}`));
    const selected = [all[0], all[1], all[8], all[9]];
    const result = degradeContext(all, selected, 100000);
    expect(result[0].content).toBe('msg-0');
    expect(result[1].content).toBe('msg-1');
    expect(result[2].role).toBe('system'); // marker
    expect(result[3].content).toBe('msg-8');
    expect(result[4].content).toBe('msg-9');
  });

  it('truncates large messages in the result', () => {
    const all = [makeMsg('1', 'A'.repeat(10000))];
    const result = degradeContext(all, all, 100000, 8000);
    expect(result[0].content).toContain('[...truncated');
  });

  it('handles edge case: all messages dropped except none', () => {
    const all = [makeMsg('1', 'hi'), makeMsg('2', 'hello')];
    const selected: Message[] = [];
    const result = degradeContext(all, selected, 100000);
    expect(result).toHaveLength(1); // just the marker
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('2 earlier messages omitted');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/context-degradation.test.ts`
Expected: FAIL — cannot find `../src/context-degradation.js`

**Step 3: Write the implementation**

Create `packages/sessions/src/context-degradation.ts`:

```typescript
import type { Message } from './types.js';

/**
 * Create a synthetic system message indicating omitted history.
 * Returns undefined if no messages were omitted.
 */
export function insertOmissionMarker(allCount: number, selectedCount: number): Message | undefined {
  const omitted = allCount - selectedCount;
  if (omitted <= 0) return undefined;

  const plural = omitted === 1 ? 'message' : 'messages';
  return {
    id: `_omission_marker_${Date.now()}`,
    role: 'system',
    content: `[...${omitted} earlier ${plural} omitted...]`,
    timestamp: Date.now(),
  };
}

/**
 * Truncate a message's content if it exceeds maxChars.
 * Keeps the first 40% and last 40%, with a marker in between.
 */
export function truncateLargeMessage(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  const headSize = Math.floor(maxChars * 0.4);
  const tailSize = Math.floor(maxChars * 0.4);
  const omitted = content.length - headSize - tailSize;

  return `${content.slice(0, headSize)}\n[...truncated ${omitted} chars...]\n${content.slice(-tailSize)}`;
}

/**
 * Apply progressive degradation to context messages.
 *
 * Tier 1: Insert omission marker if messages were dropped.
 * Tier 2: Truncate individual messages exceeding maxMessageChars.
 *
 * @param allMessages - Complete conversation history
 * @param selectedMessages - Messages that fit the token budget
 * @param budget - Token budget (unused directly, for future expansion)
 * @param maxMessageChars - Max characters per message before truncation (default 8000)
 */
export function degradeContext(
  allMessages: Message[],
  selectedMessages: Message[],
  budget: number,
  maxMessageChars: number = 8000,
): Message[] {
  // Tier 2: Truncate oversized messages
  const truncated = selectedMessages.map((msg) => {
    const newContent = truncateLargeMessage(msg.content, maxMessageChars);
    if (newContent === msg.content) return msg;
    return { ...msg, content: newContent };
  });

  // Tier 1: Insert omission marker if messages were dropped
  const marker = insertOmissionMarker(allMessages.length, selectedMessages.length);
  if (!marker) return truncated;

  if (truncated.length === 0) return [marker];

  // Keep first 2 messages (context anchors), insert marker, then rest
  const anchorCount = Math.min(2, truncated.length);
  const anchors = truncated.slice(0, anchorCount);
  const rest = truncated.slice(anchorCount);

  return [...anchors, marker, ...rest];
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/context-degradation.test.ts`
Expected: PASS (all 9 tests)

**Step 5: Add re-export to barrel**

In `packages/sessions/src/index.ts`, add:
```typescript
export { degradeContext, insertOmissionMarker, truncateLargeMessage } from './context-degradation.js';
```

**Step 6: Commit**

```bash
git add packages/sessions/src/context-degradation.ts packages/sessions/tests/context-degradation.test.ts packages/sessions/src/index.ts
git commit -m "feat(sessions): add progressive context degradation module

Tier 1 inserts omission markers when messages are dropped.
Tier 2 truncates oversized messages with head+tail preservation."
```

---

### Task 2: Integrate degradation into getContextMessages

**Files:**
- Modify: `packages/sessions/src/manager.ts:229-261`

**Step 1: Read current `getContextMessages` method**

Read `packages/sessions/src/manager.ts` lines 229-261. The method currently:
1. Computes `effectiveBudget` from `maxTokens` param or config
2. Iterates messages newest-first, accumulating tokens
3. Returns only messages that fit

**Step 2: Add import and call degradeContext**

At the top of `packages/sessions/src/manager.ts`, add to existing imports:
```typescript
import { degradeContext } from './context-degradation.js';
```

**Step 3: Modify the in-memory branch (lines 246-256)**

Replace:
```typescript
    if (session) {
      const messages: Message[] = [];
      let tokenCount = 0;
      for (let i = session.messages.length - 1; i >= 0; i--) {
        const msg = session.messages[i];
        const msgTokens = estimateTokens(msg.content);
        if (tokenCount + msgTokens > effectiveBudget) break;
        messages.unshift(msg);
        tokenCount += msgTokens;
      }
      return messages;
    }
```

With:
```typescript
    if (session) {
      const selected: Message[] = [];
      let tokenCount = 0;
      for (let i = session.messages.length - 1; i >= 0; i--) {
        const msg = session.messages[i];
        const msgTokens = estimateTokens(msg.content);
        if (tokenCount + msgTokens > effectiveBudget) break;
        selected.unshift(msg);
        tokenCount += msgTokens;
      }
      return degradeContext(session.messages, selected, effectiveBudget);
    }
```

**Step 4: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/sessions/src/manager.ts
git commit -m "feat(sessions): integrate context degradation into getContextMessages

Calls degradeContext() after message selection to insert omission
markers and truncate oversized messages."
```

---

### Task 3: Pass real maxContextTokens from provider metadata

**Files:**
- Modify: `packages/runtime/src/index.ts:2034,2683,2900,3148`

**Step 1: Read the 4 call sites**

All 4 call sites currently pass `undefined` for `maxTokens`:
- Line 2034: `this.sessions.getContextMessages(session.id, undefined, 4096)`
- Line 2683: `this.sessions.getContextMessages(session.id, undefined, 4096)`
- Line 2900: `this.sessions.getContextMessages(session.id, undefined, 4096)`
- Line 3148: `this.sessions.getContextMessages(sessionId)` (no maxTokens at all)

**Step 2: Create helper method to get maxContextTokens from provider**

The `provider` variable is resolved before `getContextMessages()` at lines 2034, 2683, and 2900. For line 3148, the provider is `this.providers.getPrimaryProvider()`.

Add a private helper method to the Auxiora class:

```typescript
  private getProviderMaxTokens(provider: Provider): number | undefined {
    const model = provider.defaultModel;
    const modelInfo = provider.metadata?.models?.[model];
    return modelInfo?.maxContextTokens;
  }
```

**Step 3: Update the 3 call sites with provider access**

At line 2034 (after `provider` is resolved around line 2118-2128):
```typescript
    const contextMessages = this.sessions.getContextMessages(
      session.id,
      this.getProviderMaxTokens(provider),
      4096,
    );
```

At line 2683:
```typescript
        const contextMessages = this.sessions.getContextMessages(
          session.id,
          this.getProviderMaxTokens(this.providers.getPrimaryProvider()),
          4096,
        );
```

At line 2900:
```typescript
    const contextMessages = this.sessions.getContextMessages(
      session.id,
      this.getProviderMaxTokens(provider),
      4096,
    );
```

At line 3148 (uses primary provider, no output reserve):
```typescript
      const recentMessages = this.sessions.getContextMessages(
        sessionId,
        this.getProviderMaxTokens(this.providers.getPrimaryProvider()),
      );
```

**Step 4: Add Provider import if not already present**

Check if `Provider` type is imported. If not, add:
```typescript
import type { Provider } from '@auxiora/providers';
```

**Step 5: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): pass real maxContextTokens from provider metadata

Replaces hardcoded undefined with actual model context limits at all
4 getContextMessages call sites."
```
