# Markdown-Aware Chunking Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #10 (OpenClaw-inspired hardening)

---

## Problem

All 12 channel adapters have identical copy-pasted `chunkMessage()` methods (~28 lines each, 336 lines total duplicated code). The algorithm only splits on `\n` and ` ` — it doesn't understand markdown structure. This causes fenced code blocks to be split across messages (broken formatting), markdown links `[text](url)` broken mid-link, and lists split between bullet and content.

## Solution

Extract the duplicated code into a shared `chunkMarkdown(text, maxLength)` function in `packages/channels/src/chunk.ts` with markdown-aware splitting. Each adapter replaces its `private chunkMessage()` with a call to the shared function.

## Architecture

### Module: `packages/channels/src/chunk.ts`

Single exported function: `chunkMarkdown(text: string, maxLength: number): string[]`

### Splitting Rules (Priority Order)

1. If text fits in one chunk, return it as-is
2. Never split inside a fenced code block (` ``` `) — find the closing fence first
3. Prefer splitting at paragraph boundaries (`\n\n`)
4. Fall back to newline boundaries (`\n`)
5. Fall back to space boundaries (` `)
6. Hard cut at maxLength if nothing else works
7. If a single code block exceeds maxLength, split at newlines within the block

### Adapter Changes

Each of the 12 adapters:
- Remove `private chunkMessage()` method (~28 lines each)
- Add `import { chunkMarkdown } from '../chunk.js';`
- Replace `this.chunkMessage(message.content)` with `chunkMarkdown(message.content, MAX_MESSAGE_LENGTH)`
- Twilio: replace `this.chunkMessage(message.content, maxLength)` with `chunkMarkdown(message.content, maxLength)`

### Edge Cases

- Empty input → `['']`
- Code block larger than maxLength → split at newlines within the block, preserving fence markers
- No good break points → hard cut at maxLength (existing behavior)
- Markdown link at chunk boundary → don't split inside `[text](url)` if possible

## Testing Strategy

1. Short text (no chunking needed) — 1 test
2. Long text split at paragraph boundaries — 1 test
3. Fenced code block preservation — 2 tests (fits in chunk, exceeds chunk)
4. Markdown link preservation — 1 test
5. Mixed content — 1 test
6. Fallback to space/hard-cut — 2 tests
7. Multiple maxLength values — 1 test
8. Empty input — 1 test

## Non-Goals

- No per-channel formatting rules (adapters can post-process if needed)
- No HTML chunking (markdown only)
- No streaming-aware chunking (DraftStreamLoop sends full accumulated text)
