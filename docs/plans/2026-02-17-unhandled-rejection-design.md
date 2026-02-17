# Unhandled Rejection Handler Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #12 (OpenClaw-inspired hardening)

---

## Problem

The current `unhandledRejection` handler in `packages/cli/src/commands/start.ts` only logs the error — it doesn't shut down or distinguish retryable errors from fatal ones. A transient network error could leave the process in a broken state, while a genuine OOM/corruption goes unhandled.

## Solution

Replace the simple log-only handler with an intelligent classifier that categorizes errors as retryable, fatal, or unknown, and responds appropriately to each.

## Architecture

### Module: `packages/cli/src/process-guard.ts`

- `setupProcessGuard(runtime, logger)` — installs `uncaughtException`, `unhandledRejection`, and signal handlers
- `classifyError(error)` — returns `'retryable' | 'fatal' | 'unknown'`

### Classification Rules

- **Retryable** (log warning, continue): `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`, `UND_ERR_CONNECT_TIMEOUT`, HTTP 429, `SSRFError`
- **Fatal** (graceful shutdown): `ERR_OUT_OF_RANGE`, `ERR_ASSERTION`, `RangeError`, `TypeError` with null/undefined access patterns
- **Unknown** (counter-based): everything else — shut down after 3 unknown rejections in a 60-second sliding window

### Shutdown Behavior

- 10-second timeout for graceful shutdown, then `process.exit(1)`
- Re-entry guard: if shutdown already in progress, skip
- Error during shutdown: force exit

### Changes to `packages/cli/src/commands/start.ts`

- Remove inline signal/error handlers (~15 lines)
- Call `setupProcessGuard(runtime, logger)` after runtime init

## Testing Strategy

1. `classifyError` unit tests (~6): network errors → retryable, OOM → fatal, generic → unknown
2. Process guard integration (~2): retryable doesn't trigger shutdown, fatal does

## Non-Goals

- No crash reporting service integration
- No automatic restart (Docker handles that)
- No metrics endpoint for error counts (future enhancement)
