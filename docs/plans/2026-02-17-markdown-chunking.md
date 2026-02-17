# Markdown-Aware Chunking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 11 duplicated `chunkMessage()` methods across channel adapters with a shared `chunkMarkdown()` function that understands fenced code blocks, markdown links, and paragraph boundaries.

**Architecture:** Single new file `packages/channels/src/chunk.ts` exports `chunkMarkdown(text, maxLength)`. Each adapter imports it and deletes its private method. The function preserves fenced code blocks intact, prefers paragraph boundaries, and falls back through newlines → spaces → hard cuts.

**Tech Stack:** TypeScript, vitest, pnpm workspace (no new dependencies)

---

### Task 1: Create `chunkMarkdown()` with tests

**Files:**
- Create: `packages/channels/src/chunk.ts`
- Create: `packages/channels/tests/chunk.test.ts`

**Step 1: Write the failing tests**

Create `packages/channels/tests/chunk.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from '../src/chunk.js';

describe('chunkMarkdown', () => {
  it('returns short text as single chunk', () => {
    expect(chunkMarkdown('hello world', 100)).toEqual(['hello world']);
  });

  it('returns empty string as single-element array', () => {
    expect(chunkMarkdown('', 100)).toEqual(['']);
  });

  it('splits at paragraph boundaries', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = chunkMarkdown(text, 30);
    // Each paragraph fits in 30 chars
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
    expect(chunks.join('\n\n')).toBe(text);
  });

  it('preserves fenced code block that fits in one chunk', () => {
    const code = '```js\nconsole.log("hi");\n```';
    const text = `Before.\n\n${code}\n\nAfter.`;
    const chunks = chunkMarkdown(text, 60);
    // The code block should appear intact in one chunk
    const codeChunk = chunks.find(c => c.includes('```js'));
    expect(codeChunk).toContain('```js');
    expect(codeChunk).toContain('```');
  });

  it('splits oversized code block at newlines within the block', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const text = '```\n' + lines + '\n```';
    const chunks = chunkMarkdown(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    // First chunk should start with opening fence
    expect(chunks[0]).toMatch(/^```/);
    // Last chunk should end with closing fence
    expect(chunks[chunks.length - 1]).toMatch(/```$/);
  });

  it('does not split inside markdown links', () => {
    const link = '[click here](https://example.com/very/long/path)';
    const text = 'Some text. ' + link + ' more text.';
    // maxLength is bigger than the link but smaller than whole text
    const chunks = chunkMarkdown(text, 70);
    const linkChunk = chunks.find(c => c.includes('[click here]'));
    expect(linkChunk).toContain('(https://example.com/very/long/path)');
  });

  it('falls back to space boundaries', () => {
    const text = 'word1 word2 word3 word4 word5 word6 word7 word8';
    const chunks = chunkMarkdown(text, 20);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it('hard-cuts when no break points exist', () => {
    const text = 'a'.repeat(50);
    const chunks = chunkMarkdown(text, 20);
    expect(chunks).toEqual(['a'.repeat(20), 'a'.repeat(20), 'a'.repeat(10)]);
  });

  it('handles mixed content with code and paragraphs', () => {
    const text = 'Hello.\n\n```\ncode\n```\n\nGoodbye.';
    const chunks = chunkMarkdown(text, 25);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25);
    }
  });

  it('works with different maxLength values', () => {
    const text = 'A'.repeat(100);
    expect(chunkMarkdown(text, 50)).toHaveLength(2);
    expect(chunkMarkdown(text, 25)).toHaveLength(4);
    expect(chunkMarkdown(text, 100)).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/channels && npx vitest run tests/chunk.test.ts`
Expected: FAIL — cannot find `../src/chunk.js`

**Step 3: Write the implementation**

Create `packages/channels/src/chunk.ts`:

```typescript
/**
 * Markdown-aware text chunking for channel adapters.
 *
 * Splitting priority:
 * 1. If text fits, return as-is
 * 2. Never split inside fenced code blocks (find closing fence first)
 * 3. Prefer paragraph boundaries (\n\n)
 * 4. Fall back to newline boundaries (\n)
 * 5. Fall back to space boundaries
 * 6. Hard cut at maxLength
 * 7. Oversized code blocks split at newlines within the block
 */

const FENCE_OPEN = /^```[\s\S]*?$/m;
const FENCE_CLOSE = /^```\s*$/m;
const LINK_RE = /\[[^\]]*\]\([^)]*\)/g;

export function chunkMarkdown(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Check if we are inside a fenced code block at position 0
    const fenceMatch = remaining.match(/^```[^\n]*\n/);
    if (fenceMatch) {
      const closeIndex = remaining.indexOf('\n```', fenceMatch[0].length);
      if (closeIndex !== -1) {
        const blockEnd = closeIndex + 4; // include \n```
        // Find end of closing fence line
        const lineEnd = remaining.indexOf('\n', blockEnd);
        const fullBlockEnd = lineEnd === -1 ? remaining.length : lineEnd;

        if (fullBlockEnd <= maxLength) {
          // Whole code block fits — take it as one chunk
          chunks.push(remaining.slice(0, fullBlockEnd).trimEnd());
          remaining = remaining.slice(fullBlockEnd).replace(/^\n+/, '');
          continue;
        }
        // Oversized code block — split at newlines within it
        const blockText = remaining.slice(0, fullBlockEnd);
        chunks.push(...splitCodeBlock(blockText, maxLength));
        remaining = remaining.slice(fullBlockEnd).replace(/^\n+/, '');
        continue;
      }
    }

    const breakPoint = findBreakPoint(remaining, maxLength);
    chunks.push(remaining.slice(0, breakPoint).trimEnd());
    remaining = remaining.slice(breakPoint).replace(/^\n+/, '').trimStart();
  }

  return chunks;
}

function findBreakPoint(text: string, maxLength: number): number {
  const window = text.slice(0, maxLength);

  // Check for a fenced code block starting within the window
  // Don't break before a code block's closing fence
  const fenceStart = window.search(/\n```[^\n]*\n/);
  if (fenceStart !== -1) {
    // There is a code fence opening in our window. Find its close.
    const afterOpen = text.indexOf('\n', fenceStart + 1);
    if (afterOpen !== -1) {
      const closeIdx = text.indexOf('\n```', afterOpen);
      if (closeIdx !== -1 && closeIdx < maxLength) {
        // Closing fence is within window — break after it
        const lineEnd = text.indexOf('\n', closeIdx + 4);
        const end = lineEnd === -1 ? closeIdx + 4 : lineEnd;
        if (end <= maxLength) {
          return end;
        }
      }
    }
    // Code block extends beyond window — break before the fence
    if (fenceStart > 0) {
      return fenceStart;
    }
  }

  // Try paragraph boundary
  let bp = window.lastIndexOf('\n\n');
  if (bp > maxLength / 4) {
    return bp;
  }

  // Try newline boundary, but avoid splitting markdown links
  bp = window.lastIndexOf('\n');
  if (bp > maxLength / 4) {
    if (!isInsideLink(text, bp)) {
      return bp;
    }
  }

  // Try space boundary, avoiding link splits
  bp = window.lastIndexOf(' ');
  if (bp > maxLength / 4) {
    if (!isInsideLink(text, bp)) {
      return bp;
    }
  }

  // Hard cut
  return maxLength;
}

function isInsideLink(text: string, position: number): boolean {
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (position > start && position < end) {
      return true;
    }
    if (start > position) break;
  }
  return false;
}

function splitCodeBlock(block: string, maxLength: number): string[] {
  const lines = block.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/channels && npx vitest run tests/chunk.test.ts`
Expected: PASS (all 9 tests)

**Step 5: Commit**

```bash
git add packages/channels/src/chunk.ts packages/channels/tests/chunk.test.ts
git commit -m "feat(channels): add markdown-aware chunkMarkdown() function

Shared chunking that preserves fenced code blocks, markdown links,
and prefers paragraph boundaries over arbitrary splits."
```

---

### Task 2: Replace chunkMessage() in adapters (batch 1: discord, telegram, slack, teams, twilio)

**Files:**
- Modify: `packages/channels/src/adapters/discord.ts:1,164,195-223`
- Modify: `packages/channels/src/adapters/telegram.ts:1,119,150-178`
- Modify: `packages/channels/src/adapters/slack.ts:1,185,229-257`
- Modify: `packages/channels/src/adapters/teams.ts:1,200,251-279`
- Modify: `packages/channels/src/adapters/twilio.ts:1,135,185-212`

For each adapter, make three changes:

**Change A — Add import** (at the top of the file, near existing imports):
```typescript
import { chunkMarkdown } from '../chunk.js';
```

**Change B — Replace call site:**

For discord (line 164), telegram (line 119), slack (line 185), teams (line 200):
```typescript
// Before:
const chunks = this.chunkMessage(message.content);
// After:
const chunks = chunkMarkdown(message.content, MAX_MESSAGE_LENGTH);
```

For twilio (line 135):
```typescript
// Before:
const chunks = this.chunkMessage(message.content, maxLength);
// After:
const chunks = chunkMarkdown(message.content, maxLength);
```

**Change C — Delete `private chunkMessage()` method entirely:**

- discord: delete lines 195-223
- telegram: delete lines 150-178
- slack: delete lines 229-257
- teams: delete lines 251-279
- twilio: delete lines 185-212

**Step 1: Make all five edits**

Apply the three changes (import, call site, delete method) to each of the 5 adapters.

**Step 2: Run existing adapter tests to verify nothing breaks**

Run: `cd packages/channels && npx vitest run`
Expected: All existing tests PASS

**Step 3: Commit**

```bash
git add packages/channels/src/adapters/discord.ts packages/channels/src/adapters/telegram.ts packages/channels/src/adapters/slack.ts packages/channels/src/adapters/teams.ts packages/channels/src/adapters/twilio.ts
git commit -m "refactor(channels): replace chunkMessage in discord, telegram, slack, teams, twilio

Use shared chunkMarkdown() instead of per-adapter private methods.
Removes ~140 lines of duplicated code."
```

---

### Task 3: Replace chunkMessage() in adapters (batch 2: whatsapp, googlechat, signal, matrix, zalo, bluebubbles)

**Files:**
- Modify: `packages/channels/src/adapters/whatsapp.ts:1,251,306-334`
- Modify: `packages/channels/src/adapters/googlechat.ts:1,274,323-351`
- Modify: `packages/channels/src/adapters/signal.ts:1,233,277-305`
- Modify: `packages/channels/src/adapters/matrix.ts:1,264,309-337`
- Modify: `packages/channels/src/adapters/zalo.ts:1,230,283-311`
- Modify: `packages/channels/src/adapters/bluebubbles.ts:1,192,237-265`

Same three changes per adapter as Task 2:

**Change A — Add import:**
```typescript
import { chunkMarkdown } from '../chunk.js';
```

**Change B — Replace call site** (each uses `this.chunkMessage(message.content)` → `chunkMarkdown(message.content, MAX_MESSAGE_LENGTH)`):

- whatsapp line 251
- googlechat line 274
- signal line 233
- matrix line 264
- zalo line 230
- bluebubbles line 192

**Change C — Delete `private chunkMessage()` method:**

- whatsapp: lines 306-334
- googlechat: lines 323-351
- signal: lines 277-305
- matrix: lines 309-337
- zalo: lines 283-311
- bluebubbles: lines 237-265

**Step 1: Make all six edits**

Apply the three changes to each of the 6 adapters.

**Step 2: Run all channel tests**

Run: `cd packages/channels && npx vitest run`
Expected: All tests PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All ~3,076 tests PASS

**Step 4: Commit**

```bash
git add packages/channels/src/adapters/whatsapp.ts packages/channels/src/adapters/googlechat.ts packages/channels/src/adapters/signal.ts packages/channels/src/adapters/matrix.ts packages/channels/src/adapters/zalo.ts packages/channels/src/adapters/bluebubbles.ts
git commit -m "refactor(channels): replace chunkMessage in remaining 6 adapters

Use shared chunkMarkdown() for whatsapp, googlechat, signal, matrix,
zalo, and bluebubbles. Removes ~168 lines of duplicated code."
```
