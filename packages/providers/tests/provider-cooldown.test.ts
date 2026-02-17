import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isProviderInCooldown,
  markProviderCooldown,
  clearProviderCooldown,
  shouldProbe,
  recordProbeResult,
  resetAllCooldowns,
} from '../src/provider-cooldown.js';

describe('provider-cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllCooldowns();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('markProviderCooldown & isProviderInCooldown', () => {
    it('marks a provider as in cooldown', () => {
      expect(isProviderInCooldown('openai')).toBe(false);
      markProviderCooldown('openai', 'rate_limit');
      expect(isProviderInCooldown('openai')).toBe(true);
    });

    it('auto-expires after cooldown duration', () => {
      markProviderCooldown('openai', 'rate_limit');
      expect(isProviderInCooldown('openai')).toBe(true);

      // Advance past 60s (first failure cooldown)
      vi.advanceTimersByTime(60_001);
      expect(isProviderInCooldown('openai')).toBe(false);
    });

    it('applies exponential backoff on consecutive failures', () => {
      // 1st failure: 60s
      markProviderCooldown('openai', 'rate_limit');
      vi.advanceTimersByTime(59_999);
      expect(isProviderInCooldown('openai')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(isProviderInCooldown('openai')).toBe(false);

      // 2nd failure: 300s
      markProviderCooldown('openai', 'rate_limit');
      vi.advanceTimersByTime(299_999);
      expect(isProviderInCooldown('openai')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(isProviderInCooldown('openai')).toBe(false);

      // 3rd failure: 1500s
      markProviderCooldown('openai', 'rate_limit');
      vi.advanceTimersByTime(1_499_999);
      expect(isProviderInCooldown('openai')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(isProviderInCooldown('openai')).toBe(false);

      // 4th failure: capped at 3600s
      markProviderCooldown('openai', 'rate_limit');
      vi.advanceTimersByTime(3_599_999);
      expect(isProviderInCooldown('openai')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(isProviderInCooldown('openai')).toBe(false);
    });
  });

  describe('clearProviderCooldown', () => {
    it('clears cooldown and resets consecutive failures', () => {
      markProviderCooldown('openai', 'rate_limit');
      markProviderCooldown('openai', 'rate_limit');
      expect(isProviderInCooldown('openai')).toBe(true);

      clearProviderCooldown('openai');
      expect(isProviderInCooldown('openai')).toBe(false);

      // After clearing, next failure should start at 60s again (reset)
      markProviderCooldown('openai', 'rate_limit');
      vi.advanceTimersByTime(59_999);
      expect(isProviderInCooldown('openai')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(isProviderInCooldown('openai')).toBe(false);
    });

    it('is safe to call on non-existent provider', () => {
      expect(() => clearProviderCooldown('nonexistent')).not.toThrow();
    });
  });

  describe('shouldProbe', () => {
    it('returns false when provider is not in cooldown', () => {
      expect(shouldProbe('openai')).toBe(false);
    });

    it('returns true when expiry is within 2 minutes and lastProbeAt > 30s ago', () => {
      markProviderCooldown('openai', 'rate_limit'); // 60s cooldown

      // At t=0, cooldownUntil is 60s away — within 2 min window
      // lastProbeAt is 0 (never probed), so > 30s condition...
      // We need to be past the 30s throttle from mark time
      // lastProbeAt starts at 0 and Date.now() is 0 at mark time
      // Advance 31s so lastProbeAt (0) is > 30s ago
      vi.advanceTimersByTime(31_000);
      expect(shouldProbe('openai')).toBe(true);
    });

    it('throttles probes to once every 30 seconds', () => {
      // 2nd failure gives 300s cooldown — enough room to test throttle
      markProviderCooldown('openai', 'rate_limit'); // 1st: 60s
      markProviderCooldown('openai', 'rate_limit'); // 2nd: 300s

      // Advance to within 2 min of 300s expiry and past 30s from lastProbeAt(0)
      // At 181s: remaining = 300-181 = 119s < 120s ✓, sinceLastProbe = huge ✓
      vi.advanceTimersByTime(181_000);
      expect(shouldProbe('openai')).toBe(true);

      // Simulate a probe that didn't go through recordProbeResult yet:
      // Record failed probe — sets lastProbeAt to now (181s mark)
      // BUT this bumps to 3rd failure (1500s cooldown from 181s)
      // New cooldownUntil = 181s + 1500s = 1681s
      recordProbeResult('openai', false);

      // Immediately after — throttled (0s since lastProbeAt)
      expect(shouldProbe('openai')).toBe(false);

      // Advance to within 2 min of 1681s and past 30s from lastProbeAt (181s)
      // At 1681 - 60 = 1621s mark: remaining = 60s < 120s, sinceLastProbe = 1621-181 = 1440s > 30s
      vi.advanceTimersByTime(1_621_000 - 181_000); // advance 1440s
      expect(shouldProbe('openai')).toBe(true);

      // Record another failed probe at 1621s mark
      recordProbeResult('openai', false);

      // Immediately after — throttled
      expect(shouldProbe('openai')).toBe(false);
    });

    it('returns false when expiry is far away (> 2 minutes)', () => {
      // Create multiple failures to get a long cooldown
      markProviderCooldown('openai', 'rate_limit'); // 60s
      markProviderCooldown('openai', 'rate_limit'); // 300s

      // At t=0, cooldownUntil is 300s away — well beyond 2 min
      vi.advanceTimersByTime(31_000);
      expect(shouldProbe('openai')).toBe(false);
    });
  });

  describe('recordProbeResult', () => {
    it('clears cooldown on success', () => {
      markProviderCooldown('openai', 'rate_limit');
      expect(isProviderInCooldown('openai')).toBe(true);

      recordProbeResult('openai', true);
      expect(isProviderInCooldown('openai')).toBe(false);
    });

    it('extends cooldown on failure', () => {
      markProviderCooldown('openai', 'rate_limit'); // 1st: 60s
      const firstExpiry = 60_000;

      vi.advanceTimersByTime(31_000);
      recordProbeResult('openai', false); // 2nd failure: extends to 300s from now

      // Should still be in cooldown well past the original 60s
      vi.advanceTimersByTime(60_000);
      expect(isProviderInCooldown('openai')).toBe(true);
    });
  });

  describe('resetAllCooldowns', () => {
    it('clears all cooldowns', () => {
      markProviderCooldown('openai', 'rate_limit');
      markProviderCooldown('anthropic', 'billing');
      expect(isProviderInCooldown('openai')).toBe(true);
      expect(isProviderInCooldown('anthropic')).toBe(true);

      resetAllCooldowns();
      expect(isProviderInCooldown('openai')).toBe(false);
      expect(isProviderInCooldown('anthropic')).toBe(false);
    });
  });
});
