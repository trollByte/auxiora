# Transcript Repair (Session Sanitizer) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a pre-flight transcript sanitizer that detects and fixes broken message patterns left by interrupted tool loops, preventing degraded AI responses on session resume.

**Architecture:** A pure `sanitizeTranscript(messages)` function drops trailing orphans (`[Tool Results]` without response, dangling tool announcements), merges consecutive same-role messages, and strips empty content. Called at each `getContextMessages()` call site before mapping to `chatMessages`.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest

---

## Codebase Context

**Message type** (`packages/sessions/src/types.ts:3-12`):
```typescript
interface Message {
  id: string;
  role: MessageRole;  // 'user' | 'assistant' | 'system'
  content: string;
  timestamp: number;
  tokens?: { input?: number; output?: number };
}
```

**Tool results format** (`packages/runtime/src/index.ts:2552`): Stored as `user` messages starting with `[Tool Results]\n`.

**Tool announcement format** (`packages/runtime/src/index.ts:~2530`): Stored as `assistant` messages like `"I'll use read_file, bash to help with this."`.

**getContextMessages call sites** (`packages/runtime/src/index.ts`):
- Line 2024: webchat `handleMessage()`
- Line 2673: voice `handleVoiceMessage()`
- Line 2884: channel `handleChannelMessage()`
- Line 3131: `extractAndLearn()` — NOT an API call, skip sanitization here

**Barrel export** (`packages/sessions/src/index.ts`): Exports SessionManager, types, estimateTokens.

---

## Task 1: Sanitize Transcript Module

**Files:**
- Create: `packages/sessions/src/sanitize-transcript.ts`
- Create: `packages/sessions/tests/sanitize-transcript.test.ts`

**Step 1: Write the failing tests**

Create `packages/sessions/tests/sanitize-transcript.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeTranscript } from '../src/sanitize-transcript.js';
import type { Message } from '../src/types.js';

function msg(role: 'user' | 'assistant', content: string): Message {
  return { id: `${role}-${Date.now()}-${Math.random()}`, role, content, timestamp: Date.now() };
}

describe('sanitizeTranscript', () => {
  it('should return empty array for empty input', () => {
    expect(sanitizeTranscript([])).toEqual([]);
  });

  it('should pass through a clean transcript unchanged', () => {
    const messages = [
      msg('user', 'Hello'),
      msg('assistant', 'Hi there!'),
      msg('user', 'How are you?'),
      msg('assistant', 'I am doing well.'),
    ];
    const result = sanitizeTranscript(messages);
    expect(result).toHaveLength(4);
    expect(result.map(m => m.content)).toEqual([
      'Hello', 'Hi there!', 'How are you?', 'I am doing well.',
    ]);
  });

  describe('drop empty messages', () => {
    it('should drop messages with empty content', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', ''),
        msg('user', '   '),
        msg('assistant', 'Response'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Response');
    });
  });

  describe('trailing orphan [Tool Results]', () => {
    it('should drop a trailing [Tool Results] user message', () => {
      const messages = [
        msg('user', 'Please read the file'),
        msg('assistant', "I'll use read_file to help with this."),
        msg('user', '[Tool Results]\nread_file: contents of file.ts'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Please read the file');
    });

    it('should NOT drop [Tool Results] that has a following assistant response', () => {
      const messages = [
        msg('user', 'Please read the file'),
        msg('assistant', "I'll use read_file to help with this."),
        msg('user', '[Tool Results]\nread_file: contents of file.ts'),
        msg('assistant', 'Here is what the file contains.'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(4);
    });
  });

  describe('trailing dangling tool announcement', () => {
    it('should drop a trailing assistant tool announcement', () => {
      const messages = [
        msg('user', 'Run the tests'),
        msg('assistant', "I'll use bash to help with this."),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Run the tests');
    });

    it('should NOT drop a normal trailing assistant message', () => {
      const messages = [
        msg('user', 'What is 2+2?'),
        msg('assistant', 'The answer is 4.'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
    });
  });

  describe('consecutive same-role merge', () => {
    it('should merge consecutive user messages', () => {
      const messages = [
        msg('user', 'First part'),
        msg('user', 'Second part'),
        msg('assistant', 'Response'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First part\n\nSecond part');
      expect(result[0].role).toBe('user');
    });

    it('should merge consecutive assistant messages', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', 'First response'),
        msg('assistant', 'Second response'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('First response\n\nSecond response');
    });
  });

  describe('combined patterns', () => {
    it('should handle multiple broken patterns in one transcript', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', 'Hi!'),
        msg('user', ''),
        msg('user', 'Read file.ts'),
        msg('assistant', "I'll use read_file to help with this."),
        msg('user', '[Tool Results]\nread_file: file contents'),
      ];
      const result = sanitizeTranscript(messages);
      // Empty dropped, consecutive users merged, trailing tool results + announcement dropped
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi!');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/sanitize-transcript.test.ts`
Expected: FAIL — module not found

**Step 3: Implement sanitizeTranscript**

Create `packages/sessions/src/sanitize-transcript.ts`:

```typescript
import type { Message } from './types.js';

const TOOL_RESULTS_PREFIX = '[Tool Results]';
const TOOL_ANNOUNCE_PATTERN = /I'll use \S+/;

/** Drop messages with empty or whitespace-only content. */
function dropEmpty(messages: Message[]): Message[] {
  return messages.filter((m) => m.content.trim().length > 0);
}

/**
 * Drop trailing broken tool-loop messages from the end of the transcript.
 *
 * Repeatedly trims:
 * 1. A trailing `user` message starting with `[Tool Results]` (orphan result)
 * 2. A trailing `assistant` message matching tool announcement pattern (dangling announcement)
 */
function dropTrailingOrphans(messages: Message[]): Message[] {
  const result = [...messages];
  let changed = true;

  while (changed && result.length > 0) {
    changed = false;
    const last = result[result.length - 1];

    // Trailing orphan [Tool Results]
    if (last.role === 'user' && last.content.startsWith(TOOL_RESULTS_PREFIX)) {
      result.pop();
      changed = true;
      continue;
    }

    // Trailing dangling tool announcement
    if (last.role === 'assistant' && TOOL_ANNOUNCE_PATTERN.test(last.content)) {
      result.pop();
      changed = true;
    }
  }

  return result;
}

/** Merge consecutive same-role messages by joining content with double newline. */
function mergeSameRole(messages: Message[]): Message[] {
  if (messages.length === 0) return [];

  const result: Message[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];

    if (curr.role === prev.role) {
      result[result.length - 1] = {
        ...prev,
        content: prev.content + '\n\n' + curr.content,
      };
    } else {
      result.push(curr);
    }
  }

  return result;
}

/**
 * Sanitize a transcript for API consumption.
 *
 * Applies in order:
 * 1. Drop empty/whitespace messages
 * 2. Drop trailing orphan [Tool Results] and dangling tool announcements
 * 3. Merge consecutive same-role messages
 *
 * Pure function — does not mutate the input array or session store.
 */
export function sanitizeTranscript(messages: Message[]): Message[] {
  let result = dropEmpty(messages);
  result = dropTrailingOrphans(result);
  result = mergeSameRole(result);
  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/sanitize-transcript.test.ts`
Expected: PASS (all 9 tests)

**Step 5: Commit**

```bash
git add packages/sessions/src/sanitize-transcript.ts packages/sessions/tests/sanitize-transcript.test.ts
git commit -m "feat(sessions): add transcript sanitizer for broken tool-loop messages"
```

---

## Task 2: Runtime Integration & Barrel Export

**Files:**
- Modify: `packages/sessions/src/index.ts`
- Modify: `packages/runtime/src/index.ts` (lines 2024-2031, 2673-2680, 2884-2891)

**Step 1: Add barrel export**

In `packages/sessions/src/index.ts`, add at the end:

```typescript
export { sanitizeTranscript } from './sanitize-transcript.js';
```

**Step 2: Add import to runtime**

In `packages/runtime/src/index.ts`, find the sessions import (around line 3):

```typescript
import { SessionManager } from '@auxiora/sessions';
```

Change to:

```typescript
import { SessionManager, sanitizeTranscript } from '@auxiora/sessions';
```

If `sanitizeTranscript` is not in the existing import, add it.

**Step 3: Wire sanitizer into webchat handleMessage()**

Find the webchat `getContextMessages` call site (~line 2024-2031):

```typescript
    const contextMessages = this.sessions.getContextMessages(
      session.id,
      undefined,
      4096,
    );
    const chatMessages = contextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
```

Replace with:

```typescript
    const contextMessages = this.sessions.getContextMessages(
      session.id,
      undefined,
      4096,
    );
    const chatMessages = sanitizeTranscript(contextMessages).map((m) => ({
      role: m.role,
      content: m.content,
    }));
```

**Step 4: Wire sanitizer into voice handleVoiceMessage()**

Find the voice `getContextMessages` call site (~line 2673-2680) and apply the same change — wrap `contextMessages` with `sanitizeTranscript()` before `.map()`.

**Step 5: Wire sanitizer into channel handleChannelMessage()**

Find the channel `getContextMessages` call site (~line 2884-2891) and apply the same change.

**Step 6: Do NOT modify extractAndLearn (line 3131)**

The `extractAndLearn` call is for memory extraction, not API calls. Leave it as-is.

**Step 7: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all tests)

**Step 8: Commit**

```bash
git add packages/sessions/src/index.ts packages/runtime/src/index.ts
git commit -m "feat(runtime): wire transcript sanitizer into all API call paths"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | sanitizeTranscript | `sanitize-transcript.test.ts` | 9 |
| 2 | Runtime integration | (existing tests) | 0 |
| **Total** | | | **9** |
