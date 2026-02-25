import { describe, expect, it } from 'vitest';
import { ScheduleAnalyzer } from '../src/analyzer.js';
import type { CalendarEvent } from '../src/types.js';

function makeEvent(overrides: Partial<CalendarEvent> & { id: string; start: string; end: string }): CalendarEvent {
  return {
    subject: 'Test Meeting',
    attendees: [],
    isOnlineMeeting: false,
    ...overrides,
  };
}

describe('ScheduleAnalyzer', () => {
  const analyzer = new ScheduleAnalyzer();

  describe('analyzeDay', () => {
    it('counts events correctly', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T11:00:00Z', end: '2025-03-15T12:00:00Z' }),
        makeEvent({ id: '3', start: '2025-03-16T09:00:00Z', end: '2025-03-16T10:00:00Z' }),
      ];

      const result = analyzer.analyzeDay(events, '2025-03-15');
      expect(result.eventCount).toBe(2);
      expect(result.events).toHaveLength(2);
    });

    it('finds free slots between events', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T14:00:00Z', end: '2025-03-15T15:00:00Z' }),
      ];

      const result = analyzer.analyzeDay(events, '2025-03-15');
      expect(result.freeSlots.length).toBeGreaterThanOrEqual(1);
      // There should be a free slot from 10:00 to 14:00
      const bigSlot = result.freeSlots.find((s) => s.durationMinutes === 240);
      expect(bigSlot).toBeDefined();
    });

    it('respects workday bounds', () => {
      const customAnalyzer = new ScheduleAnalyzer({ workdayStartHour: 8, workdayEndHour: 18 });
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T10:00:00Z', end: '2025-03-15T11:00:00Z' }),
      ];

      const result = customAnalyzer.analyzeDay(events, '2025-03-15');
      // Free slot before: 08:00-10:00 (120 min), after: 11:00-18:00 (420 min)
      const beforeSlot = result.freeSlots.find((s) => s.durationMinutes === 120);
      const afterSlot = result.freeSlots.find((s) => s.durationMinutes === 420);
      expect(beforeSlot).toBeDefined();
      expect(afterSlot).toBeDefined();
    });

    it('detects overlapping events as conflicts', () => {
      const events = [
        makeEvent({ id: '1', subject: 'Meeting A', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:30:00Z' }),
        makeEvent({ id: '2', subject: 'Meeting B', start: '2025-03-15T10:00:00Z', end: '2025-03-15T11:00:00Z' }),
      ];

      const result = analyzer.analyzeDay(events, '2025-03-15');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].overlapMinutes).toBe(30);
    });

    it('identifies focus blocks (slots >= 60min)', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T09:30:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T09:45:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '3', start: '2025-03-15T14:00:00Z', end: '2025-03-15T15:00:00Z' }),
      ];

      const result = analyzer.analyzeDay(events, '2025-03-15');
      // 09:30-09:45 = 15min (not focus), 10:00-14:00 = 240min (focus), 15:00-17:00 = 120min (focus)
      expect(result.focusBlocks.length).toBe(2);
      expect(result.focusBlocks.every((b) => b.durationMinutes >= 60)).toBe(true);
    });

    it('calculates meeting load hours', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T11:00:00Z', end: '2025-03-15T12:30:00Z' }),
      ];

      const result = analyzer.analyzeDay(events, '2025-03-15');
      expect(result.meetingLoadHours).toBe(2.5);
    });
  });

  describe('findFreeSlots', () => {
    it('finds gaps correctly', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T12:00:00Z', end: '2025-03-15T13:00:00Z' }),
      ];

      const slots = analyzer.findFreeSlots(events, '2025-03-15T08:00:00Z', '2025-03-15T17:00:00Z');
      expect(slots).toHaveLength(3);
      // 08-09 (60min), 10-12 (120min), 13-17 (240min)
      expect(slots[0].durationMinutes).toBe(60);
      expect(slots[1].durationMinutes).toBe(120);
      expect(slots[2].durationMinutes).toBe(240);
    });

    it('filters by minimum duration', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T10:15:00Z', end: '2025-03-15T11:00:00Z' }),
      ];

      const slots = analyzer.findFreeSlots(events, '2025-03-15T09:00:00Z', '2025-03-15T12:00:00Z', 30);
      // 10:00-10:15 = 15min (excluded), 11:00-12:00 = 60min (included)
      expect(slots).toHaveLength(1);
      expect(slots[0].durationMinutes).toBe(60);
    });

    it('handles empty event list (whole range is free)', () => {
      const slots = analyzer.findFreeSlots([], '2025-03-15T09:00:00Z', '2025-03-15T17:00:00Z');
      expect(slots).toHaveLength(1);
      expect(slots[0].durationMinutes).toBe(480);
    });
  });

  describe('detectConflicts', () => {
    it('returns empty for non-overlapping events', () => {
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T10:00:00Z', end: '2025-03-15T11:00:00Z' }),
        makeEvent({ id: '3', start: '2025-03-15T14:00:00Z', end: '2025-03-15T15:00:00Z' }),
      ];

      const conflicts = analyzer.detectConflicts(events);
      expect(conflicts).toHaveLength(0);
    });

    it('detects multiple conflicts', () => {
      const events = [
        makeEvent({ id: '1', subject: 'A', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:30:00Z' }),
        makeEvent({ id: '2', subject: 'B', start: '2025-03-15T10:00:00Z', end: '2025-03-15T11:00:00Z' }),
        makeEvent({ id: '3', subject: 'C', start: '2025-03-15T10:15:00Z', end: '2025-03-15T11:30:00Z' }),
      ];

      const conflicts = analyzer.detectConflicts(events);
      // A overlaps B, A overlaps C, B overlaps C
      expect(conflicts).toHaveLength(3);
    });
  });
});
