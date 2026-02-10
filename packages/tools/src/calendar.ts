import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:calendar');

let calendarIntelligence: any = null;
let calendarConnectors: any = null;

export function setCalendarIntelligence(engine: any): void {
  calendarIntelligence = engine;
  logger.info('Calendar intelligence connected to tools');
}

export function setCalendarConnectors(connectors: any): void {
  calendarConnectors = connectors;
  logger.info('Calendar connectors connected to tools');
}

export const CalendarOptimizeTool: Tool = {
  name: 'calendar_optimize',
  description: 'Analyze a day\'s schedule and suggest optimizations — find focus blocks, detect conflicts, and recommend changes. Call this when the user asks about their schedule, wants to be more productive, or asks "what does my day look like?"',

  parameters: [
    {
      name: 'date',
      type: 'string',
      description: 'Date to analyze in YYYY-MM-DD format (defaults to today)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!calendarIntelligence) {
        return {
          success: true,
          output: JSON.stringify({
            message: 'Calendar intelligence not configured. Connect a Google or Microsoft calendar first.',
            setup: 'Use /connect google-workspace or /connect microsoft-365',
          }),
        };
      }

      const date = params.date || new Date().toISOString().split('T')[0];
      const analysis = await calendarIntelligence.analyzeDay(date);
      const suggestions = await calendarIntelligence.suggest(analysis);

      return {
        success: true,
        output: JSON.stringify({
          date,
          analysis: {
            eventCount: analysis.eventCount,
            meetingLoadHours: analysis.meetingLoadHours,
            freeSlots: analysis.freeSlots,
            conflicts: analysis.conflicts,
            focusBlocks: analysis.focusBlocks,
          },
          suggestions,
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const ScheduleMeetingTool: Tool = {
  name: 'schedule_meeting',
  description: 'Find an available time slot and create a meeting. Call this when the user wants to schedule a meeting with one or more people.',

  parameters: [
    {
      name: 'subject',
      type: 'string',
      description: 'Meeting subject/title',
      required: true,
    },
    {
      name: 'attendees',
      type: 'string',
      description: 'Attendee email addresses, comma-separated',
      required: true,
    },
    {
      name: 'durationMinutes',
      type: 'number',
      description: 'Meeting duration in minutes',
      required: true,
    },
    {
      name: 'preferredDate',
      type: 'string',
      description: 'Preferred date in YYYY-MM-DD format (defaults to today)',
      required: false,
    },
    {
      name: 'isOnlineMeeting',
      type: 'boolean',
      description: 'Whether to create an online meeting (Teams/Meet link)',
      required: false,
      default: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!calendarConnectors) {
        return { success: false, error: 'No calendar accounts connected. Use /connect to add one.' };
      }

      const attendeeList = params.attendees.split(',').map((e: string) => e.trim());
      const preferredDate = params.preferredDate || new Date().toISOString().split('T')[0];

      // Find availability
      const startDateTime = `${preferredDate}T09:00:00`;
      const endDateTime = `${preferredDate}T17:00:00`;

      const availability = await calendarConnectors.execute('calendar-find-availability' as string, {
        attendees: attendeeList,
        startDateTime,
        endDateTime,
        durationMinutes: params.durationMinutes,
      });

      // Create event in first available slot
      const slot = availability?.slots?.[0];
      const start = slot?.start || `${preferredDate}T10:00:00`;
      const endTime = slot?.end || new Date(new Date(start).getTime() + params.durationMinutes * 60000).toISOString();

      const result = await calendarConnectors.execute('calendar-create-event', {
        subject: params.subject,
        start,
        end: endTime,
        attendees: attendeeList,
        isOnlineMeeting: params.isOnlineMeeting ?? true,
      });

      return {
        success: true,
        output: JSON.stringify({
          created: true,
          subject: params.subject,
          start,
          end: endTime,
          attendees: attendeeList,
          ...result,
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const MeetingPrepTool: Tool = {
  name: 'meeting_prep',
  description: 'Generate a preparation brief for an upcoming meeting — attendee profiles, past interactions, agenda, and talking points. Call this before a meeting or when the user asks "what do I need to know for my next meeting?"',

  parameters: [
    {
      name: 'eventId',
      type: 'string',
      description: 'Calendar event ID (if omitted, uses the next upcoming meeting)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!calendarIntelligence) {
        return {
          success: true,
          output: JSON.stringify({
            message: 'Calendar intelligence not configured. Connect a calendar account first.',
          }),
        };
      }

      const brief = await calendarIntelligence.getMeetingBrief(params.eventId);
      return {
        success: true,
        output: JSON.stringify(brief, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
