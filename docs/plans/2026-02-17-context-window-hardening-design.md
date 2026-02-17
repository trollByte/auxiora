# Context Window Hardening Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw context window management patterns

---

## Problem

Auxiora estimates tokens with `content.length / 4`, which can be off by 30-50% for code, JSON, or non-English text. There are no safety margins for estimation inaccuracy, no reserve for output tokens or system prompt, and no progressive fallback. This causes silent context overflow — the model hits `max_tokens` unexpectedly or older messages are dropped at the wrong boundary.

## Solution

Replace the naive `/4` estimator with a content-aware heuristic that detects content type (prose, code, CJK) and applies tuned ratios. Add a fixed 20% safety margin, output token reserve, and system prompt reserve to `getContextMessages()`. No auto-compaction — keep manual compaction as-is.

## Architecture

### Module Location

`packages/sessions/src/` — one new file, two modified:

| File | Purpose | ~Lines |
|------|---------|--------|
| `token-estimator.ts` (new) | Content-aware token estimation | ~60 |
| `manager.ts` (modify) | Replace `/4` with `estimateTokens()`, apply margins | ~15 |
| `db.ts` (modify) | Same replacement | ~10 |

Runtime passes `outputReserve` to `getContextMessages()` (~5 lines in `packages/runtime/src/index.ts`).

### Token Estimator

A single `estimateTokens(content: string): number` function that:

1. **Classifies content** by scanning character patterns:
   - **CJK density**: Chars in `\u4E00-\u9FFF`, `\u3040-\u309F`, `\u30A0-\u30FF`, `\uAC00-\uD7AF`. If >30% of content → ratio `/2`.
   - **Code density**: Chars in `{}[];=><()` and common operators. If >8% of content → ratio `/3.5`.
   - **Default**: ratio `/4` (English prose).

2. **Blending**: For mixed content, weighted average of ratios based on character class distribution.

3. **Floor**: `Math.max(result, 1)` — never return 0 tokens.

### Safety Margins

Applied in `getContextMessages()`:

1. **20% safety margin**: Effective budget = `maxTokens * 0.80`.
2. **Output token reserve**: Subtract `outputReserve` (default 4096) from budget.
3. **System prompt reserve**: Subtract fixed 2000 tokens for system prompt overhead.
4. **Hard minimum warning**: If effective budget < 4000, log a warning.

Final formula: `effectiveBudget = maxTokens * 0.80 - outputReserve - 2000`

### Data Flow

```
Runtime calls getContextMessages(sessionId, maxTokens, outputReserve)
  → Compute effectiveBudget = maxTokens * 0.80 - outputReserve - 2000
  → For each message (newest first):
      → estimateTokens(msg.content) using content-aware heuristic
      → Accumulate until effectiveBudget reached
  → Return messages in chronological order
```

## Testing Strategy

1. **Unit tests** for `token-estimator.ts` (~12): English prose, code, CJK, mixed, empty, edge cases
2. **Unit tests** for safety margin logic (~6): effective budget, output reserve, system prompt reserve, hard minimum
3. **Existing tests**: session tests should pass (more conservative budget = fewer messages, correct behavior)

## Non-Goals

- No auto-compaction or progressive summarization (manual compaction remains)
- No actual tokenizer library (content-aware heuristic + margin is sufficient)
- No per-session ratio calibration from API responses
- No configurable safety margin percentage (fixed 20%)
