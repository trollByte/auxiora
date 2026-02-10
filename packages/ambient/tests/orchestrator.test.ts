import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationOrchestrator } from '../src/orchestrator.js';
import type { OrchestratorNotification, DeliveryChannelFn } from '../src/orchestrator.js';
import type { TriggerEvent } from '@auxiora/connectors';
import { NotificationHub, DoNotDisturbManager } from '@auxiora/notification-hub';

describe('NotificationOrchestrator', () => {
  let hub: NotificationHub;
  let dnd: DoNotDisturbManager;
  let delivered: OrchestratorNotification[];
  let deliveryChannel: DeliveryChannelFn;
  let orchestrator: NotificationOrchestrator;

  beforeEach(() => {
    hub = new NotificationHub();
    dnd = new DoNotDisturbManager();
    delivered = [];
    deliveryChannel = (n) => delivered.push(n);
    orchestrator = new NotificationOrchestrator(hub, dnd, deliveryChannel);
  });

  describe('processTriggerEvents', () => {
    it('should map new-email with urgency keyword to urgent priority', () => {
      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email-connector',
        data: { subject: 'URGENT: Server down', from: 'ops@example.com' },
        timestamp: Date.now(),
      };

      const results = orchestrator.processTriggerEvents([event]);

      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe('urgent');
      expect(results[0].message).toContain('ops@example.com');
      expect(results[0].message).toContain('URGENT: Server down');
    });

    it('should detect various urgency keywords case-insensitively', () => {
      const keywords = ['urgent', 'ASAP', 'Important', 'Action Required', 'DEADLINE'];

      for (const keyword of keywords) {
        const hub2 = new NotificationHub();
        const delivered2: OrchestratorNotification[] = [];
        const orch = new NotificationOrchestrator(hub2, dnd, (n) => delivered2.push(n));

        const event: TriggerEvent = {
          triggerId: 'new-email',
          connectorId: 'email-connector',
          data: { subject: `Re: ${keyword} meeting notes`, from: 'test@test.com' },
          timestamp: Date.now(),
        };

        const results = orch.processTriggerEvents([event]);
        expect(results[0].priority).toBe('urgent');
      }
    });

    it('should map new-email without urgency keywords to important priority', () => {
      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email-connector',
        data: { subject: 'Weekly newsletter', from: 'news@example.com' },
        timestamp: Date.now(),
      };

      const results = orchestrator.processTriggerEvents([event]);

      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe('important');
    });

    it('should map event-starting-soon to important priority', () => {
      const event: TriggerEvent = {
        triggerId: 'event-starting-soon',
        connectorId: 'calendar-connector',
        data: { title: 'Team standup' },
        timestamp: Date.now(),
      };

      const results = orchestrator.processTriggerEvents([event]);

      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe('important');
      expect(results[0].message).toContain('Team standup');
      expect(results[0].source).toBe('calendar');
    });

    it('should map file-shared to low priority', () => {
      const event: TriggerEvent = {
        triggerId: 'file-shared',
        connectorId: 'drive-connector',
        data: { fileName: 'report.pdf', sharedBy: 'Alice' },
        timestamp: Date.now(),
      };

      const results = orchestrator.processTriggerEvents([event]);

      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe('low');
      expect(results[0].message).toContain('Alice');
      expect(results[0].message).toContain('report.pdf');
    });

    it('should map unknown trigger events to low priority', () => {
      const event: TriggerEvent = {
        triggerId: 'some-unknown-trigger',
        connectorId: 'custom-connector',
        data: {},
        timestamp: Date.now(),
      };

      const results = orchestrator.processTriggerEvents([event]);

      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe('low');
      expect(results[0].message).toContain('custom-connector');
    });

    it('should process multiple events at once', () => {
      const events: TriggerEvent[] = [
        {
          triggerId: 'new-email',
          connectorId: 'email',
          data: { subject: 'Hello', from: 'a@b.com' },
          timestamp: Date.now(),
        },
        {
          triggerId: 'file-shared',
          connectorId: 'drive',
          data: { fileName: 'doc.txt', sharedBy: 'Bob' },
          timestamp: Date.now(),
        },
      ];

      const results = orchestrator.processTriggerEvents(events);
      expect(results).toHaveLength(2);
    });

    it('should send notifications to the hub', () => {
      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email',
        data: { subject: 'Test', from: 'x@y.com' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);

      const hubNotifications = hub.getAll();
      expect(hubNotifications).toHaveLength(1);
      expect(hubNotifications[0].source).toBe('email');
    });
  });

  describe('DND filtering', () => {
    it('should deliver notifications when DND is inactive', () => {
      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email',
        data: { subject: 'Hello', from: 'a@b.com' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);

      expect(delivered).toHaveLength(1);
      expect(delivered[0].delivered).toBe(true);
    });

    it('should queue non-urgent notifications when DND is active', () => {
      dnd.setManual(60_000);

      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email',
        data: { subject: 'Hello', from: 'a@b.com' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);

      expect(delivered).toHaveLength(0);
      expect(orchestrator.getPending()).toHaveLength(1);
      expect(orchestrator.getPending()[0].delivered).toBe(false);
    });

    it('should allow urgent notifications through DND', () => {
      dnd.setManual(60_000);

      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email',
        data: { subject: 'URGENT: Production is down', from: 'ops@co.com' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);

      expect(delivered).toHaveLength(1);
      expect(delivered[0].priority).toBe('urgent');
    });

    it('should queue low-priority file-shared during DND', () => {
      dnd.setManual(60_000);

      const event: TriggerEvent = {
        triggerId: 'file-shared',
        connectorId: 'drive',
        data: { fileName: 'notes.txt', sharedBy: 'Carol' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);

      expect(delivered).toHaveLength(0);
      expect(orchestrator.getPending()).toHaveLength(1);
    });
  });

  describe('processCalendarCheck', () => {
    it('should create notifications for events starting within alert window', () => {
      const now = Date.now();
      const events = [
        { title: 'Team standup', startTime: now + 10 * 60_000 }, // 10 min
      ];

      const results = orchestrator.processCalendarCheck(events, now);

      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe('important');
      expect(results[0].message).toContain('Team standup');
      expect(results[0].message).toContain('10 minutes');
    });

    it('should ignore events beyond the alert window', () => {
      const now = Date.now();
      const events = [
        { title: 'Later meeting', startTime: now + 60 * 60_000 }, // 60 min
      ];

      const results = orchestrator.processCalendarCheck(events, now);
      expect(results).toHaveLength(0);
    });

    it('should ignore events that have already started', () => {
      const now = Date.now();
      const events = [
        { title: 'Past event', startTime: now - 5 * 60_000 },
      ];

      const results = orchestrator.processCalendarCheck(events, now);
      expect(results).toHaveLength(0);
    });

    it('should use singular "minute" for 1 minute', () => {
      const now = Date.now();
      const events = [
        { title: 'Quick sync', startTime: now + 60_000 }, // 1 min
      ];

      const results = orchestrator.processCalendarCheck(events, now);

      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('1 minute');
      expect(results[0].message).not.toContain('1 minutes');
    });

    it('should respect custom calendar alert window', () => {
      const customOrch = new NotificationOrchestrator(hub, dnd, deliveryChannel, {
        calendarAlertWindowMs: 5 * 60_000, // 5 minutes
      });

      const now = Date.now();
      const events = [
        { title: 'Soon event', startTime: now + 3 * 60_000 },   // 3 min — within
        { title: 'Later event', startTime: now + 10 * 60_000 },  // 10 min — outside
      ];

      const results = customOrch.processCalendarCheck(events, now);
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('Soon event');
    });

    it('should send calendar notifications to the hub', () => {
      const now = Date.now();
      const events = [
        { title: 'Sync', startTime: now + 5 * 60_000 },
      ];

      orchestrator.processCalendarCheck(events, now);

      const hubNotifications = hub.getAll();
      expect(hubNotifications).toHaveLength(1);
      expect(hubNotifications[0].source).toBe('calendar');
      expect(hubNotifications[0].priority).toBe('important');
    });
  });

  describe('getPending and dismiss', () => {
    it('should return empty array when no pending notifications', () => {
      expect(orchestrator.getPending()).toHaveLength(0);
    });

    it('should dismiss a pending notification by ID', () => {
      dnd.setManual(60_000);

      const event: TriggerEvent = {
        triggerId: 'file-shared',
        connectorId: 'drive',
        data: { fileName: 'test.txt', sharedBy: 'Dan' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);
      const pending = orchestrator.getPending();
      expect(pending).toHaveLength(1);

      const dismissed = orchestrator.dismiss(pending[0].id);
      expect(dismissed).toBe(true);
      expect(orchestrator.getPending()).toHaveLength(0);
    });

    it('should return false when dismissing unknown ID', () => {
      expect(orchestrator.dismiss('nonexistent-id')).toBe(false);
    });

    it('should not include delivered notifications in pending', () => {
      const event: TriggerEvent = {
        triggerId: 'new-email',
        connectorId: 'email',
        data: { subject: 'Hello', from: 'a@b.com' },
        timestamp: Date.now(),
      };

      orchestrator.processTriggerEvents([event]);

      // Delivered notifications should not appear in pending
      expect(orchestrator.getPending()).toHaveLength(0);
      expect(delivered).toHaveLength(1);
    });
  });
});
