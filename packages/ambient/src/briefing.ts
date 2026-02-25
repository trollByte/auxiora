import type { AmbientPattern, Anticipation, BriefingConfig, QuietNotification } from './types.js';
import { DEFAULT_BRIEFING_CONFIG } from './types.js';

/** A compiled briefing for the user. */
export interface Briefing {
  userId: string;
  generatedAt: number;
  timeOfDay: 'morning' | 'evening' | 'custom';
  sections: BriefingSection[];
}

/** A section of a briefing. */
export interface BriefingSection {
  title: string;
  items: string[];
}

/** Data sources for briefing generation. */
export interface BriefingDataSources {
  patterns?: AmbientPattern[];
  anticipations?: Anticipation[];
  notifications?: QuietNotification[];
  calendarEvents?: Array<{ title: string; time: string }>;
  tasks?: Array<{ title: string; status: string }>;
}

/**
 * Generates personalized briefings/digests for users.
 */
export class BriefingGenerator {
  private config: BriefingConfig;

  constructor(config?: Partial<BriefingConfig>) {
    this.config = { ...DEFAULT_BRIEFING_CONFIG, ...config };
  }

  /** Generate a briefing for the given user at the given time. */
  generateBriefing(
    userId: string,
    time: 'morning' | 'evening' | 'custom',
    sources: BriefingDataSources
  ): Briefing {
    const sections: BriefingSection[] = [];

    // Notifications section
    if (sources.notifications && sources.notifications.length > 0) {
      const pending = sources.notifications.filter(n => !n.dismissed);
      if (pending.length > 0) {
        sections.push({
          title: 'Notifications',
          items: pending.slice(0, this.config.maxItemsPerSection).map(
            n => `[${n.priority}] ${n.message}`
          ),
        });
      }
    }

    // Calendar section
    if (this.config.categories.includes('calendar') && sources.calendarEvents) {
      const events = sources.calendarEvents.slice(0, this.config.maxItemsPerSection);
      if (events.length > 0) {
        sections.push({
          title: time === 'morning' ? 'Today\'s Schedule' : 'Tomorrow\'s Schedule',
          items: events.map(e => `${e.time} - ${e.title}`),
        });
      }
    }

    // Tasks section
    if (this.config.categories.includes('tasks') && sources.tasks) {
      const activeTasks = sources.tasks
        .filter(t => t.status !== 'completed')
        .slice(0, this.config.maxItemsPerSection);
      if (activeTasks.length > 0) {
        sections.push({
          title: 'Active Tasks',
          items: activeTasks.map(t => `${t.title} (${t.status})`),
        });
      }
    }

    // Patterns section
    if (this.config.categories.includes('patterns') && sources.patterns) {
      const topPatterns = sources.patterns
        .filter(p => p.confidence >= 0.5)
        .slice(0, this.config.maxItemsPerSection);
      if (topPatterns.length > 0) {
        sections.push({
          title: 'Observed Patterns',
          items: topPatterns.map(p => `${p.description} (${Math.round(p.confidence * 100)}% confidence)`),
        });
      }
    }

    // Anticipations section
    if (sources.anticipations && sources.anticipations.length > 0) {
      const upcoming = sources.anticipations
        .filter(a => a.expectedAt > Date.now())
        .slice(0, this.config.maxItemsPerSection);
      if (upcoming.length > 0) {
        sections.push({
          title: 'Upcoming',
          items: upcoming.map(a => {
            const timeStr = new Date(a.expectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `~${timeStr}: ${a.description}`;
          }),
        });
      }
    }

    return {
      userId,
      generatedAt: Date.now(),
      timeOfDay: time,
      sections,
    };
  }

  /** Check if it's time for a briefing. */
  isBriefingTime(time: 'morning' | 'evening'): boolean {
    if (!this.config.enabled) return false;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const target = time === 'morning' ? this.config.morningTime : this.config.eveningTime;
    return currentTime === target;
  }

  /** Get config. */
  getConfig(): BriefingConfig {
    return { ...this.config };
  }
}

/** Format a briefing as human-readable text. */
export function formatBriefingAsText(briefing: Briefing): string {
  const greeting = briefing.timeOfDay === 'morning'
    ? 'Good morning! Here\'s your day:'
    : briefing.timeOfDay === 'evening'
      ? 'Here\'s your evening summary:'
      : 'Here\'s your briefing:';

  if (briefing.sections.length === 0) {
    return `${greeting}\n\nNo updates right now.`;
  }

  const sections = briefing.sections.map(s => {
    const items = s.items.map(item => `  ${item}`).join('\n');
    return `${s.title}\n${items}`;
  }).join('\n\n');

  return `${greeting}\n\n${sections}`;
}
