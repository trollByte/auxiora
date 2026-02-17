# Unhandled Rejection Handler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the log-only unhandled rejection handler with an intelligent error classifier that continues on retryable errors, gracefully shuts down on fatal errors, and uses a sliding window counter for unknowns.

**Architecture:** New `process-guard.ts` module in `packages/cli/src/` exports `classifyError()` and `setupProcessGuard()`. The start command delegates all process-level error handling to this module. Graceful shutdown has a 10-second timeout.

**Tech Stack:** TypeScript, vitest, Node.js process events

---

### Task 1: Create error classifier with tests

**Files:**
- Create: `packages/cli/src/process-guard.ts`
- Create: `packages/cli/tests/process-guard.test.ts`

**Step 1: Write the failing tests**

Create `packages/cli/tests/process-guard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyError } from '../src/process-guard.js';

describe('classifyError', () => {
  it('classifies ECONNRESET as retryable', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies ETIMEDOUT as retryable', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies ENOTFOUND as retryable', () => {
    const err = Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies UND_ERR_CONNECT_TIMEOUT as retryable', () => {
    const err = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies fetch 429 as retryable', () => {
    const err = new Error('Request failed with status 429');
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies SSRFError as retryable', () => {
    const err = new Error('SSRF blocked: private IP');
    err.name = 'SSRFError';
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies RangeError as fatal', () => {
    const err = new RangeError('Maximum call stack size exceeded');
    expect(classifyError(err)).toBe('fatal');
  });

  it('classifies ERR_ASSERTION as fatal', () => {
    const err = Object.assign(new Error('assertion'), { code: 'ERR_ASSERTION' });
    expect(classifyError(err)).toBe('fatal');
  });

  it('classifies null property access TypeError as fatal', () => {
    const err = new TypeError("Cannot read properties of null (reading 'foo')");
    expect(classifyError(err)).toBe('fatal');
  });

  it('classifies generic error as unknown', () => {
    const err = new Error('something went wrong');
    expect(classifyError(err)).toBe('unknown');
  });

  it('classifies non-Error values as unknown', () => {
    expect(classifyError('string error')).toBe('unknown');
    expect(classifyError(42)).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora/packages/cli && npx vitest run tests/process-guard.test.ts`
Expected: FAIL — cannot find `../src/process-guard.js`

**Step 3: Write the implementation**

Create `packages/cli/src/process-guard.ts`:

```typescript
import { getLogger } from '@auxiora/logger';

const logger = getLogger('process-guard');

type ErrorClass = 'retryable' | 'fatal' | 'unknown';

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const FATAL_CODES = new Set([
  'ERR_OUT_OF_RANGE',
  'ERR_ASSERTION',
  'ERR_WORKER_OUT_OF_MEMORY',
]);

export function classifyError(value: unknown): ErrorClass {
  if (!(value instanceof Error)) {
    return 'unknown';
  }

  const err = value as Error & { code?: string };

  // Check error code
  if (err.code && RETRYABLE_CODES.has(err.code)) {
    return 'retryable';
  }
  if (err.code && FATAL_CODES.has(err.code)) {
    return 'fatal';
  }

  // Check error name
  if (err.name === 'SSRFError') {
    return 'retryable';
  }

  // Check message patterns
  if (/status\s+429/i.test(err.message)) {
    return 'retryable';
  }

  // Fatal type checks
  if (err instanceof RangeError) {
    return 'fatal';
  }
  if (err instanceof TypeError && /cannot read properties of (null|undefined)/i.test(err.message)) {
    return 'fatal';
  }

  return 'unknown';
}

const WINDOW_MS = 60_000;
const MAX_UNKNOWNS = 3;
const SHUTDOWN_TIMEOUT_MS = 10_000;

let unknownTimestamps: number[] = [];
let shuttingDown = false;

export function setupProcessGuard(
  stopFn: () => Promise<void>,
): void {
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.error(`Process shutting down: ${reason}`);

    const timer = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    try {
      await stopFn();
    } catch (err) {
      logger.error('Error during shutdown', {
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    shutdown(`uncaughtException: ${error.message}`);
  });

  process.on('unhandledRejection', (reason) => {
    const cls = classifyError(reason);

    if (cls === 'retryable') {
      logger.warn('Retryable unhandled rejection (continuing)', {
        error: reason instanceof Error ? reason : new Error(String(reason)),
      });
      return;
    }

    if (cls === 'fatal') {
      logger.error('Fatal unhandled rejection', {
        error: reason instanceof Error ? reason : new Error(String(reason)),
      });
      shutdown(`fatal rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
      return;
    }

    // Unknown — track with sliding window
    const now = Date.now();
    unknownTimestamps.push(now);
    unknownTimestamps = unknownTimestamps.filter((t) => now - t < WINDOW_MS);

    logger.warn(`Unknown unhandled rejection (${unknownTimestamps.length}/${MAX_UNKNOWNS} in window)`, {
      error: reason instanceof Error ? reason : new Error(String(reason)),
    });

    if (unknownTimestamps.length >= MAX_UNKNOWNS) {
      shutdown(`${MAX_UNKNOWNS} unknown rejections in ${WINDOW_MS / 1000}s`);
    }
  });
}

/** Reset internal state (for testing) */
export function _resetGuardState(): void {
  unknownTimestamps = [];
  shuttingDown = false;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora/packages/cli && npx vitest run tests/process-guard.test.ts`
Expected: PASS (all 11 tests)

**Step 5: Commit**

```bash
git add packages/cli/src/process-guard.ts packages/cli/tests/process-guard.test.ts
git commit -m "feat(cli): add error classifier and process guard module

classifyError() categorizes errors as retryable/fatal/unknown.
setupProcessGuard() installs intelligent process-level handlers."
```

---

### Task 2: Wire process guard into start command

**Files:**
- Modify: `packages/cli/src/commands/start.ts:1-14,47-62`

**Step 1: Read `packages/cli/src/commands/start.ts` and make changes**

**Change A — Add import** at the top (after existing imports, around line 4):
```typescript
import { setupProcessGuard } from '../process-guard.js';
```

**Change B — Remove the standalone `gracefulShutdown` function** (lines 6-14):

Delete:
```typescript
let auxiora: Auxiora | null = null;

async function gracefulShutdown(): Promise<void> {
  console.log('\nShutting down...');
  if (auxiora) {
    await auxiora.stop();
  }
  process.exit(0);
}
```

Replace with just:
```typescript
let auxiora: Auxiora | null = null;
```

**Change C — Remove inline signal/error handlers** (lines 47-62):

Delete:
```typescript
      // Handle shutdown signals (SIGINT: Ctrl+C on all platforms, SIGTERM: Unix,
      // SIGBREAK: Windows console close / Ctrl+Break)
      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);
      if (process.platform === 'win32') {
        process.on('SIGBREAK', gracefulShutdown);
      }

      process.on('unhandledRejection', (reason) => {
        console.error('Unhandled rejection:', reason instanceof Error ? reason.message : reason);
      });

      process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error.message);
        gracefulShutdown();
      });
```

Replace with:
```typescript
      // Install process-level error handling with intelligent classification
      setupProcessGuard(async () => {
        if (auxiora) {
          await auxiora.stop();
        }
      });
```

**Step 2: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/cli/src/commands/start.ts
git commit -m "refactor(cli): replace inline error handlers with process guard

Delegates all signal and error handling to setupProcessGuard(),
which classifies errors and responds appropriately."
```
