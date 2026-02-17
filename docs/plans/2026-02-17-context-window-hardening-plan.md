# Context Window Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace naive `content.length / 4` token estimation with a content-aware heuristic and add safety margins to prevent context overflow.

**Architecture:** A new `estimateTokens()` function in `packages/sessions/src/token-estimator.ts` detects content type (prose, code, CJK) and applies tuned ratios. `getContextMessages()` in both `manager.ts` and `db.ts` applies a 20% safety margin, output token reserve, and system prompt reserve.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest

---

## Codebase Context

**Current token estimation** (`packages/sessions/src/manager.ts:226`, `packages/sessions/src/db.ts:117`):
```typescript
const msgTokens = Math.ceil(msg.content.length / 4);
```

**`getContextMessages` method** (`packages/sessions/src/manager.ts:216-236`):
- Iterates messages newest-first, accumulates token estimates
- Breaks when limit reached, returns in chronological order
- Takes `(sessionId: string, maxTokens?: number)` — defaults to `config.maxContextTokens`

**DB version** (`packages/sessions/src/db.ts:111-123`): Same algorithm, takes `(chatId: string, maxTokens: number)`.

**SessionConfig** (`packages/sessions/src/types.ts:33-40`): Has `maxContextTokens: number`.

**Barrel export** (`packages/sessions/src/index.ts`): Exports `SessionManager`, `SessionDatabase`, types.

**Existing context windowing test** (`packages/sessions/tests/sessions.test.ts:97-110`):
```typescript
// Creates 20 messages of 100 chars each (25 tokens each at /4)
// Calls getContextMessages(session.id, 125) — expects < 20 messages returned
```

---

## Task 1: Token Estimator

**Files:**
- Create: `packages/sessions/src/token-estimator.ts`
- Create: `packages/sessions/tests/token-estimator.test.ts`

**Step 1: Write the failing tests**

Create `packages/sessions/tests/token-estimator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../src/token-estimator.js';

describe('estimateTokens', () => {
  describe('English prose', () => {
    it('should estimate ~1 token per 4 characters for plain English', () => {
      const text = 'The quick brown fox jumps over the lazy dog near the river';
      const estimate = estimateTokens(text);
      // 58 chars / 4 = 14.5 -> 15
      expect(estimate).toBe(Math.ceil(text.length / 4));
    });

    it('should handle short text', () => {
      expect(estimateTokens('Hi')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('code content', () => {
    it('should estimate higher token density for code', () => {
      const code = 'function foo(bar) { return bar.map((x) => x * 2); }' +
        '\nconst result = foo([1, 2, 3]);' +
        '\nif (result.length > 0) { console.log(result); }';
      const estimate = estimateTokens(code);
      // Code has more tokens per char than prose (operators, brackets)
      const proseEstimate = Math.ceil(code.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });

    it('should detect JSON as code-like', () => {
      const json = '{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}';
      const estimate = estimateTokens(json);
      const proseEstimate = Math.ceil(json.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });
  });

  describe('CJK content', () => {
    it('should estimate higher token density for Chinese text', () => {
      const chinese = '\u4F60\u597D\u4E16\u754C\u6B22\u8FCE\u6765\u5230\u8FD9\u91CC\u6211\u4EEC\u4E00\u8D77\u5B66\u4E60\u4EBA\u5DE5\u667A\u80FD';
      const estimate = estimateTokens(chinese);
      // CJK should be ~1 token per 2 chars, not per 4
      const proseEstimate = Math.ceil(chinese.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });

    it('should estimate higher token density for Japanese text', () => {
      const japanese = '\u3053\u3093\u306B\u3061\u306F\u4E16\u754C\u3088\u3046\u3053\u305D\u30D7\u30ED\u30B0\u30E9\u30DF\u30F3\u30B0\u306E\u4E16\u754C\u3078';
      const estimate = estimateTokens(japanese);
      const proseEstimate = Math.ceil(japanese.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });

    it('should estimate higher token density for Korean text', () => {
      const korean = '\uC548\uB155\uD558\uC138\uC694 \uC138\uACC4 \uD504\uB85C\uADF8\uB798\uBC0D \uC138\uACC4\uC5D0 \uC624\uC2E0 \uAC83\uC744 \uD658\uC601\uD569\uB2C8\uB2E4';
      const estimate = estimateTokens(korean);
      const proseEstimate = Math.ceil(korean.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });
  });

  describe('mixed content', () => {
    it('should blend ratios for mixed prose and code', () => {
      const mixed = 'Here is the implementation:\n' +
        'function add(a, b) { return a + b; }\n' +
        'This function adds two numbers together.';
      const estimate = estimateTokens(mixed);
      // Should be between pure prose and pure code estimates
      const pureProseEstimate = Math.ceil(mixed.length / 4);
      expect(estimate).toBeGreaterThanOrEqual(pureProseEstimate);
    });
  });

  describe('edge cases', () => {
    it('should return 1 for empty string', () => {
      expect(estimateTokens('')).toBe(1);
    });

    it('should return 1 for single character', () => {
      expect(estimateTokens('a')).toBe(1);
    });

    it('should handle whitespace-only content', () => {
      expect(estimateTokens('   \n\t  ')).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long content', () => {
      const long = 'word '.repeat(10000);
      const estimate = estimateTokens(long);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(long.length); // less than 1 token per char
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/token-estimator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement token estimator**

Create `packages/sessions/src/token-estimator.ts`:

```typescript
/**
 * Content-aware token estimation.
 *
 * Replaces the naive `content.length / 4` heuristic with content-type
 * detection that applies tuned ratios for code, CJK text, and prose.
 */

/* ------------------------------------------------------------------ */
/*  Character class patterns                                           */
/* ------------------------------------------------------------------ */

/** CJK Unified Ideographs + Hiragana + Katakana + Hangul */
const CJK_PATTERN = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;

/** Common code syntax characters */
const CODE_PATTERN = /[{}[\];=><()|&!~^%+\-*/\\@#$?:,]/g;

/* ------------------------------------------------------------------ */
/*  Ratios (chars per token)                                           */
/* ------------------------------------------------------------------ */

/** English prose: ~4 characters per token */
const PROSE_RATIO = 4;

/** Code/JSON: ~3.5 characters per token (more operators, short identifiers) */
const CODE_RATIO = 3.5;

/** CJK text: ~2 characters per token (each ideograph ≈ 1 token) */
const CJK_RATIO = 2;

/* ------------------------------------------------------------------ */
/*  Thresholds for content classification                              */
/* ------------------------------------------------------------------ */

/** Content with >30% CJK chars is classified as CJK-heavy */
const CJK_THRESHOLD = 0.3;

/** Content with >8% code syntax chars is classified as code-heavy */
const CODE_THRESHOLD = 0.08;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Estimate the number of tokens in a string using content-aware heuristics.
 *
 * Detects the proportion of CJK characters and code syntax characters,
 * then applies a weighted blend of per-type ratios.
 *
 * @returns Estimated token count (minimum 1).
 */
export function estimateTokens(content: string): number {
  if (content.length === 0) return 1;

  const len = content.length;

  // Count character classes
  const cjkMatches = content.match(CJK_PATTERN);
  const codeMatches = content.match(CODE_PATTERN);
  const cjkCount = cjkMatches?.length ?? 0;
  const codeCount = codeMatches?.length ?? 0;

  const cjkFraction = cjkCount / len;
  const codeFraction = codeCount / len;
  const proseFraction = 1 - cjkFraction - codeFraction;

  // Compute weighted ratio
  let effectiveRatio: number;

  if (cjkFraction >= CJK_THRESHOLD) {
    // CJK-dominant: blend CJK and prose ratios
    effectiveRatio = cjkFraction * CJK_RATIO + proseFraction * PROSE_RATIO + codeFraction * CODE_RATIO;
  } else if (codeFraction >= CODE_THRESHOLD) {
    // Code-dominant: blend code and prose ratios
    effectiveRatio = codeFraction * CODE_RATIO + proseFraction * PROSE_RATIO + cjkFraction * CJK_RATIO;
  } else {
    // Default: prose
    effectiveRatio = PROSE_RATIO;
  }

  return Math.max(Math.ceil(len / effectiveRatio), 1);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/token-estimator.test.ts`
Expected: PASS (all 12 tests)

**Step 5: Commit**

```bash
git add packages/sessions/src/token-estimator.ts packages/sessions/tests/token-estimator.test.ts
git commit -m "feat(sessions): add content-aware token estimator"
```

---

## Task 2: Safety Margins in getContextMessages

**Files:**
- Modify: `packages/sessions/src/manager.ts:216-236`
- Modify: `packages/sessions/src/db.ts:111-123`
- Modify: `packages/sessions/src/index.ts`
- Create: `packages/sessions/tests/context-margins.test.ts`

**Step 1: Write the failing tests**

Create `packages/sessions/tests/context-margins.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SessionManager } from '../src/manager.js';

let manager: SessionManager;
let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-margins-'));
  manager = new SessionManager({
    maxContextTokens: 10000,
    ttlMinutes: 60,
    autoSave: true,
    compactionEnabled: true,
    dbPath: path.join(testDir, 'sessions.db'),
  });
});

afterEach(() => {
  manager.destroy();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('getContextMessages — safety margins', () => {
  it('should apply 20% safety margin to token budget', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    // Add messages: 20 messages of 400 chars each
    // At ~4 chars/token (prose), each message ≈ 100 tokens
    // Total: 2000 tokens
    for (let i = 0; i < 20; i++) {
      await manager.addMessage(session.id, 'user', 'a'.repeat(400));
    }

    // With maxTokens = 1000:
    // Without margin: 1000 / 100 = 10 messages
    // With 20% margin: 800 / 100 = 8 messages
    // With output reserve (4096) and system reserve (2000): budget would be negative
    // So use maxTokens = 10000: effective = 10000*0.8 - 4096 - 2000 = 1904 → ~19 messages
    const context = manager.getContextMessages(session.id, 10000);
    // Should get fewer than 20 messages due to margins
    expect(context.length).toBeLessThan(20);
    expect(context.length).toBeGreaterThan(0);
  });

  it('should accept custom outputReserve', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    for (let i = 0; i < 20; i++) {
      await manager.addMessage(session.id, 'user', 'a'.repeat(400));
    }

    // With smaller output reserve, more messages should fit
    const contextSmall = manager.getContextMessages(session.id, 10000, 1000);
    const contextLarge = manager.getContextMessages(session.id, 10000, 8000);
    expect(contextSmall.length).toBeGreaterThan(contextLarge.length);
  });

  it('should use estimateTokens instead of length/4', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    // Add CJK messages — these should be estimated at ~2 chars/token, not 4
    // Each message: 100 CJK chars = ~50 tokens (not 25 as old estimator would say)
    const cjkText = '\u4F60\u597D\u4E16\u754C\u6B22\u8FCE'.repeat(17); // ~102 CJK chars
    for (let i = 0; i < 20; i++) {
      await manager.addMessage(session.id, 'user', cjkText);
    }

    // With old estimator: 102/4 = 26 tokens per msg
    // With new estimator: 102/2 = 51 tokens per msg (CJK)
    // Fewer messages should fit under the same budget
    const context = manager.getContextMessages(session.id, 10000);
    // At ~51 tokens/msg and budget ~1904: ~37 messages would fit without CJK correction
    // With CJK correction: fewer messages fit
    expect(context.length).toBeLessThan(20);
  });

  it('should warn but not block when effective budget is very small', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = await manager.create({ channelType: 'webchat' });

    await manager.addMessage(session.id, 'user', 'Hello');

    // maxTokens so small that effective budget < 4000
    // effective = 5000 * 0.8 - 4096 - 2000 = -2096 → clamp to 0
    const context = manager.getContextMessages(session.id, 5000);
    expect(warnSpy).toHaveBeenCalled();
    // Should still return something (empty or minimal)
    expect(context.length).toBeLessThanOrEqual(1);

    warnSpy.mockRestore();
  });

  it('should handle zero/undefined maxTokens by using config default', async () => {
    const session = await manager.create({ channelType: 'webchat' });
    await manager.addMessage(session.id, 'user', 'Hello');

    // Default config is 10000 tokens
    const context = manager.getContextMessages(session.id);
    expect(context.length).toBe(1);
  });

  it('should preserve message order (oldest to newest)', async () => {
    const session = await manager.create({ channelType: 'webchat' });

    await manager.addMessage(session.id, 'user', 'First');
    await manager.addMessage(session.id, 'assistant', 'Second');
    await manager.addMessage(session.id, 'user', 'Third');

    const context = manager.getContextMessages(session.id);
    expect(context[0].content).toBe('First');
    expect(context[1].content).toBe('Second');
    expect(context[2].content).toBe('Third');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/context-margins.test.ts`
Expected: FAIL — getContextMessages signature doesn't accept outputReserve, no margin applied

**Step 3: Implement safety margins**

In `packages/sessions/src/manager.ts`, update the import and `getContextMessages`:

Add import at top:
```typescript
import { estimateTokens } from './token-estimator.js';
```

Replace `getContextMessages` (lines 216-236):
```typescript
  /** Fixed 20% safety margin for estimation inaccuracy. */
  private static readonly SAFETY_MARGIN = 0.80;

  /** Reserved tokens for system prompt, tool definitions, etc. */
  private static readonly SYSTEM_RESERVE = 2000;

  /** Default output token reserve when not specified. */
  private static readonly DEFAULT_OUTPUT_RESERVE = 4096;

  /** Minimum effective budget before warning. */
  private static readonly MIN_BUDGET_WARNING = 4000;

  getContextMessages(sessionId: string, maxTokens?: number, outputReserve?: number): Message[] {
    const rawLimit = maxTokens || this.config.maxContextTokens;
    const reserve = outputReserve ?? SessionManager.DEFAULT_OUTPUT_RESERVE;
    const effectiveBudget = Math.max(
      rawLimit * SessionManager.SAFETY_MARGIN - reserve - SessionManager.SYSTEM_RESERVE,
      0,
    );

    if (effectiveBudget < SessionManager.MIN_BUDGET_WARNING) {
      console.warn(
        `[auxiora] Context budget very low (${Math.round(effectiveBudget)} tokens). ` +
        `Consider increasing maxContextTokens (current: ${rawLimit}).`,
      );
    }

    // Try in-memory first
    const session = this.sessions.get(sessionId);
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

    // Fall back to DB
    return this.db.getContextMessages(sessionId, effectiveBudget);
  }
```

In `packages/sessions/src/db.ts`, update `getContextMessages` (lines 111-123):

Add import at top:
```typescript
import { estimateTokens } from './token-estimator.js';
```

Replace the token estimation line:
```typescript
  getContextMessages(chatId: string, maxTokens: number): Message[] {
    const rows = this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC').all(chatId) as Record<string, unknown>[];
    const messages: Message[] = [];
    let tokenCount = 0;
    for (const row of rows) {
      const msg = this.rowToMessage(row);
      const msgTokens = estimateTokens(msg.content);
      if (tokenCount + msgTokens > maxTokens) break;
      messages.unshift(msg);
      tokenCount += msgTokens;
    }
    return messages;
  }
```

Add barrel export in `packages/sessions/src/index.ts`:
```typescript
export { estimateTokens } from './token-estimator.js';
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/context-margins.test.ts`
Expected: PASS (all 6 tests)

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/sessions/tests/`
Expected: PASS (all session tests, including the existing context windowing test)

Note: The existing test (`sessions.test.ts:97-110`) calls `getContextMessages(session.id, 125)`. With safety margins: effective = 125 * 0.8 - 4096 - 2000 = -5996 → clamped to 0. This means zero messages would be returned. The test expects `> 0` messages.

**FIX**: Update the existing test to use a larger `maxTokens` value that works with margins:
```typescript
// Old: getContextMessages(session.id, 125)
// New: getContextMessages(session.id, 10000, 0)
// Using outputReserve=0 to keep the test focused on basic windowing
```

Or simpler: pass a large enough maxTokens so effective budget still covers some messages. 20 messages * 100 chars * /4 = 500 tokens. Need effective > 125: maxTokens * 0.8 - 4096 - 2000 > 125 → maxTokens > 7776. So use `getContextMessages(session.id, 8000, 0)` to test basic windowing without output reserve.

**Step 5: Commit**

```bash
git add packages/sessions/src/manager.ts packages/sessions/src/db.ts packages/sessions/src/index.ts packages/sessions/tests/context-margins.test.ts packages/sessions/tests/sessions.test.ts
git commit -m "feat(sessions): add safety margins and output reserve to context windowing"
```

---

## Task 3: Runtime Integration

**Files:**
- Modify: `packages/runtime/src/index.ts` (lines 2024, 2669, 2876)

**Step 1: Update runtime call sites**

The runtime calls `getContextMessages(session.id)` in several places. Update them to pass the output reserve from provider configuration.

Search for all `getContextMessages` calls in `packages/runtime/src/index.ts` and update:

```typescript
// Before:
const contextMessages = this.sessions.getContextMessages(session.id);

// After (where provider maxTokens is available):
const contextMessages = this.sessions.getContextMessages(
  session.id,
  undefined,
  options?.maxTokens ?? 4096,
);
```

For the `extractAndLearn` call (line 3071), keep it as-is since it's just grabbing recent context for analysis, not for an API call.

**Step 2: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all tests)

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): pass output reserve to context windowing"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | Token Estimator | `token-estimator.test.ts` | 12 |
| 2 | Safety Margins | `context-margins.test.ts` | 6 |
| 3 | Runtime Integration | (existing tests) | 0 |
| **Total** | | | **18** |
