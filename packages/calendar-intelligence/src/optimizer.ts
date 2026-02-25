import type { AnalyzerConfig, OptimizationSuggestion, ScheduleAnalysis } from './types.js';

const DEFAULT_BUFFER_MINUTES = 5;

export class ScheduleOptimizer {
  private bufferMinutes: number;

  constructor(config?: AnalyzerConfig) {
    this.bufferMinutes = config?.bufferBetweenMeetingsMinutes ?? DEFAULT_BUFFER_MINUTES;
  }

  suggest(analysis: ScheduleAnalysis): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    if (analysis.meetingLoadHours > 6) {
      suggestions.push({
        type: 'decline',
        description: 'Meeting load exceeds 6 hours. Consider declining optional meetings to protect your time.',
        priority: 'high',
      });
    }

    if (analysis.meetingLoadHours > 4 && analysis.focusBlocks.length === 0) {
      suggestions.push({
        type: 'add-focus-block',
        description: 'Over 4 hours of meetings with no focus blocks. Block time for deep work.',
        priority: 'high',
      });
    }

    for (const conflict of analysis.conflicts) {
      suggestions.push({
        type: 'reschedule',
        description: `Conflict: "${conflict.event1Subject}" overlaps with "${conflict.event2Subject}" by ${conflict.overlapMinutes} minutes.`,
        eventId: conflict.event2Id,
        priority: 'high',
      });
    }

    // Back-to-back detection
    const sorted = [...analysis.events].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = new Date(sorted[i].end).getTime();
      const nextStart = new Date(sorted[i + 1].start).getTime();
      const gapMinutes = (nextStart - currentEnd) / (1000 * 60);
      if (gapMinutes >= 0 && gapMinutes < this.bufferMinutes) {
        suggestions.push({
          type: 'add-buffer',
          description: `Only ${gapMinutes} minutes between "${sorted[i].subject}" and "${sorted[i + 1].subject}". Add a buffer.`,
          eventId: sorted[i + 1].id,
          priority: 'medium',
        });
      }
    }

    for (const event of analysis.events) {
      const durationMs = new Date(event.end).getTime() - new Date(event.start).getTime();
      const durationMinutes = durationMs / (1000 * 60);
      if (durationMinutes > 60) {
        suggestions.push({
          type: 'shorten',
          description: `"${event.subject}" is ${durationMinutes} minutes. Consider shortening to 45-60 minutes.`,
          eventId: event.id,
          priority: 'low',
        });
      }
    }

    return suggestions;
  }
}
