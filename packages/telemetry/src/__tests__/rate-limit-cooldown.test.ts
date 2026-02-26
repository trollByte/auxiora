import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimitCooldown } from '../rate-limit-cooldown.js';

describe('RateLimitCooldown', () => {
  let cooldown: RateLimitCooldown;

  beforeEach(() => {
    vi.useFakeTimers();
    cooldown = new RateLimitCooldown({
      windowMs: 60_000,
      failureThreshold: 3,
      cooldownMs: 30_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows calls when below threshold', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('triggers cooldown at threshold', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);
  });

  it('clears cooldown after timer expires', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);
    vi.advanceTimersByTime(30_001);
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('evicts failures outside sliding window', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    vi.advanceTimersByTime(61_000);
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('tracks keys independently', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);
    expect(cooldown.isCoolingDown('anthropic')).toBe(false);
  });

  it('returns remaining cooldown time', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    const remaining = cooldown.getRemainingCooldown('openai');
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(30_000);
  });

  it('recordSuccess resets failure count', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    cooldown.recordSuccess('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(false);
  });

  it('getStatus returns all tracked keys', () => {
    cooldown.recordFailure('openai');
    cooldown.recordFailure('anthropic');
    const status = cooldown.getStatus();
    expect(status).toHaveLength(2);
    expect(status.map(s => s.key)).toContain('openai');
    expect(status.map(s => s.key)).toContain('anthropic');
  });
});
