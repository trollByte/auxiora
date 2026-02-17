/**
 * Model failover — execute with automatic fallback through candidate chain.
 *
 * Works for both complete() (Promise) and stream() (AsyncGenerator).
 * Streaming failover only retries pre-chunk errors; mid-stream failures
 * yield an error chunk (can't merge partial responses from different models).
 */

import { getLogger } from '@auxiora/logger';
import {
  FailoverError,
  coerceToFailoverError,
  isContextOverflow,
  isUserAbort,
} from './failover-error.js';
import {
  isProviderInCooldown,
  markProviderCooldown,
  clearProviderCooldown,
  shouldProbe,
  recordProbeResult,
} from './provider-cooldown.js';
import type { Provider, StreamChunk } from './types.js';

const logger = getLogger('failover');

// ── Types ────────────────────────────────────────────────────────────

export interface FallbackCandidate {
  provider: Provider;
  name: string;
  model: string;
}

export interface FallbackOptions {
  candidates: FallbackCandidate[];
  maxAttempts?: number;
}

export interface AttemptRecord {
  provider: string;
  model: string;
  error?: FailoverError;
  durationMs: number;
}

export interface FallbackResult<T> {
  result: T;
  attempts: AttemptRecord[];
  usedFallback: boolean;
}

// ── Non-Streaming Failover ───────────────────────────────────────────

export async function runWithModelFallback<T>(
  options: FallbackOptions,
  fn: (provider: Provider) => Promise<T>,
): Promise<FallbackResult<T>> {
  const { candidates, maxAttempts = candidates.length } = options;
  const attempts: AttemptRecord[] = [];
  let lastError: Error | undefined;
  let skippedBeforeFirst = 0;

  for (let i = 0; i < Math.min(maxAttempts, candidates.length); i++) {
    const { provider, name, model } = candidates[i]!;

    // Skip providers in cooldown (unless probe-eligible)
    if (isProviderInCooldown(name) && !shouldProbe(name)) {
      logger.info('Skipping provider in cooldown', { provider: name });
      if (attempts.length === 0) skippedBeforeFirst++;
      continue;
    }

    const start = Date.now();
    try {
      const result = await fn(provider);
      clearProviderCooldown(name);

      const attemptIndex = attempts.length + skippedBeforeFirst;
      attempts.push({ provider: name, model, durationMs: Date.now() - start });
      return { result, attempts, usedFallback: attemptIndex > 0 };
    } catch (err) {
      const duration = Date.now() - start;

      // User abort — rethrow immediately
      if (isUserAbort(err)) throw err;

      // Context overflow — rethrow (smaller models won't help)
      if (isContextOverflow(err)) throw err;

      // Capture probe status before any state changes
      const wasProbing = isProviderInCooldown(name);

      // Coerce to FailoverError for classification
      const failoverErr =
        err instanceof FailoverError
          ? err
          : coerceToFailoverError(err, name, model) ??
            new FailoverError('unknown', name, model, err instanceof Error ? err.message : String(err));

      attempts.push({ provider: name, model, error: failoverErr, durationMs: duration });

      // Mark cooldown for rate limits
      if (failoverErr.reason === 'rate_limit') {
        markProviderCooldown(name, failoverErr.reason);
      }

      // Record probe failure if we were probing a cooled-down provider
      if (wasProbing) {
        recordProbeResult(name, false);
      }

      lastError = failoverErr;
      logger.warn('Provider failed, trying next', {
        provider: name,
        model,
        reason: failoverErr.reason,
        attempt: i + 1,
      });
    }
  }

  throw lastError ?? new Error('No candidates available');
}

// ── Streaming Failover ───────────────────────────────────────────────

export async function* streamWithModelFallback(
  options: FallbackOptions,
  fn: (provider: Provider) => AsyncGenerator<StreamChunk, void, unknown>,
): AsyncGenerator<StreamChunk, void, unknown> {
  const { candidates, maxAttempts = candidates.length } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < Math.min(maxAttempts, candidates.length); i++) {
    const { provider, name, model } = candidates[i]!;

    // Skip providers in cooldown (unless probe-eligible)
    if (isProviderInCooldown(name) && !shouldProbe(name)) {
      logger.info('Skipping provider in cooldown (stream)', { provider: name });
      continue;
    }

    let chunksYielded = false;

    try {
      const stream = fn(provider);
      for await (const chunk of stream) {
        chunksYielded = true;
        yield chunk;
      }

      // Stream completed successfully
      clearProviderCooldown(name);
      return;
    } catch (err) {
      // User abort — rethrow immediately
      if (isUserAbort(err)) throw err;

      // Context overflow — rethrow (smaller models won't help)
      if (isContextOverflow(err)) throw err;

      // Mid-stream error — can't retry (chunks already sent to client)
      if (chunksYielded) {
        const failoverErr = coerceToFailoverError(err, name, model);
        if (failoverErr?.reason === 'rate_limit') {
          markProviderCooldown(name, failoverErr.reason);
        }
        yield {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        return;
      }

      // Pre-chunk error — can retry on next provider
      const failoverErr =
        err instanceof FailoverError
          ? err
          : coerceToFailoverError(err, name, model) ??
            new FailoverError('unknown', name, model, err instanceof Error ? err.message : String(err));

      if (failoverErr.reason === 'rate_limit') {
        markProviderCooldown(name, failoverErr.reason);
      }

      lastError = failoverErr;
      logger.warn('Provider stream failed, trying next', {
        provider: name,
        model,
        reason: failoverErr.reason,
        attempt: i + 1,
      });
    }
  }

  throw lastError ?? new Error('No candidates available for streaming');
}
