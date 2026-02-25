import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { DashboardSession } from './types.js';
import { MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } from './types.js';

const logger = getLogger('dashboard:auth');

export class DashboardAuth {
  private sessions = new Map<string, DashboardSession>();
  private sessionTtlMs: number;
  private loginAttempts = new Map<string, { count: number; windowStart: number }>();

  constructor(sessionTtlMs: number) {
    this.sessionTtlMs = sessionTtlMs;
  }

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = this.loginAttempts.get(ip);

    if (!entry) return false;

    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
      this.loginAttempts.delete(ip);
      return false;
    }

    return entry.count >= MAX_LOGIN_ATTEMPTS;
  }

  recordAttempt(ip: string): void {
    const now = Date.now();
    const entry = this.loginAttempts.get(ip);

    if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
      this.loginAttempts.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count++;
    }
  }

  createSession(ip: string): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.sessions.set(id, {
      id,
      createdAt: now,
      lastActive: now,
      ip,
    });

    logger.info('Dashboard session created', { sessionId: id });
    return id;
  }

  validateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    if (now - session.lastActive > this.sessionTtlMs) {
      this.sessions.delete(sessionId);
      return false;
    }

    session.lastActive = now;
    return true;
  }

  destroySession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > this.sessionTtlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
