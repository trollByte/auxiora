# Request Correlation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AsyncLocalStorage-based request IDs that auto-inject into every log line and audit event, enabling cross-component request tracing with zero changes to existing call sites.

**Architecture:** New `context.ts` module in `@auxiora/logger` provides `runWithRequestId()` and `getRequestContext()`. The logger's `enrichContext()` reads from ALS as fallback. Gateway and runtime wrap their entry points in `runWithRequestId()`. Audit reads from ALS automatically.

**Tech Stack:** TypeScript, Node.js `AsyncLocalStorage`, vitest, pino

---

### Task 1: Create request context module with tests

**Files:**
- Create: `packages/logger/src/context.ts`
- Create: `packages/logger/tests/context.test.ts`

**Step 1: Write the failing tests**

Create `packages/logger/tests/context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runWithRequestId, getRequestContext } from '../src/context.js';

describe('requestContext', () => {
  it('returns undefined outside of a run', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('provides requestId inside runWithRequestId', async () => {
    await runWithRequestId('req_test_123', async () => {
      const ctx = getRequestContext();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toBe('req_test_123');
    });
  });

  it('returns undefined after run completes', async () => {
    await runWithRequestId('req_temp', async () => {
      // inside
    });
    expect(getRequestContext()).toBeUndefined();
  });

  it('supports nested contexts (inner wins)', async () => {
    await runWithRequestId('req_outer', async () => {
      expect(getRequestContext()!.requestId).toBe('req_outer');

      await runWithRequestId('req_inner', async () => {
        expect(getRequestContext()!.requestId).toBe('req_inner');
      });

      // Outer restored
      expect(getRequestContext()!.requestId).toBe('req_outer');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora/packages/logger && npx vitest run tests/context.test.ts`
Expected: FAIL — cannot find `../src/context.js`

**Step 3: Write the implementation**

Create `packages/logger/src/context.ts`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  sessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestId<T>(requestId: string, fn: () => T | Promise<T>): T | Promise<T> {
  return storage.run({ requestId }, fn);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora/packages/logger && npx vitest run tests/context.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add packages/logger/src/context.ts packages/logger/tests/context.test.ts
git commit -m "feat(logger): add AsyncLocalStorage-based request context"
```

---

### Task 2: Integrate ALS into logger enrichContext + exports

**Files:**
- Modify: `packages/logger/src/index.ts:218-230` (enrichContext method)
- Modify: `packages/logger/src/index.ts:1` (add import)
- Create: `packages/logger/tests/logger-als.test.ts`

**Step 1: Write the failing test**

Create `packages/logger/tests/logger-als.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createLogger, generateRequestId } from '../src/index.js';
import { runWithRequestId, getRequestContext } from '../src/context.js';

describe('logger ALS integration', () => {
  it('auto-injects requestId from ALS into log output', async () => {
    const logger = createLogger('test-als', { level: 'debug' });
    const pinoLogger = logger.getPinoLogger();
    const infoSpy = vi.spyOn(pinoLogger, 'info');

    await runWithRequestId('req_als_test', async () => {
      logger.info('test message');
    });

    expect(infoSpy).toHaveBeenCalled();
    const loggedContext = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(loggedContext.requestId).toBe('req_als_test');
  });

  it('does not inject requestId outside ALS', () => {
    const logger = createLogger('test-no-als', { level: 'debug' });
    const pinoLogger = logger.getPinoLogger();
    const infoSpy = vi.spyOn(pinoLogger, 'info');

    logger.info('test message');

    expect(infoSpy).toHaveBeenCalled();
    const loggedContext = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(loggedContext.requestId).toBeUndefined();
  });

  it('explicit requestId takes priority over ALS', async () => {
    const logger = createLogger('test-priority', { level: 'debug', requestId: 'req_explicit' });
    const pinoLogger = logger.getPinoLogger();
    const infoSpy = vi.spyOn(pinoLogger, 'info');

    await runWithRequestId('req_als_ignored', async () => {
      logger.info('test message');
    });

    const loggedContext = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(loggedContext.requestId).toBe('req_explicit');
  });

  it('generateRequestId returns req_ prefixed string', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^req_\d+_[a-z0-9]+$/);
  });
});
```

**Step 2: Run tests to verify ALS test fails (no ALS integration yet)**

Run: `cd /home/ai-work/git/auxiora/packages/logger && npx vitest run tests/logger-als.test.ts`
Expected: First test FAILS — requestId is undefined (ALS not wired into enrichContext yet)

**Step 3: Modify `packages/logger/src/index.ts`**

Add import at the top (after the pino import on line 13):
```typescript
import { getRequestContext } from './context.js';
```

Modify `enrichContext()` method (lines 218-230) to check ALS:
```typescript
  private enrichContext(context?: LogContext): LogContext {
    const alsContext = getRequestContext();
    if (!context && !this.requestId && !alsContext) {
      return {};
    }

    const enriched = { ...context };

    if (this.requestId && !enriched.requestId) {
      enriched.requestId = this.requestId;
    } else if (!enriched.requestId && alsContext?.requestId) {
      enriched.requestId = alsContext.requestId;
    }

    return this.sanitizeContext(enriched);
  }
```

Add re-exports at the bottom of `packages/logger/src/index.ts` (before the final line):
```typescript
export { getRequestContext, runWithRequestId, type RequestContext } from './context.js';
```

**Step 4: Run all logger tests**

Run: `cd /home/ai-work/git/auxiora/packages/logger && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/logger/src/index.ts packages/logger/tests/logger-als.test.ts
git commit -m "feat(logger): integrate AsyncLocalStorage into enrichContext

Logger auto-injects requestId from ALS when no explicit requestId is set.
Re-exports runWithRequestId and getRequestContext for consumers."
```

---

### Task 3: Wrap runtime and gateway entry points

**Files:**
- Modify: `packages/runtime/src/index.ts:2848` (handleChannelMessage)
- Modify: `packages/gateway/src/server.ts:248` (handleMessage)

**Step 1: Modify `packages/runtime/src/index.ts`**

Add import at the top (near existing `@auxiora/logger` import):
```typescript
import { generateRequestId, runWithRequestId } from '@auxiora/logger';
```

Wrap the body of `handleChannelMessage` (line 2848):

Change:
```typescript
  private async handleChannelMessage(inbound: InboundMessage): Promise<void> {
    // Track last-active channel ID for proactive delivery and persist to disk
    this.lastActiveChannels.set(inbound.channelType, inbound.channelId);
```

To:
```typescript
  private async handleChannelMessage(inbound: InboundMessage): Promise<void> {
    const requestId = generateRequestId();
    return runWithRequestId(requestId, async () => {
    // Track last-active channel ID for proactive delivery and persist to disk
    this.lastActiveChannels.set(inbound.channelType, inbound.channelId);
```

And add a closing `});` before the method's final closing `}`.

**Step 2: Modify `packages/gateway/src/server.ts`**

Add import at the top (near existing `@auxiora/logger` import):
```typescript
import { generateRequestId, runWithRequestId } from '@auxiora/logger';
```

Wrap the body of `handleMessage` (line 248):

Change:
```typescript
  private async handleMessage(client: ClientConnection, message: WsMessage): Promise<void> {
    const { type, id, payload } = message;
```

To:
```typescript
  private async handleMessage(client: ClientConnection, message: WsMessage): Promise<void> {
    const requestId = generateRequestId();
    return runWithRequestId(requestId, async () => {
    const { type, id, payload } = message;
```

And add a closing `});` before the method's final closing `}`.

**Step 3: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/runtime/src/index.ts packages/gateway/src/server.ts
git commit -m "feat(runtime,gateway): wrap entry points in runWithRequestId

Every inbound message now gets a unique request ID that propagates
through all async operations via AsyncLocalStorage."
```

---

### Task 4: Auto-inject requestId into audit events

**Files:**
- Modify: `packages/audit/src/index.ts:228-244` (log method)

**Step 1: Modify `packages/audit/src/index.ts`**

Add import at the top:
```typescript
import { getRequestContext } from '@auxiora/logger';
```

Note: `@auxiora/logger` must be added as a dependency in `packages/audit/package.json` if not already present.

In the `log` method (line 228), after `const redactedDetails = redactSensitive(details);` on line 233, add:
```typescript
    // Auto-inject requestId from AsyncLocalStorage
    const reqCtx = getRequestContext();
    if (reqCtx?.requestId && !redactedDetails.requestId) {
      redactedDetails.requestId = reqCtx.requestId;
    }
```

**Step 2: Check if `@auxiora/logger` is already a dependency of audit**

Read `packages/audit/package.json`. If `@auxiora/logger` is not in dependencies, add it:
```json
"@auxiora/logger": "workspace:*"
```

**Step 3: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/audit/src/index.ts packages/audit/package.json
git commit -m "feat(audit): auto-inject requestId from ALS into audit events

Audit entries now include requestId when called within a request context,
enabling correlation between logs and audit trail."
```
