# Request Correlation Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #11 (OpenClaw-inspired hardening)

---

## Problem

Logs across gateway, runtime, channels, providers, and audit have no shared identifier linking them to the same request. Debugging production issues means manually matching timestamps across components.

## Solution

Add `AsyncLocalStorage`-based request context to `@auxiora/logger`. Generate a request ID at each entry point (gateway WebSocket message, channel inbound message), store it in ALS, and auto-inject it into every log line without changing any existing call sites.

## Architecture

### Module: `packages/logger/src/context.ts`

- `RequestContext` type: `{ requestId: string; sessionId?: string }`
- `requestContext`: an `AsyncLocalStorage<RequestContext>` instance
- `runWithRequestId(requestId, fn)`: wraps `fn` in ALS context
- `getRequestContext()`: reads current context (returns `undefined` outside a run)

### Changes to `packages/logger/src/index.ts`

In `enrichContext()`: if `this.requestId` is not set, check `getRequestContext()?.requestId` from ALS as fallback. All existing loggers auto-inject requestId with zero call-site changes.

### Changes to `packages/runtime/src/index.ts`

In `handleChannelMessage()`: wrap the entire handler body in `runWithRequestId(generateRequestId(), async () => { ... })`. Every log line, provider call, and audit event within that request now carries the same ID.

### Changes to `packages/gateway/src/server.ts`

In `handleMessage()`: wrap in `runWithRequestId()` so gateway-level logs also correlate.

### Changes to `packages/audit/src/index.ts`

In the audit function: auto-include `requestId` from ALS in audit event details.

### What Stays the Same

- All existing `getLogger()` call sites — unchanged
- All existing `logger.info/warn/error()` calls — unchanged
- Provider implementations — unchanged
- LogContext interface — unchanged

### Edge Cases

- Code running outside ALS (startup, background tasks) → no requestId injected (same as today)
- Nested `runWithRequestId` calls → inner context wins (standard ALS behavior)

## Testing Strategy

1. `requestContext` unit tests (~4): run/get context, nested context, outside context returns undefined
2. Logger ALS integration test (~2): log within `runWithRequestId` includes requestId, log outside doesn't
3. `generateRequestId` format test (~1): matches `req_` prefix pattern

## Non-Goals

- No distributed tracing spans or OpenTelemetry
- No HTTP header propagation (future enhancement)
- No provider-side `x-request-id` headers (future enhancement)
