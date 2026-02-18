# Compaction Summarization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-summarize dropped messages using AI when conversations exceed context budget, with progressive fallback.

**Architecture:** New `compaction-summarizer.ts` in sessions package with pure functions accepting an injected summarize callback. Runtime wires provider's `complete()` as the callback. `getContextMessages()` fire-and-forget triggers compaction when >40% of messages are dropped.

**Tech Stack:** TypeScript, vitest, Node.js

---

### Task 1: Create compaction summarizer module with tests

**Files:**
- Create: `packages/sessions/src/compaction-summarizer.ts`
- Create: `packages/sessions/tests/compaction-summarizer.test.ts`

**Step 1: Write the failing tests**

Create `packages/sessions/tests/compaction-summarizer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { summarizeMessages, type SummarizeFn } from '../src/compaction-summarizer.js';
import type { Message } from '../src/types.js';

function makeMsg(id: string, content: string, role: 'user' | 'assistant' = 'user'): Message {
  return { id, role, content, timestamp: Date.now() - (100 - Number(id)) * 60000 };
}

describe('summarizeMessages', () => {
  it('summarizes all messages in one call when small enough', async () => {
    const msgs = [makeMsg('1', 'Hello'), makeMsg('2', 'How are you?')];
    const summarize: SummarizeFn = vi.fn().mockResolvedValue('User greeted and asked about wellbeing.');
    const result = await summarizeMessages(msgs, summarize);
    expect(result).toBe('User greeted and asked about wellbeing.');
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('chunks large message sets and merges summaries', async () => {
    const msgs = Array.from({ length: 20 }, (_, i) =>
      makeMsg(String(i), 'X'.repeat(3000)),
    );
    const summarize: SummarizeFn = vi.fn().mockResolvedValue('Chunk summary.');
    const result = await summarizeMessages(msgs, summarize);
    expect(result).toContain('Chunk summary');
    // Called once per chunk + once to merge
    expect((summarize as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it('returns size-only description when summarizer fails', async () => {
    const msgs = [makeMsg('1', 'Hello'), makeMsg('2', 'World')];
    const summarize: SummarizeFn = vi.fn().mockRejectedValue(new Error('API down'));
    const result = await summarizeMessages(msgs, summarize);
    expect(result).toMatch(/2 messages.*summarization failed/i);
  });

  it('returns size-only description for empty messages', async () => {
    const summarize: SummarizeFn = vi.fn();
    const result = await summarizeMessages([], summarize);
    expect(result).toContain('0 messages');
    expect(summarize).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/compaction-summarizer.test.ts`
Expected: FAIL — cannot find `../src/compaction-summarizer.js`

**Step 3: Write the implementation**

Create `packages/sessions/src/compaction-summarizer.ts`:

```typescript
import type { Message } from './types.js';

/** Injected function that summarizes text using an AI provider. */
export type SummarizeFn = (prompt: string) => Promise<string>;

/** Max chars to include in a single summarization prompt. */
const MAX_PROMPT_CHARS = 50_000;

/**
 * Summarize a list of messages using AI with progressive fallback.
 *
 * 1. Try summarizing all messages in one call.
 * 2. If too large, chunk into groups and summarize each, then merge.
 * 3. If all calls fail, return a size-only description.
 */
export async function summarizeMessages(
  messages: Message[],
  summarize: SummarizeFn,
): Promise<string> {
  if (messages.length === 0) {
    return '[0 messages — nothing to summarize]';
  }

  const formatted = formatMessages(messages);

  // Tier 1: Try single-call summarization
  if (formatted.length <= MAX_PROMPT_CHARS) {
    try {
      return await summarize(buildPrompt(formatted));
    } catch {
      return sizeOnlyDescription(messages);
    }
  }

  // Tier 2: Chunk and summarize
  try {
    return await chunkAndSummarize(messages, summarize);
  } catch {
    return sizeOnlyDescription(messages);
  }
}

function formatMessages(messages: Message[]): string {
  return messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n');
}

function buildPrompt(formatted: string): string {
  return (
    'Summarize the following conversation concisely. ' +
    'Preserve key decisions, user preferences, established facts, and action items. ' +
    'Be factual and brief.\n\n' +
    formatted
  );
}

async function chunkAndSummarize(
  messages: Message[],
  summarize: SummarizeFn,
): Promise<string> {
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let currentLength = 0;

  for (const msg of messages) {
    const msgLength = msg.content.length + msg.role.length + 10;
    if (currentLength + msgLength > MAX_PROMPT_CHARS && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(msg);
    currentLength += msgLength;
  }
  if (current.length > 0) chunks.push(current);

  // Summarize each chunk
  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    const formatted = formatMessages(chunk);
    const summary = await summarize(buildPrompt(formatted));
    chunkSummaries.push(summary);
  }

  // Merge summaries
  if (chunkSummaries.length === 1) return chunkSummaries[0]!;

  const mergePrompt =
    'Merge these conversation summaries into one cohesive summary. ' +
    'Preserve key decisions, preferences, and facts.\n\n' +
    chunkSummaries.map((s, i) => `Part ${i + 1}:\n${s}`).join('\n\n');

  return await summarize(mergePrompt);
}

function sizeOnlyDescription(messages: Message[]): string {
  const first = messages[0];
  const last = messages[messages.length - 1];
  const from = first ? new Date(first.timestamp).toISOString() : 'unknown';
  const to = last ? new Date(last.timestamp).toISOString() : 'unknown';
  return `[${messages.length} messages from ${from} to ${to} — summarization failed]`;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/compaction-summarizer.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Add re-export to barrel**

In `packages/sessions/src/index.ts`, add:
```typescript
export { summarizeMessages, type SummarizeFn } from './compaction-summarizer.js';
```

**Step 6: Commit**

```bash
git add packages/sessions/src/compaction-summarizer.ts packages/sessions/tests/compaction-summarizer.test.ts packages/sessions/src/index.ts
git commit -m "feat(sessions): add compaction summarizer with progressive fallback

Single-call for small histories, chunk+merge for large ones,
size-only description when AI unavailable.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Wire auto-compaction into getContextMessages and runtime

**Files:**
- Modify: `packages/sessions/src/manager.ts:8-9,17-30,229-262`
- Modify: `packages/runtime/src/index.ts` (after initializeProviders)

**Step 1: Add summarizer injection to SessionManager**

In `packages/sessions/src/manager.ts`:

Add import at top (after existing imports, line 8):
```typescript
import type { SummarizeFn } from './compaction-summarizer.js';
import { summarizeMessages } from './compaction-summarizer.js';
```

Add fields after existing constants (around line 29):
```typescript
  /** Minimum fraction of messages that must be dropped to trigger compaction. */
  private static readonly COMPACTION_THRESHOLD = 0.40;

  /** Minimum cooldown between compaction attempts per session (ms). */
  private static readonly COMPACTION_COOLDOWN_MS = 5 * 60 * 1000;

  private summarizer: SummarizeFn | null = null;
  private compactionCooldowns: Map<string, number> = new Map();
```

Add method:
```typescript
  setSummarizer(fn: SummarizeFn): void {
    this.summarizer = fn;
  }
```

**Step 2: Add auto-compaction trigger to getContextMessages**

After the `return degradeContext(...)` line in the in-memory branch (around line 257), replace the return with:

```typescript
      const degraded = degradeContext(session.messages, selected, effectiveBudget);

      // Auto-compaction: fire-and-forget when too many messages dropped
      this.maybeAutoCompact(session.id, session.messages, selected);

      return degraded;
```

Add the private method:
```typescript
  private maybeAutoCompact(sessionId: string, allMessages: Message[], selected: Message[]): void {
    if (!this.summarizer || !this.config.compactionEnabled) return;
    if (allMessages.length === 0) return;

    const droppedFraction = 1 - selected.length / allMessages.length;
    if (droppedFraction < SessionManager.COMPACTION_THRESHOLD) return;

    // Debounce per session
    const lastCompaction = this.compactionCooldowns.get(sessionId) ?? 0;
    if (Date.now() - lastCompaction < SessionManager.COMPACTION_COOLDOWN_MS) return;
    this.compactionCooldowns.set(sessionId, Date.now());

    const droppedMessages = allMessages.slice(0, allMessages.length - selected.length);
    const summarizer = this.summarizer;

    summarizeMessages(droppedMessages, summarizer)
      .then((summary) => this.compact(sessionId, summary))
      .catch(() => {});
  }
```

**Step 3: Wire runtime to inject summarizer**

In `packages/runtime/src/index.ts`, find where `initializeProviders()` is called (in the `start()` method). After `await this.initializeProviders()`, add:

```typescript
    // Inject summarizer for auto-compaction
    if (this.providers) {
      this.sessions.setSummarizer(async (prompt: string) => {
        const provider = this.providers!.getPrimaryProvider();
        const result = await provider.complete(
          [{ role: 'user', content: prompt }],
          { maxTokens: 1024 },
        );
        return result.content;
      });
    }
```

**Step 4: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/sessions/src/manager.ts packages/runtime/src/index.ts
git commit -m "feat(sessions): wire auto-compaction into getContextMessages

Triggers AI summarization when >40% of messages are dropped.
Fire-and-forget with 5-minute debounce per session.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Add StreamingOverrides to UserIdentity and DraftStreamLoop

**Files:**
- Modify: `packages/social/src/types.ts:37-48`
- Modify: `packages/social/src/index.ts`
- Modify: `packages/channels/src/draft-stream-loop.ts:14-17`
- Create: `packages/channels/tests/draft-stream-loop-overrides.test.ts`

**Step 1: Write the failing tests**

Create `packages/channels/tests/draft-stream-loop-overrides.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftStreamLoop } from '../src/draft-stream-loop.js';

describe('DraftStreamLoop with overrides', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('uses default throttle when no override', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(send);
    loop.update('first');
    // Default 1000ms throttle — first call is immediate (0 elapsed)
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith('first');
  });

  it('uses custom throttle from overrides', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(send, { coalescingIdleMs: 500 });
    loop.update('first');
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    // Send first, then update again — should throttle at 500ms
    loop.update('second');
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1); // Still throttled
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('falls back to defaults for unset overrides', () => {
    const send = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(send, { typingDelayMs: 2000 });
    // Should not throw — coalescingIdleMs falls back to default 1000
    loop.update('test');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/draft-stream-loop-overrides.test.ts`
Expected: FAIL — constructor signature mismatch

**Step 3: Add StreamingOverrides type**

In `packages/social/src/types.ts`, add before `UserIdentity` (around line 36):

```typescript
/** Per-account overrides for streaming/coalescing behavior. */
export interface StreamingOverrides {
  /** Coalescing idle timeout in milliseconds. Default: 1000 */
  coalescingIdleMs?: number;
  /** Minimum characters per coalesced chunk. Default: 800 */
  minChunkChars?: number;
  /** Maximum characters per coalesced chunk. Default: 1200 */
  maxChunkChars?: number;
  /** Typing indicator delay in milliseconds. Default: 4000 */
  typingDelayMs?: number;
}
```

Add to `UserIdentity` interface (after `personalityRelationship`):
```typescript
  streamingOverrides?: StreamingOverrides;
```

In `packages/social/src/index.ts`, add to type exports:
```typescript
  StreamingOverrides,
```

**Step 4: Modify DraftStreamLoop to accept overrides**

In `packages/channels/src/draft-stream-loop.ts`, change constructor (line 14-17):

From:
```typescript
  constructor(
    private readonly sendOrEdit: (text: string) => Promise<boolean>,
    private readonly throttleMs = 1000,
  ) {}
```

To:
```typescript
  constructor(
    private readonly sendOrEdit: (text: string) => Promise<boolean>,
    overrides?: { coalescingIdleMs?: number; typingDelayMs?: number } | number,
  ) {
    this.throttleMs = typeof overrides === 'number'
      ? overrides
      : overrides?.coalescingIdleMs ?? 1000;
  }

  private readonly throttleMs: number;
```

Also remove the `private readonly throttleMs = 1000` from the constructor parameter and add it as a class field.

**Step 5: Add updateStreamingOverrides to UserManager**

In `packages/social/src/user-manager.ts`, add `streamingOverrides` to the `updateUser` method's Partial pick type (line 65):

```typescript
  async updateUser(
    id: string,
    updates: Partial<Pick<UserIdentity, 'name' | 'role' | 'channels' | 'trustOverrides' | 'memoryPartition' | 'personalityRelationship' | 'streamingOverrides'>>,
  ): Promise<UserIdentity | undefined> {
```

And add the field update (after line 76):
```typescript
    if (updates.streamingOverrides !== undefined) user.streamingOverrides = updates.streamingOverrides;
```

**Step 6: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/social/src/types.ts packages/social/src/index.ts packages/social/src/user-manager.ts packages/channels/src/draft-stream-loop.ts packages/channels/tests/draft-stream-loop-overrides.test.ts
git commit -m "feat(social/channels): add per-account streaming overrides

StreamingOverrides on UserIdentity allows per-user coalescing and
typing delay settings. DraftStreamLoop accepts overrides object.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
