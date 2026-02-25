import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardAuth } from '../src/auth.js';
import { MAX_LOGIN_ATTEMPTS } from '../src/types.js';

describe('DashboardAuth', () => {
  let auth: DashboardAuth;

  beforeEach(() => {
    auth = new DashboardAuth(3_600_000); // 1 hour TTL
  });

  it('should create and validate a session', () => {
    const sessionId = auth.createSession('127.0.0.1');
    expect(auth.validateSession(sessionId)).toBe(true);
  });

  it('should reject unknown session', () => {
    expect(auth.validateSession('nonexistent')).toBe(false);
  });

  it('should expire sessions after TTL', () => {
    const shortAuth = new DashboardAuth(1); // 1ms TTL
    const sessionId = shortAuth.createSession('127.0.0.1');

    // Wait for expiry
    vi.useFakeTimers();
    vi.advanceTimersByTime(10);
    expect(shortAuth.validateSession(sessionId)).toBe(false);
    vi.useRealTimers();
  });

  it('should destroy a session on logout', () => {
    const sessionId = auth.createSession('127.0.0.1');
    expect(auth.destroySession(sessionId)).toBe(true);
    expect(auth.validateSession(sessionId)).toBe(false);
  });

  it('should rate limit after max attempts', () => {
    const ip = '192.168.1.1';
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      auth.recordAttempt(ip);
    }
    expect(auth.isRateLimited(ip)).toBe(true);
  });

  it('should not rate limit under the threshold', () => {
    const ip = '192.168.1.1';
    auth.recordAttempt(ip);
    expect(auth.isRateLimited(ip)).toBe(false);
  });
});
