import { describe, it, expect } from 'vitest';
import {
  CalendarOptimizeTool,
  ScheduleMeetingTool,
  MeetingPrepTool,
  ToolPermission,
} from '../src/index.js';

describe('CalendarOptimizeTool', () => {
  it('should have correct name and description', () => {
    expect(CalendarOptimizeTool.name).toBe('calendar_optimize');
    expect(CalendarOptimizeTool.description).toContain('schedule');
  });

  it('should have optional date parameter', () => {
    const date = CalendarOptimizeTool.parameters.find(p => p.name === 'date');
    expect(date?.required).toBe(false);
  });

  it('should auto-approve (read-only analysis)', () => {
    expect(CalendarOptimizeTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should handle missing intelligence gracefully', async () => {
    const result = await CalendarOptimizeTool.execute({}, {} as any);
    expect(result.success).toBe(true);
    expect(result.output).toContain('not configured');
  });
});

describe('ScheduleMeetingTool', () => {
  it('should have correct name', () => {
    expect(ScheduleMeetingTool.name).toBe('schedule_meeting');
  });

  it('should require subject, attendees, and durationMinutes', () => {
    const required = ScheduleMeetingTool.parameters.filter(p => p.required).map(p => p.name);
    expect(required).toContain('subject');
    expect(required).toContain('attendees');
    expect(required).toContain('durationMinutes');
  });

  it('should always require user approval (creates event)', () => {
    expect(ScheduleMeetingTool.getPermission({}, {} as any)).toBe(ToolPermission.USER_APPROVAL);
  });

  it('should handle missing connectors', async () => {
    const result = await ScheduleMeetingTool.execute({
      subject: 'Test',
      attendees: 'test@example.com',
      durationMinutes: 30,
    }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No calendar accounts');
  });
});

describe('MeetingPrepTool', () => {
  it('should have correct name', () => {
    expect(MeetingPrepTool.name).toBe('meeting_prep');
  });

  it('should have optional eventId parameter', () => {
    const eventId = MeetingPrepTool.parameters.find(p => p.name === 'eventId');
    expect(eventId?.required).toBe(false);
  });

  it('should auto-approve (read-only)', () => {
    expect(MeetingPrepTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should handle missing intelligence gracefully', async () => {
    const result = await MeetingPrepTool.execute({}, {} as any);
    expect(result.success).toBe(true);
    expect(result.output).toContain('not configured');
  });
});
