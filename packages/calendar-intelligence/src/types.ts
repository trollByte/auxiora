export interface CalendarEvent {
  id: string;
  subject: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  attendees: Attendee[];
  location?: string;
  isOnlineMeeting: boolean;
  organizer?: string;
  body?: string;
  isAllDay?: boolean;
}

export interface Attendee {
  email: string;
  name?: string;
  responseStatus: 'accepted' | 'tentative' | 'declined' | 'none';
}

export interface TimeSlot {
  start: string; // ISO 8601
  end: string; // ISO 8601
  durationMinutes: number;
}

export interface ConflictInfo {
  event1Id: string;
  event2Id: string;
  event1Subject: string;
  event2Subject: string;
  overlapStart: string;
  overlapEnd: string;
  overlapMinutes: number;
}

export interface ScheduleAnalysis {
  date: string;
  events: CalendarEvent[];
  freeSlots: TimeSlot[];
  conflicts: ConflictInfo[];
  focusBlocks: TimeSlot[];
  meetingLoadHours: number;
  eventCount: number;
}

export interface OptimizationSuggestion {
  type: 'add-focus-block' | 'reschedule' | 'decline' | 'shorten' | 'add-buffer';
  description: string;
  eventId?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MeetingBrief {
  eventId: string;
  subject: string;
  startTime: string;
  attendees: AttendeeContext[];
  agenda?: string;
  suggestedTopics: string[];
}

export interface AttendeeContext {
  email: string;
  name?: string;
  lastInteraction?: string;
  relationship?: string;
  notes?: string;
}

export interface AnalyzerConfig {
  workdayStartHour?: number; // default 9
  workdayEndHour?: number; // default 17
  focusBlockMinMinutes?: number; // default 60
  bufferBetweenMeetingsMinutes?: number; // default 5
}
