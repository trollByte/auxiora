import { describe, it, expect } from 'vitest';
import { DigestGenerator } from '../src/digest.js';
import type { Notification } from '../src/types.js';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    source: 'email',
    priority: 'low',
    title: 'Test',
    body: 'Test body',
    timestamp: Date.now(),
    read: false,
    actioned: false,
    ...overrides,
  };
}

describe('DigestGenerator', () => {
  let generator: DigestGenerator;

  beforeEach(() => {
    generator = new DigestGenerator();
  });

  describe('generate()', () => {
    it('should group notifications by source', () => {
      const notifications = [
        makeNotification({ source: 'email', title: 'Email 1', body: 'e1' }),
        makeNotification({ source: 'calendar', title: 'Meeting', body: 'cal1' }),
        makeNotification({ source: 'email', title: 'Email 2', body: 'e2' }),
      ];

      const digest = generator.generate(notifications);
      expect(digest).toContain('## email');
      expect(digest).toContain('## calendar');

      const emailSection = digest.indexOf('## email');
      const calendarSection = digest.indexOf('## calendar');
      const email2Line = digest.indexOf('Email 2');

      // Email 2 should be under the email section
      expect(email2Line).toBeGreaterThan(emailSection);
    });

    it('should sort by priority within groups', () => {
      const notifications = [
        makeNotification({ source: 'system', priority: 'low', title: 'Low', body: 'l', timestamp: 1 }),
        makeNotification({ source: 'system', priority: 'urgent', title: 'Urgent', body: 'u', timestamp: 2 }),
        makeNotification({ source: 'system', priority: 'important', title: 'Important', body: 'i', timestamp: 3 }),
      ];

      const digest = generator.generate(notifications);
      const urgentIdx = digest.indexOf('Urgent');
      const importantIdx = digest.indexOf('Important');
      const lowIdx = digest.indexOf('Low');

      expect(urgentIdx).toBeLessThan(importantIdx);
      expect(importantIdx).toBeLessThan(lowIdx);
    });

    it('should include total count', () => {
      const notifications = [
        makeNotification({ title: 'A', body: 'a' }),
        makeNotification({ title: 'B', body: 'b' }),
        makeNotification({ title: 'C', body: 'c' }),
      ];

      const digest = generator.generate(notifications);
      expect(digest).toContain('3 notification(s)');
    });

    it('should handle empty notifications', () => {
      const digest = generator.generate([]);
      expect(digest).toContain('No notifications');
    });
  });

  describe('generateCompact()', () => {
    it('should produce one line per notification without grouping', () => {
      const notifications = [
        makeNotification({ source: 'email', priority: 'urgent', title: 'Alert', body: 'alert body' }),
        makeNotification({ source: 'calendar', priority: 'low', title: 'Reminder', body: 'reminder body' }),
      ];

      const compact = generator.generateCompact(notifications);
      const lines = compact.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('[email/urgent] Alert: alert body');
      expect(lines[1]).toBe('[calendar/low] Reminder: reminder body');
    });
  });
});
