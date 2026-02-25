import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/session-manager.js';
import type { CodeExecutor } from '../src/executor.js';
import type { ExecutionResult } from '../src/types.js';

// Mock logger
vi.mock('@auxiora/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockExecutor(result?: Partial<ExecutionResult>): CodeExecutor {
  return {
    execute: vi.fn().mockResolvedValue({
      status: 'success',
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 10,
      ...result,
    }),
    isLanguageAvailable: vi.fn().mockResolvedValue(true),
  } as unknown as CodeExecutor;
}

describe('SessionManager', () => {
  let manager: SessionManager;
  let mockExecutor: CodeExecutor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockExecutor = createMockExecutor();
    manager = new SessionManager(mockExecutor);
  });

  afterEach(() => {
    manager.destroyAll();
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('should create a session with a unique id', () => {
      const session = manager.createSession('javascript');

      expect(session.id).toBeDefined();
      expect(session.language).toBe('javascript');
      expect(session.history).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastActivity).toBeGreaterThan(0);
    });

    it('should enforce maxSessions limit', () => {
      const mgr = new SessionManager(mockExecutor, { maxSessions: 2 });

      mgr.createSession('javascript');
      mgr.createSession('javascript');

      expect(() => mgr.createSession('javascript')).toThrow(
        'Maximum number of sessions (2) reached',
      );

      mgr.destroyAll();
    });

    it('should reject disallowed languages', () => {
      const mgr = new SessionManager(mockExecutor, {
        allowedLanguages: ['javascript'],
      });

      expect(() => mgr.createSession('python')).toThrow(
        'Language "python" is not allowed',
      );

      mgr.destroyAll();
    });

    it('should allow configured languages', () => {
      const mgr = new SessionManager(mockExecutor, {
        allowedLanguages: ['javascript', 'typescript'],
      });

      const session = mgr.createSession('typescript');
      expect(session.language).toBe('typescript');

      mgr.destroyAll();
    });
  });

  describe('execute', () => {
    it('should execute code in the session', async () => {
      const session = manager.createSession('javascript');
      const result = await manager.execute(session.id, 'console.log("hi")');

      expect(result.status).toBe('success');
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'console.log("hi")',
          language: 'javascript',
        }),
      );
    });

    it('should append to session history', async () => {
      const session = manager.createSession('javascript');

      await manager.execute(session.id, 'console.log(1)');
      await manager.execute(session.id, 'console.log(2)');

      const updated = manager.getSession(session.id);
      expect(updated?.history).toHaveLength(2);
      expect(updated?.history[0]?.code).toBe('console.log(1)');
      expect(updated?.history[1]?.code).toBe('console.log(2)');
    });

    it('should throw for unknown session id', async () => {
      await expect(
        manager.execute('nonexistent', 'code'),
      ).rejects.toThrow('Session "nonexistent" not found');
    });

    it('should update lastActivity on execute', async () => {
      const session = manager.createSession('javascript');
      const initialActivity = session.lastActivity;

      vi.advanceTimersByTime(1000);
      await manager.execute(session.id, 'code');

      const updated = manager.getSession(session.id);
      expect(updated!.lastActivity).toBeGreaterThan(initialActivity);
    });
  });

  describe('getSession', () => {
    it('should return session by id', () => {
      const session = manager.createSession('javascript');
      const found = manager.getSession(session.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(session.id);
    });

    it('should return undefined for unknown id', () => {
      expect(manager.getSession('unknown')).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    it('should return all sessions', () => {
      manager.createSession('javascript');
      manager.createSession('typescript');

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should return empty array when no sessions', () => {
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe('destroySession', () => {
    it('should remove a session', () => {
      const session = manager.createSession('javascript');
      manager.destroySession(session.id);

      expect(manager.getSession(session.id)).toBeUndefined();
      expect(manager.listSessions()).toHaveLength(0);
    });

    it('should be safe to destroy nonexistent session', () => {
      expect(() => manager.destroySession('nonexistent')).not.toThrow();
    });
  });

  describe('destroyAll', () => {
    it('should remove all sessions', () => {
      manager.createSession('javascript');
      manager.createSession('typescript');
      manager.destroyAll();

      expect(manager.listSessions()).toHaveLength(0);
    });
  });

  describe('idle cleanup', () => {
    it('should remove sessions idle for more than 30 minutes', () => {
      const session = manager.createSession('javascript');

      // Advance past idle timeout (30 min) plus cleanup interval (1 min)
      vi.advanceTimersByTime(31 * 60 * 1000);

      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('should keep active sessions', async () => {
      const session = manager.createSession('javascript');

      // Advance 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000);

      // Execute to refresh lastActivity
      await manager.execute(session.id, 'console.log(1)');

      // Advance another 20 minutes (40 total, but only 20 since last activity)
      vi.advanceTimersByTime(20 * 60 * 1000);

      expect(manager.getSession(session.id)).toBeDefined();
    });
  });
});
