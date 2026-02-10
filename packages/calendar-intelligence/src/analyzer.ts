import type { AnalyzerConfig, CalendarEvent, ConflictInfo, ScheduleAnalysis, TimeSlot } from './types.js';

const DEFAULT_CONFIG: Required<AnalyzerConfig> = {
  workdayStartHour: 9,
  workdayEndHour: 17,
  focusBlockMinMinutes: 60,
  bufferBetweenMeetingsMinutes: 5,
};

export class ScheduleAnalyzer {
  private config: Required<AnalyzerConfig>;

  constructor(config?: AnalyzerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyzeDay(events: CalendarEvent[], date: string): ScheduleAnalysis {
    const dayEvents = events
      .filter((e) => e.start.substring(0, 10) === date)
      .sort((a, b) => a.start.localeCompare(b.start));

    // Detect timezone suffix from events to keep workday bounds consistent
    const tzSuffix = dayEvents.length > 0 && dayEvents[0].start.endsWith('Z') ? 'Z' : '';
    const workdayStart = `${date}T${String(this.config.workdayStartHour).padStart(2, '0')}:00:00${tzSuffix}`;
    const workdayEnd = `${date}T${String(this.config.workdayEndHour).padStart(2, '0')}:00:00${tzSuffix}`;

    const freeSlots = this.findFreeSlots(dayEvents, workdayStart, workdayEnd);
    const conflicts = this.detectConflicts(dayEvents);
    const focusBlocks = freeSlots.filter((s) => s.durationMinutes >= this.config.focusBlockMinMinutes);

    const meetingLoadHours = dayEvents.reduce((sum, e) => {
      const durationMs = new Date(e.end).getTime() - new Date(e.start).getTime();
      return sum + durationMs / (1000 * 60 * 60);
    }, 0);

    return {
      date,
      events: dayEvents,
      freeSlots,
      conflicts,
      focusBlocks,
      meetingLoadHours,
      eventCount: dayEvents.length,
    };
  }

  findFreeSlots(
    events: CalendarEvent[],
    rangeStart: string,
    rangeEnd: string,
    minDurationMinutes?: number,
  ): TimeSlot[] {
    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
    const slots: TimeSlot[] = [];
    let cursor = new Date(rangeStart).getTime();
    const end = new Date(rangeEnd).getTime();

    for (const event of sorted) {
      const eventStart = new Date(event.start).getTime();
      const eventEnd = new Date(event.end).getTime();

      // Skip events entirely outside the range
      if (eventEnd <= new Date(rangeStart).getTime() || eventStart >= end) {
        continue;
      }

      if (eventStart > cursor) {
        const gapEnd = Math.min(eventStart, end);
        const durationMinutes = (gapEnd - cursor) / (1000 * 60);
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(gapEnd).toISOString(),
          durationMinutes,
        });
      }

      cursor = Math.max(cursor, eventEnd);
    }

    // Gap after last event
    if (cursor < end) {
      const durationMinutes = (end - cursor) / (1000 * 60);
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(end).toISOString(),
        durationMinutes,
      });
    }

    if (minDurationMinutes !== undefined) {
      return slots.filter((s) => s.durationMinutes >= minDurationMinutes);
    }

    return slots;
  }

  detectConflicts(events: CalendarEvent[]): ConflictInfo[] {
    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
    const conflicts: ConflictInfo[] = [];

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const e1 = sorted[i];
        const e2 = sorted[j];

        const start1 = new Date(e1.start).getTime();
        const end1 = new Date(e1.end).getTime();
        const start2 = new Date(e2.start).getTime();
        const end2 = new Date(e2.end).getTime();

        if (start1 < end2 && start2 < end1) {
          const overlapStart = Math.max(start1, start2);
          const overlapEnd = Math.min(end1, end2);
          conflicts.push({
            event1Id: e1.id,
            event2Id: e2.id,
            event1Subject: e1.subject,
            event2Subject: e2.subject,
            overlapStart: new Date(overlapStart).toISOString(),
            overlapEnd: new Date(overlapEnd).toISOString(),
            overlapMinutes: (overlapEnd - overlapStart) / (1000 * 60),
          });
        }
      }
    }

    return conflicts;
  }
}
