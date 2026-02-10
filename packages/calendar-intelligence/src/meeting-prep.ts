import type { AttendeeContext, CalendarEvent, MeetingBrief } from './types.js';

export class MeetingPrepGenerator {
  generateBrief(event: CalendarEvent, attendeeContexts?: AttendeeContext[]): MeetingBrief {
    const agenda = this.extractAgenda(event.body);
    const attendees = this.buildAttendeeList(event, attendeeContexts);
    const suggestedTopics = this.generateTopics(event.subject);

    return {
      eventId: event.id,
      subject: event.subject,
      startTime: event.start,
      attendees,
      agenda: agenda || undefined,
      suggestedTopics,
    };
  }

  getUpcoming(events: CalendarEvent[], withinMinutes: number, now?: Date): CalendarEvent[] {
    const currentTime = (now ?? new Date()).getTime();
    const windowEnd = currentTime + withinMinutes * 60 * 1000;

    return events.filter((event) => {
      const eventStart = new Date(event.start).getTime();
      return eventStart > currentTime && eventStart <= windowEnd;
    });
  }

  private extractAgenda(body?: string): string | null {
    if (!body) return null;

    const lines = body.split('\n');
    const agendaItems: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
        agendaItems.push(trimmed);
      }
    }

    return agendaItems.length > 0 ? agendaItems.join('\n') : null;
  }

  private buildAttendeeList(
    event: CalendarEvent,
    contexts?: AttendeeContext[],
  ): AttendeeContext[] {
    const contextMap = new Map<string, AttendeeContext>();
    if (contexts) {
      for (const ctx of contexts) {
        contextMap.set(ctx.email, ctx);
      }
    }

    return event.attendees.map((attendee) => {
      const ctx = contextMap.get(attendee.email);
      return {
        email: attendee.email,
        name: attendee.name ?? ctx?.name,
        lastInteraction: ctx?.lastInteraction,
        relationship: ctx?.relationship,
        notes: ctx?.notes,
      };
    });
  }

  private generateTopics(subject: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'shall', 'can', 'meeting', 'call',
      'sync', 'chat', 'discussion', 're', 'fwd', 'fw',
    ]);

    const words = subject
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const unique = [...new Set(words)];
    return unique.map((w) => `Discuss ${w}`);
  }
}
