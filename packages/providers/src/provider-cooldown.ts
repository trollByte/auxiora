/**
 * Per-provider cooldown tracking with exponential backoff.
 *
 * When a provider fails, it enters a cooldown period during which it
 * will not be selected for new requests. Consecutive failures increase
 * the cooldown duration exponentially. A probe mechanism allows
 * testing providers that are close to exiting cooldown.
 */

import type { FailoverReason } from './failover-error.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CooldownEntry {
  provider: string;
  reason: FailoverReason;
  cooldownUntil: number;       // Date.now() + backoff duration
  consecutiveFailures: number;
  lastProbeAt: number;         // Timestamp of last probe attempt
}

/* ------------------------------------------------------------------ */
/*  Module-level state                                                 */
/* ------------------------------------------------------------------ */

const cooldowns: Map<string, CooldownEntry> = new Map();

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Exponential backoff: min(60 * 5^(failures-1), 3600) seconds. */
function backoffSeconds(failures: number): number {
  return Math.min(60 * Math.pow(5, failures - 1), 3600);
}

/** Two-minute probe window threshold in milliseconds. */
const PROBE_WINDOW_MS = 2 * 60 * 1000;

/** Minimum interval between probes in milliseconds. */
const PROBE_THROTTLE_MS = 30 * 1000;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Check whether a provider is currently in cooldown.
 * Automatically removes expired entries.
 */
export function isProviderInCooldown(provider: string): boolean {
  const entry = cooldowns.get(provider);
  if (!entry) return false;

  if (Date.now() >= entry.cooldownUntil) {
    return false;
  }

  return true;
}

/**
 * Mark a provider as entering cooldown. Consecutive calls increment
 * the failure count and apply exponential backoff.
 */
export function markProviderCooldown(provider: string, reason: FailoverReason): void {
  const existing = cooldowns.get(provider);
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  const durationMs = backoffSeconds(failures) * 1000;

  cooldowns.set(provider, {
    provider,
    reason,
    cooldownUntil: Date.now() + durationMs,
    consecutiveFailures: failures,
    lastProbeAt: existing?.lastProbeAt ?? 0,
  });
}

/**
 * Clear cooldown for a provider and reset its failure count.
 * Safe to call on providers that are not in cooldown.
 */
export function clearProviderCooldown(provider: string): void {
  cooldowns.delete(provider);
}

/**
 * Determine whether a probe request should be sent to a cooled-down provider.
 *
 * Returns true when:
 * - The provider IS in cooldown
 * - The cooldown expiry is within 2 minutes
 * - At least 30 seconds have passed since the last probe
 */
export function shouldProbe(provider: string): boolean {
  const entry = cooldowns.get(provider);
  if (!entry) return false;

  const now = Date.now();

  // Already expired — not in cooldown
  if (now >= entry.cooldownUntil) return false;

  const remaining = entry.cooldownUntil - now;
  if (remaining > PROBE_WINDOW_MS) return false;

  const sinceLastProbe = now - entry.lastProbeAt;
  if (sinceLastProbe < PROBE_THROTTLE_MS) return false;

  return true;
}

/**
 * Record the result of a probe attempt.
 * - On success: clears cooldown entirely.
 * - On failure: extends cooldown with incremented backoff and updates lastProbeAt.
 */
export function recordProbeResult(provider: string, success: boolean): void {
  if (success) {
    cooldowns.delete(provider);
    return;
  }

  const entry = cooldowns.get(provider);
  if (!entry) return;

  const failures = entry.consecutiveFailures + 1;
  const durationMs = backoffSeconds(failures) * 1000;

  cooldowns.set(provider, {
    ...entry,
    cooldownUntil: Date.now() + durationMs,
    consecutiveFailures: failures,
    lastProbeAt: Date.now(),
  });
}

/**
 * Clear all cooldowns. Intended for test cleanup.
 */
export function resetAllCooldowns(): void {
  cooldowns.clear();
}
