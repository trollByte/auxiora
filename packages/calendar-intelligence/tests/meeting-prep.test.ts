import { describe, expect, it } from 'vitest';
import { MeetingPrepGenerator } from '../src/meeting-prep.js';
import type { AttendeeContext, CalendarEvent } from '../src/types.js';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    subject: 'Project Review',
    start: '2025-03-15T10:00:00Z',
    end: '2025-03-15T11:00:00Z',
    attendees: [
      { email: 'alice@example.com', name: 'Alice', responseStatus: 'accepted' },
      { email: 'bob@example.com', name: 'Bob', responseStatus: 'tentative' },
    ],
    isOnlineMeeting: true,
    ...overrides,
  };
}

describe('MeetingPrepGenerator', () => {
  const generator = new MeetingPrepGenerator();

  describe('generateBrief', () => {
    it('extracts attendees', () => {
      const event = makeEvent();
      const brief = generator.generateBrief(event);
      expect(brief.attendees).toHaveLength(2);
      expect(brief.attendees[0].email).toBe('alice@example.com');
      expect(brief.attendees[1].email).toBe('bob@example.com');
    });

    it('extracts agenda from body', () => {
      const event = makeEvent({
        body: 'Hello team,\n\nAgenda:\n- Review Q1 results\n- Discuss roadmap\n- Action items\n\nThanks',
      });
      const brief = generator.generateBrief(event);
      expect(brief.agenda).toBeDefined();
      expect(brief.agenda).toContain('Review Q1 results');
      expect(brief.agenda).toContain('Discuss roadmap');
      expect(brief.agenda).toContain('Action items');
    });

    it('generates suggested topics from subject', () => {
      const event = makeEvent({ subject: 'Q1 Budget Planning Review' });
      const brief = generator.generateBrief(event);
      expect(brief.suggestedTopics.length).toBeGreaterThan(0);
      expect(brief.suggestedTopics.some((t) => t.toLowerCase().includes('budget'))).toBe(true);
    });

    it('merges attendee context when provided', () => {
      const event = makeEvent();
      const contexts: AttendeeContext[] = [
        { email: 'alice@example.com', relationship: 'manager', notes: 'Decision maker' },
      ];
      const brief = generator.generateBrief(event, contexts);
      const alice = brief.attendees.find((a) => a.email === 'alice@example.com');
      expect(alice?.relationship).toBe('manager');
      expect(alice?.notes).toBe('Decision maker');
    });
  });

  describe('getUpcoming', () => {
    it('returns events within window', () => {
      const now = new Date('2025-03-15T09:00:00Z');
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:15:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T09:45:00Z', end: '2025-03-15T10:30:00Z' }),
        makeEvent({ id: '3', start: '2025-03-15T12:00:00Z', end: '2025-03-15T13:00:00Z' }),
      ];

      const upcoming = generator.getUpcoming(events, 60, now);
      expect(upcoming).toHaveLength(2);
      expect(upcoming.map((e) => e.id)).toEqual(['1', '2']);
    });

    it('excludes past events', () => {
      const now = new Date('2025-03-15T10:30:00Z');
      const events = [
        makeEvent({ id: '1', start: '2025-03-15T09:00:00Z', end: '2025-03-15T10:00:00Z' }),
        makeEvent({ id: '2', start: '2025-03-15T10:00:00Z', end: '2025-03-15T11:00:00Z' }),
        makeEvent({ id: '3', start: '2025-03-15T11:00:00Z', end: '2025-03-15T12:00:00Z' }),
      ];

      const upcoming = generator.getUpcoming(events, 60, now);
      // Event 1 started in the past, Event 2 already started, only Event 3 is upcoming
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].id).toBe('3');
    });
  });
});
