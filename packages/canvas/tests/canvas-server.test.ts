import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CanvasServer } from '../src/canvas-server.js';
import type { CanvasEvent, TextObject } from '../src/types.js';

describe('CanvasServer', () => {
  let server: CanvasServer;

  beforeEach(() => {
    server = new CanvasServer({ maxSessions: 5 });
  });

  afterEach(() => {
    server.destroy();
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const session = server.createSession();
      expect(session.id).toBeTruthy();
      expect(server.getSessionCount()).toBe(1);
    });

    it('should create session with custom options', () => {
      const session = server.createSession({ id: 'custom', width: 800, height: 600 });
      expect(session.id).toBe('custom');
      expect(session.getSize()).toEqual({ width: 800, height: 600 });
    });

    it('should throw when max sessions reached', () => {
      for (let i = 0; i < 5; i++) {
        server.createSession();
      }
      expect(() => server.createSession()).toThrow('Maximum sessions (5) reached');
    });
  });

  describe('getSession', () => {
    it('should return existing session', () => {
      const session = server.createSession({ id: 'my-session' });
      expect(server.getSession('my-session')).toBe(session);
    });

    it('should return undefined for non-existent session', () => {
      expect(server.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('destroySession', () => {
    it('should remove session', () => {
      const session = server.createSession({ id: 'to-destroy' });
      expect(server.destroySession('to-destroy')).toBe(true);
      expect(server.getSession('to-destroy')).toBeUndefined();
      expect(server.getSessionCount()).toBe(0);
    });

    it('should return false for non-existent session', () => {
      expect(server.destroySession('nonexistent')).toBe(false);
    });
  });

  describe('getSessions', () => {
    it('should return all sessions', () => {
      server.createSession({ id: 'a' });
      server.createSession({ id: 'b' });
      const sessions = server.getSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('global event forwarding', () => {
    it('should forward object:added events from sessions', () => {
      const handler = vi.fn();
      server.on('object:added', handler);

      const session = server.createSession();
      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].sessionId).toBe(session.id);
    });

    it('should forward events from multiple sessions', () => {
      const handler = vi.fn();
      server.on('object:added', handler);

      const s1 = server.createSession({ id: 'session-1' });
      const s2 = server.createSession({ id: 'session-2' });

      s1.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'A', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      s2.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'B', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should forward canvas:cleared events', () => {
      const handler = vi.fn();
      server.on('canvas:cleared', handler);

      const session = server.createSession();
      session.clear();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should forward viewer events', () => {
      const joinHandler = vi.fn();
      const leaveHandler = vi.fn();
      server.on('viewer:joined', joinHandler);
      server.on('viewer:left', leaveHandler);

      const session = server.createSession();
      session.addViewer('v1', 'Alice');
      expect(joinHandler).toHaveBeenCalledOnce();

      session.removeViewer('v1');
      expect(leaveHandler).toHaveBeenCalledOnce();
    });

    it('should unregister global handler', () => {
      const handler = vi.fn();
      server.on('object:added', handler);
      server.off('object:added', handler);

      const session = server.createSession();
      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should remove all sessions', () => {
      server.createSession({ id: 'a' });
      server.createSession({ id: 'b' });
      server.destroy();
      expect(server.getSessionCount()).toBe(0);
    });
  });
});
