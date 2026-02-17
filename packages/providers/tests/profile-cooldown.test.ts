import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isProfileInCooldown,
  markProfileCooldown,
  clearProfileCooldown,
  shouldProbeProfile,
  recordProfileProbeResult,
  resetAllProfileCooldowns,
} from '../src/profile-cooldown.js';

describe('Profile Cooldown', () => {
  beforeEach(() => {
    resetAllProfileCooldowns();
    vi.restoreAllMocks();
  });

  describe('markProfileCooldown & isProfileInCooldown', () => {
    it('should mark profile as in cooldown', () => {
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
    });

    it('should track profiles independently', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      expect(isProfileInCooldown('anthropic', 1)).toBe(false);
    });

    it('should auto-expire standard cooldown after duration', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);

      // First failure = 60s cooldown
      vi.advanceTimersByTime(61_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
      vi.useRealTimers();
    });

    it('should apply exponential backoff on consecutive failures', () => {
      vi.useFakeTimers();

      // 1st: 60s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(61_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 2nd: 300s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(301_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 3rd: 1500s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(1501_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 4th: capped at 3600s
      markProfileCooldown('anthropic', 0, 'rate_limit');
      vi.advanceTimersByTime(3599_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('billing backoff', () => {
    it('should apply longer cooldown for billing errors', () => {
      vi.useFakeTimers();

      // 1st billing failure: 5 hours (18000s)
      markProfileCooldown('anthropic', 0, 'billing');
      vi.advanceTimersByTime(17999_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 2nd billing failure: 15 hours (54000s)
      markProfileCooldown('anthropic', 0, 'billing');
      vi.advanceTimersByTime(53999_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      // 3rd: capped at 24 hours (86400s)
      markProfileCooldown('anthropic', 0, 'billing');
      vi.advanceTimersByTime(86399_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('clearProfileCooldown', () => {
    it('should clear cooldown and reset failure count', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      clearProfileCooldown('anthropic', 0);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
    });

    it('should be safe to clear non-existent profile', () => {
      expect(() => clearProfileCooldown('nonexistent', 99)).not.toThrow();
    });
  });

  describe('shouldProbeProfile', () => {
    it('should return false when not in cooldown', () => {
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);
    });

    it('should return true when cooldown expiry is within 2 minutes', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit'); // 60s cooldown
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);
      vi.useRealTimers();
    });

    it('should throttle probes to once per 30 seconds', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit'); // 60s cooldown
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);

      // Failed probe extends to 300s (2nd failure), sets lastProbeAt
      recordProfileProbeResult('anthropic', 0, false);

      // 15s later — outside 2-min window AND within throttle
      vi.advanceTimersByTime(15_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);

      // Advance into the 2-min window: at 181s, remaining ~119s, sinceLastProbe ~181s
      vi.advanceTimersByTime(166_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);

      // Another failed probe at t=181s → 3rd failure, 1500s cooldown
      recordProfileProbeResult('anthropic', 0, false);

      // 15s later — within throttle
      vi.advanceTimersByTime(15_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);

      // 31s after last probe — throttle ok but remaining ~1469s > 120s window
      vi.advanceTimersByTime(16_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);

      vi.useRealTimers();
    });

    it('should block probes after failed probe extends cooldown beyond window', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit'); // 60s, 1st failure
      expect(shouldProbeProfile('anthropic', 0)).toBe(true);

      // Failed probe extends to 300s (2nd failure) — outside 2-min window
      recordProfileProbeResult('anthropic', 0, false);

      // Even after 31s (throttle met), probing blocked by window check
      vi.advanceTimersByTime(31_000);
      expect(shouldProbeProfile('anthropic', 0)).toBe(false); // 269s remaining > 120s

      vi.useRealTimers();
    });

    it('should not probe when cooldown expiry is far away', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'billing'); // 5 hours
      expect(shouldProbeProfile('anthropic', 0)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('recordProfileProbeResult', () => {
    it('should clear cooldown on success', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      recordProfileProbeResult('anthropic', 0, true);
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
    });

    it('should extend cooldown on failure', () => {
      vi.useFakeTimers();
      markProfileCooldown('anthropic', 0, 'rate_limit'); // 60s
      recordProfileProbeResult('anthropic', 0, false); // extends as 2nd failure -> 300s

      vi.advanceTimersByTime(61_000);
      expect(isProfileInCooldown('anthropic', 0)).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('resetAllProfileCooldowns', () => {
    it('should clear all profile cooldowns', () => {
      markProfileCooldown('anthropic', 0, 'rate_limit');
      markProfileCooldown('openai', 1, 'billing');
      resetAllProfileCooldowns();
      expect(isProfileInCooldown('anthropic', 0)).toBe(false);
      expect(isProfileInCooldown('openai', 1)).toBe(false);
    });
  });
});
