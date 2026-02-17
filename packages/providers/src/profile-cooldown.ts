/**
 * Per-profile cooldown tracking with exponential backoff.
 *
 * Extends the same pattern as provider-cooldown.ts but keyed by
 * provider:keyIndex and with special billing backoff.
 */

import type { FailoverReason } from './failover-error.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileCooldownEntry {
  provider: string;
  keyIndex: number;
  reason: FailoverReason;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastProbeAt: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level state                                                 */
/* ------------------------------------------------------------------ */

const cooldowns: Map<string, ProfileCooldownEntry> = new Map();

function profileKey(provider: string, keyIndex: number): string {
  return `${provider}:${keyIndex}`;
}

/* ------------------------------------------------------------------ */
/*  Backoff formulas                                                   */
/* ------------------------------------------------------------------ */

/** Standard backoff: min(60 * 5^(failures-1), 3600) seconds. */
function standardBackoffMs(failures: number): number {
  return Math.min(60 * Math.pow(5, failures - 1), 3600) * 1000;
}

/** Billing backoff: min(18000 * 3^(failures-1), 86400) seconds. */
function billingBackoffMs(failures: number): number {
  return Math.min(18000 * Math.pow(3, failures - 1), 86400) * 1000;
}

function computeCooldownMs(failures: number, reason: FailoverReason): number {
  return reason === 'billing' ? billingBackoffMs(failures) : standardBackoffMs(failures);
}

/** Two-minute probe window threshold in milliseconds. */
const PROBE_WINDOW_MS = 2 * 60 * 1000;

/** Minimum interval between probes in milliseconds. */
const PROBE_THROTTLE_MS = 30 * 1000;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function isProfileInCooldown(provider: string, keyIndex: number): boolean {
  const entry = cooldowns.get(profileKey(provider, keyIndex));
  if (!entry) return false;
  if (Date.now() >= entry.cooldownUntil) return false;
  return true;
}

export function markProfileCooldown(
  provider: string,
  keyIndex: number,
  reason: FailoverReason,
): void {
  const key = profileKey(provider, keyIndex);
  const existing = cooldowns.get(key);
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  const durationMs = computeCooldownMs(failures, reason);

  cooldowns.set(key, {
    provider,
    keyIndex,
    reason,
    cooldownUntil: Date.now() + durationMs,
    consecutiveFailures: failures,
    lastProbeAt: existing?.lastProbeAt ?? 0,
  });
}

export function clearProfileCooldown(provider: string, keyIndex: number): void {
  cooldowns.delete(profileKey(provider, keyIndex));
}

export function shouldProbeProfile(provider: string, keyIndex: number): boolean {
  const entry = cooldowns.get(profileKey(provider, keyIndex));
  if (!entry) return false;

  const now = Date.now();
  if (now >= entry.cooldownUntil) return false;

  const remaining = entry.cooldownUntil - now;
  if (remaining > PROBE_WINDOW_MS) return false;
  if (now - entry.lastProbeAt < PROBE_THROTTLE_MS) return false;

  return true;
}

export function recordProfileProbeResult(
  provider: string,
  keyIndex: number,
  success: boolean,
): void {
  if (success) {
    cooldowns.delete(profileKey(provider, keyIndex));
    return;
  }

  const key = profileKey(provider, keyIndex);
  const entry = cooldowns.get(key);
  if (!entry) return;

  const failures = entry.consecutiveFailures + 1;
  const durationMs = computeCooldownMs(failures, entry.reason);

  cooldowns.set(key, {
    ...entry,
    cooldownUntil: Date.now() + durationMs,
    consecutiveFailures: failures,
    lastProbeAt: Date.now(),
  });
}

/** Clear all profile cooldowns. Primarily for testing. */
export function resetAllProfileCooldowns(): void {
  cooldowns.clear();
}
