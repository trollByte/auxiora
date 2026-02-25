import { describe, expect, it } from 'vitest';
import { ScheduleOptimizer } from '../src/optimizer.js';
import type { ScheduleAnalysis, CalendarEvent, ConflictInfo, TimeSlot } from '../src/types.js';

function makeAnalysis(overrides: Partial<ScheduleAnalysis> = {}): ScheduleAnalysis {
  return {
    date: '2025-03-15',
    events: [],
    freeSlots: [],
    conflicts: [],
    focusBlocks: [],
    meetingLoadHours: 0,
    eventCount: 0,
    ...overrides,
  };
}

function makeEvent(id: string, start: string, end: string, subject = 'Meeting'): CalendarEvent {
  return { id, subject, start, end, attendees: [], isOnlineMeeting: false };
}

describe('ScheduleOptimizer', () => {
  const optimizer = new ScheduleOptimizer();

  it('suggests decline when meeting load > 6 hours', () => {
    const analysis = makeAnalysis({ meetingLoadHours: 7 });
    const suggestions = optimizer.suggest(analysis);
    expect(suggestions.some((s) => s.type === 'decline' && s.priority === 'high')).toBe(true);
  });

  it('suggests add-focus-block when no focus blocks and load > 4', () => {
    const analysis = makeAnalysis({ meetingLoadHours: 5, focusBlocks: [] });
    const suggestions = optimizer.suggest(analysis);
    expect(suggestions.some((s) => s.type === 'add-focus-block' && s.priority === 'high')).toBe(true);
  });

  it('suggests reschedule for conflicts', () => {
    const conflict: ConflictInfo = {
      event1Id: '1',
      event2Id: '2',
      event1Subject: 'A',
      event2Subject: 'B',
      overlapStart: '2025-03-15T10:00:00Z',
      overlapEnd: '2025-03-15T10:30:00Z',
      overlapMinutes: 30,
    };
    const analysis = makeAnalysis({ conflicts: [conflict] });
    const suggestions = optimizer.suggest(analysis);
    expect(suggestions.some((s) => s.type === 'reschedule' && s.priority === 'high')).toBe(true);
  });

  it('suggests buffer for back-to-back meetings', () => {
    const events = [
      makeEvent('1', '2025-03-15T09:00:00Z', '2025-03-15T10:00:00Z', 'First'),
      makeEvent('2', '2025-03-15T10:02:00Z', '2025-03-15T11:00:00Z', 'Second'),
    ];
    const analysis = makeAnalysis({ events });
    const suggestions = optimizer.suggest(analysis);
    expect(suggestions.some((s) => s.type === 'add-buffer' && s.priority === 'medium')).toBe(true);
  });

  it('returns empty for light schedule', () => {
    const events = [
      makeEvent('1', '2025-03-15T10:00:00Z', '2025-03-15T10:30:00Z'),
    ];
    const focusBlock: TimeSlot = {
      start: '2025-03-15T10:30:00Z',
      end: '2025-03-15T17:00:00Z',
      durationMinutes: 390,
    };
    const analysis = makeAnalysis({
      events,
      meetingLoadHours: 0.5,
      focusBlocks: [focusBlock],
    });
    const suggestions = optimizer.suggest(analysis);
    expect(suggestions).toHaveLength(0);
  });
});
