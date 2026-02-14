import { describe, it, expect, beforeEach } from 'vitest';
import { DoNotDisturbManager } from '../src/dnd.js';
import type { Notification, DndSchedule } from '../src/types.js';

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

describe('DoNotDisturbManager', () => {
  let dnd: DoNotDisturbManager;

  beforeEach(() => {
    dnd = new DoNotDisturbManager();
  });

  describe('schedule-based DND', () => {
    it('should be active during scheduled hours', () => {
      const schedule: DndSchedule = {
        enabled: true,
        startHour: 22,
        endHour: 7,
        days: [0, 1, 2, 3, 4, 5, 6],
        allowUrgent: true,
      };
      dnd.setSchedule(schedule);

      // 23:00 on a Wednesday (day 3)
      const lateNight = new Date(2025, 0, 1, 23, 0); // Jan 1, 2025 is Wednesday
      expect(dnd.isActive(lateNight)).toBe(true);
    });

    it('should be inactive outside scheduled hours', () => {
      const schedule: DndSchedule = {
        enabled: true,
        startHour: 22,
        endHour: 7,
        days: [0, 1, 2, 3, 4, 5, 6],
        allowUrgent: true,
      };
      dnd.setSchedule(schedule);

      // 14:00 on a Wednesday
      const afternoon = new Date(2025, 0, 1, 14, 0);
      expect(dnd.isActive(afternoon)).toBe(false);
    });

    it('should be inactive on non-scheduled days', () => {
      const schedule: DndSchedule = {
        enabled: true,
        startHour: 22,
        endHour: 7,
        days: [1, 2, 3, 4, 5], // weekdays only
        allowUrgent: true,
      };
      dnd.setSchedule(schedule);

      // Sunday at 23:00 (day 0, not in schedule)
      const sundayNight = new Date(2025, 0, 5, 23, 0); // Jan 5, 2025 is Sunday
      expect(dnd.isActive(sundayNight)).toBe(false);
    });
  });

  describe('manual DND', () => {
    it('should be active before expiry', () => {
      dnd.setManual(60000); // 1 minute
      expect(dnd.isActive()).toBe(true);
    });

    it('should expire after duration', () => {
      dnd.setManual(0); // already expired
      const future = new Date(Date.now() + 1);
      expect(dnd.isActive(future)).toBe(false);
    });

    it('should be clearable', () => {
      dnd.setManual(60000);
      dnd.clearManual();
      expect(dnd.isActive()).toBe(false);
    });
  });

  describe('filter()', () => {
    it('should pass urgent notifications when allowUrgent is true', () => {
      const schedule: DndSchedule = {
        enabled: true,
        startHour: 0,
        endHour: 23,
        days: [0, 1, 2, 3, 4, 5, 6],
        allowUrgent: true,
      };
      dnd.setSchedule(schedule);

      const notifications = [
        makeNotification({ priority: 'urgent', title: 'Urgent' }),
        makeNotification({ priority: 'low', title: 'Low' }),
        makeNotification({ priority: 'important', title: 'Important' }),
      ];

      // Use explicit time within DND window to avoid flakiness
      const noon = new Date(2025, 0, 1, 12, 0);
      const filtered = dnd.filter(notifications, noon);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Urgent');
    });

    it('should block all non-urgent notifications when DND is active', () => {
      const schedule: DndSchedule = {
        enabled: true,
        startHour: 0,
        endHour: 23,
        days: [0, 1, 2, 3, 4, 5, 6],
        allowUrgent: false,
      };
      dnd.setSchedule(schedule);

      const notifications = [
        makeNotification({ priority: 'urgent', title: 'Urgent' }),
        makeNotification({ priority: 'low', title: 'Low' }),
      ];

      const noon = new Date(2025, 0, 1, 12, 0);
      const filtered = dnd.filter(notifications, noon);
      expect(filtered).toHaveLength(0);
    });

    it('should pass all notifications when DND is inactive', () => {
      // No schedule set, DND is inactive
      const notifications = [
        makeNotification({ priority: 'urgent', title: 'Urgent' }),
        makeNotification({ priority: 'low', title: 'Low' }),
      ];

      const filtered = dnd.filter(notifications);
      expect(filtered).toHaveLength(2);
    });
  });
});
