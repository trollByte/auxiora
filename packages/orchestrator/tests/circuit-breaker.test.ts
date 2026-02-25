import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';
import type { CircuitState } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker();
  });

  it('starts in closed state', () => {
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('allows requests when closed', () => {
    expect(breaker.allowRequest()).toBe(true);
  });

  it('records failures and stays closed below threshold', () => {
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(1);

    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(2);
    expect(breaker.allowRequest()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getState()).toBe('open');
    expect(breaker.getFailureCount()).toBe(3);
  });

  it('opens with custom threshold', () => {
    const custom = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) custom.recordFailure();
    expect(custom.getState()).toBe('closed');

    custom.recordFailure();
    expect(custom.getState()).toBe('open');
  });

  it('blocks requests when open before cooldown', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getState()).toBe('open');
    expect(breaker.allowRequest()).toBe(false);
  });

  it('transitions to half_open after cooldown', () => {
    const fast = new CircuitBreaker({ cooldownMs: 50 });
    fast.recordFailure();
    fast.recordFailure();
    fast.recordFailure();
    expect(fast.getState()).toBe('open');

    // Simulate time passing by manipulating Date.now
    const original = Date.now;
    const frozenNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(frozenNow + 100);

    expect(fast.allowRequest()).toBe(true);
    expect(fast.getState()).toBe('half_open');

    vi.spyOn(Date, 'now').mockRestore();
  });

  it('does not transition to half_open before cooldown elapses', () => {
    const fast = new CircuitBreaker({ cooldownMs: 10_000 });
    fast.recordFailure();
    fast.recordFailure();
    fast.recordFailure();
    expect(fast.getState()).toBe('open');

    // Not enough time has passed
    expect(fast.allowRequest()).toBe(false);
    expect(fast.getState()).toBe('open');
  });

  it('closes on success during half_open', () => {
    const fast = new CircuitBreaker({ cooldownMs: 50 });
    fast.recordFailure();
    fast.recordFailure();
    fast.recordFailure();

    const frozenNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(frozenNow + 100);
    fast.allowRequest(); // triggers half_open
    expect(fast.getState()).toBe('half_open');

    fast.recordSuccess();
    expect(fast.getState()).toBe('closed');
    expect(fast.getFailureCount()).toBe(0);

    vi.spyOn(Date, 'now').mockRestore();
  });

  it('reopens on failure during half_open', () => {
    const fast = new CircuitBreaker({ cooldownMs: 50 });
    fast.recordFailure();
    fast.recordFailure();
    fast.recordFailure();

    const frozenNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(frozenNow + 100);
    fast.allowRequest(); // triggers half_open
    expect(fast.getState()).toBe('half_open');

    fast.recordFailure();
    expect(fast.getState()).toBe('open');
    expect(fast.getFailureCount()).toBe(4);

    vi.spyOn(Date, 'now').mockRestore();
  });

  it('recordSuccess resets failure count in closed state', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getFailureCount()).toBe(2);

    breaker.recordSuccess();
    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe('closed');
  });

  it('reset() clears everything', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');

    breaker.reset();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.allowRequest()).toBe(true);
  });

  describe('callbacks', () => {
    it('fires onOpen when circuit opens', () => {
      const onOpen = vi.fn();
      const cb = new CircuitBreaker({ onOpen });

      cb.recordFailure();
      cb.recordFailure();
      expect(onOpen).not.toHaveBeenCalled();

      cb.recordFailure();
      expect(onOpen).toHaveBeenCalledOnce();
      expect(onOpen).toHaveBeenCalledWith(3);
    });

    it('fires onHalfOpen when transitioning to half_open', () => {
      const onHalfOpen = vi.fn();
      const cb = new CircuitBreaker({ cooldownMs: 50, onHalfOpen });

      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      const frozenNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(frozenNow + 100);

      cb.allowRequest();
      expect(onHalfOpen).toHaveBeenCalledOnce();

      vi.spyOn(Date, 'now').mockRestore();
    });

    it('fires onClose when circuit closes from half_open', () => {
      const onClose = vi.fn();
      const cb = new CircuitBreaker({ cooldownMs: 50, onClose });

      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      const frozenNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(frozenNow + 100);
      cb.allowRequest(); // half_open

      cb.recordSuccess();
      expect(onClose).toHaveBeenCalledOnce();

      vi.spyOn(Date, 'now').mockRestore();
    });

    it('does not fire onClose when recordSuccess is called in closed state', () => {
      const onClose = vi.fn();
      const cb = new CircuitBreaker({ onClose });

      cb.recordFailure();
      cb.recordSuccess();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('fires onOpen when reopening from half_open', () => {
      const onOpen = vi.fn();
      const cb = new CircuitBreaker({ cooldownMs: 50, onOpen });

      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(onOpen).toHaveBeenCalledTimes(1);

      const frozenNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(frozenNow + 100);
      cb.allowRequest(); // half_open

      cb.recordFailure(); // reopen
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(onOpen).toHaveBeenLastCalledWith(4);

      vi.spyOn(Date, 'now').mockRestore();
    });
  });
});
