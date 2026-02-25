import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationHub } from '../src/hub.js';
import type { NotificationInput } from '../src/types.js';

describe('NotificationHub', () => {
  let hub: NotificationHub;

  beforeEach(() => {
    hub = new NotificationHub({ defaultPriority: 'low' });
  });

  describe('send()', () => {
    it('should create notification with auto-ID and timestamp', () => {
      const result = hub.send({
        source: 'email',
        priority: 'urgent',
        title: 'New message',
        body: 'You have a new email',
      });

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('number');
    });

    it('should apply default priority when not specified', () => {
      const result = hub.send({
        source: 'system',
        title: 'Update',
        body: 'System updated',
      });

      expect(result.priority).toBe('low');
    });

    it('should batch low-priority notifications', () => {
      hub.send({
        source: 'social',
        priority: 'low',
        title: 'Like',
        body: 'Someone liked your post',
      });

      expect(hub.getAll()).toHaveLength(0);
      expect(hub.getBatch()).toHaveLength(1);
    });

    it('should not batch urgent notifications', () => {
      hub.send({
        source: 'system',
        priority: 'urgent',
        title: 'Alert',
        body: 'Critical system alert',
      });

      expect(hub.getAll()).toHaveLength(1);
      expect(hub.getBatch()).toHaveLength(0);
    });

    it('should batch muted notifications', () => {
      hub.send({
        source: 'social',
        priority: 'muted',
        title: 'Noise',
        body: 'Something happened',
      });

      expect(hub.getAll()).toHaveLength(0);
      expect(hub.getBatch()).toHaveLength(1);
    });
  });

  describe('getUnread()', () => {
    it('should return only unread notifications', () => {
      const n1 = hub.send({ source: 'email', priority: 'urgent', title: 'A', body: 'a' });
      hub.send({ source: 'email', priority: 'important', title: 'B', body: 'b' });
      hub.markRead(n1.id);

      const unread = hub.getUnread();
      expect(unread).toHaveLength(1);
      expect(unread[0].title).toBe('B');
    });

    it('should filter by source', () => {
      hub.send({ source: 'email', priority: 'urgent', title: 'Email', body: 'e' });
      hub.send({ source: 'calendar', priority: 'urgent', title: 'Calendar', body: 'c' });

      const filtered = hub.getUnread({ source: 'email' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Email');
    });

    it('should filter by priority', () => {
      hub.send({ source: 'system', priority: 'urgent', title: 'Urgent', body: 'u' });
      hub.send({ source: 'system', priority: 'important', title: 'Important', body: 'i' });

      const filtered = hub.getUnread({ priority: 'urgent' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Urgent');
    });
  });

  describe('markRead()', () => {
    it('should mark notification as read and return true', () => {
      const n = hub.send({ source: 'email', priority: 'urgent', title: 'Test', body: 'test' });

      const result = hub.markRead(n.id);
      expect(result).toBe(true);
      expect(hub.getUnread()).toHaveLength(0);
    });

    it('should return false for unknown ID', () => {
      expect(hub.markRead('nonexistent')).toBe(false);
    });
  });

  describe('markActioned()', () => {
    it('should mark notification as actioned and return true', () => {
      const n = hub.send({ source: 'email', priority: 'urgent', title: 'Test', body: 'test' });

      const result = hub.markActioned(n.id);
      expect(result).toBe(true);

      const all = hub.getAll();
      expect(all[0].actioned).toBe(true);
    });

    it('should return false for unknown ID', () => {
      expect(hub.markActioned('nonexistent')).toBe(false);
    });
  });

  describe('flushBatch()', () => {
    it('should move batch items to notifications and clear batch', () => {
      hub.send({ source: 'social', priority: 'low', title: 'A', body: 'a' });
      hub.send({ source: 'social', priority: 'low', title: 'B', body: 'b' });

      expect(hub.getBatch()).toHaveLength(2);
      expect(hub.getAll()).toHaveLength(0);

      const flushed = hub.flushBatch();
      expect(flushed).toHaveLength(2);
      expect(hub.getAll()).toHaveLength(2);
      expect(hub.getBatch()).toHaveLength(0);
    });
  });

  describe('getStats()', () => {
    it('should return correct counts', () => {
      const n1 = hub.send({ source: 'email', priority: 'urgent', title: 'A', body: 'a' });
      hub.send({ source: 'calendar', priority: 'important', title: 'B', body: 'b' });
      hub.send({ source: 'email', priority: 'low', title: 'C', body: 'c' }); // batched
      hub.markRead(n1.id);

      const stats = hub.getStats();
      expect(stats.total).toBe(2);
      expect(stats.unread).toBe(1);
      expect(stats.batched).toBe(1);
      expect(stats.bySource).toEqual({ email: 1, calendar: 1 });
      expect(stats.byPriority).toEqual({ urgent: 1, important: 1 });
    });
  });

  describe('clear()', () => {
    it('should empty everything', () => {
      hub.send({ source: 'email', priority: 'urgent', title: 'A', body: 'a' });
      hub.send({ source: 'social', priority: 'low', title: 'B', body: 'b' });

      hub.clear();
      expect(hub.getAll()).toHaveLength(0);
      expect(hub.getBatch()).toHaveLength(0);
    });
  });
});
