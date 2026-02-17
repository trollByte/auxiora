/**
 * Failover error classification for model failover.
 * Classifies provider errors into typed reasons to decide whether
 * to retry on a different model/provider.
 */

export type FailoverReason =
  | 'billing'
  | 'rate_limit'
  | 'auth'
  | 'timeout'
  | 'context_overflow'
  | 'format'
  | 'unknown';

export class FailoverError extends Error {
  override readonly name = 'FailoverError';
  readonly reason: FailoverReason;
  readonly provider: string;
  readonly model: string;
  readonly statusCode?: number;

  constructor(
    reason: FailoverReason,
    provider: string,
    model: string,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.reason = reason;
    this.provider = provider;
    this.model = model;
    this.statusCode = statusCode;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function getStatusCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as Record<string, unknown>;
  const code = e.status ?? e.statusCode;
  return typeof code === 'number' ? code : undefined;
}

function getErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as Record<string, unknown>;
  const code = e.code ?? e.error_code;
  return typeof code === 'string' ? code : undefined;
}

function getMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/* Context-overflow patterns (strings and regex) */
const CONTEXT_OVERFLOW_CODES = new Set([
  'context_length_exceeded',
  'context_too_long',
  'max_tokens_exceeded',
  'string_above_max_length',
]);

const CONTEXT_OVERFLOW_RE =
  /context.{0,20}(exceed|length|overflow|too.?long)|max.?tokens.?exceeded|token.?limit|too.?many.?tokens/i;

const TIMEOUT_RE =
  /time[d\s_-]*out|deadline.*exceeded|ETIMEDOUT|ESOCKETTIMEDOUT/i;

const BILLING_RE =
  /insufficient.{0,10}(quota|funds|credits|balance)|billing|payment.*required/i;

const RATE_LIMIT_CODES = new Set([
  'rate_limit_exceeded',
  'rate_limit',
  'too_many_requests',
]);

const AUTH_CODES = new Set([
  'invalid_api_key',
  'authentication_error',
  'permission_denied',
]);

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Attempt to classify an arbitrary error into a FailoverError.
 * Returns null when the error cannot be recognized.
 */
export function coerceToFailoverError(
  err: unknown,
  provider: string,
  model: string,
): FailoverError | null {
  if (typeof err !== 'object' || err === null) return null;

  const status = getStatusCode(err);
  const code = getErrorCode(err);
  const msg = getMessage(err);

  // 1. Status-code classification
  if (status !== undefined) {
    switch (status) {
      case 429:
        return new FailoverError('rate_limit', provider, model, msg, status);
      case 402:
        return new FailoverError('billing', provider, model, msg, status);
      case 401:
      case 403:
        return new FailoverError('auth', provider, model, msg, status);
      case 408:
        return new FailoverError('timeout', provider, model, msg, status);
      case 400:
        if (CONTEXT_OVERFLOW_RE.test(msg)) {
          return new FailoverError('context_overflow', provider, model, msg, status);
        }
        return new FailoverError('format', provider, model, msg, status);
    }
  }

  // 2. Error-code classification
  if (code !== undefined) {
    if (RATE_LIMIT_CODES.has(code)) {
      return new FailoverError('rate_limit', provider, model, msg, status);
    }
    if (AUTH_CODES.has(code)) {
      return new FailoverError('auth', provider, model, msg, status);
    }
    if (CONTEXT_OVERFLOW_CODES.has(code)) {
      return new FailoverError('context_overflow', provider, model, msg, status);
    }
  }

  // 3. Message-pattern classification
  if (BILLING_RE.test(msg)) {
    return new FailoverError('billing', provider, model, msg, status);
  }
  if (TIMEOUT_RE.test(msg)) {
    return new FailoverError('timeout', provider, model, msg, status);
  }
  if (CONTEXT_OVERFLOW_RE.test(msg)) {
    return new FailoverError('context_overflow', provider, model, msg, status);
  }

  return null;
}

/**
 * Check whether an error represents a context-overflow condition.
 */
export function isContextOverflow(err: unknown): boolean {
  if (err instanceof FailoverError) return err.reason === 'context_overflow';
  if (err instanceof Error) return CONTEXT_OVERFLOW_RE.test(err.message);
  return false;
}

/**
 * Check whether an error is a user-initiated abort (not a timeout).
 */
export function isUserAbort(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err instanceof FailoverError) return false;
  if (err.name !== 'AbortError') return false;
  // Exclude timeout-triggered aborts
  const cause = (err as any).cause;
  if (cause instanceof Error) {
    if (cause.name === 'TimeoutError' || TIMEOUT_RE.test(cause.message)) {
      return false;
    }
  }
  if (TIMEOUT_RE.test(err.message)) return false;
  return true;
}

/**
 * Check whether an error represents a timeout condition.
 */
export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'TimeoutError') return true;
  // Check cause chain
  const cause = (err as any).cause;
  if (cause instanceof Error) {
    if (cause.name === 'TimeoutError' || TIMEOUT_RE.test(cause.message)) {
      return true;
    }
  }
  return TIMEOUT_RE.test(err.message);
}
