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
