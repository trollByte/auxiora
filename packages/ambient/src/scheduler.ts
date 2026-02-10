import type { Scheduler } from '@auxiora/behaviors';
import type { ConnectorRegistry, TriggerManager } from '@auxiora/connectors';
import type { BriefingGenerator } from './briefing.js';
import type { NotificationOrchestrator } from './orchestrator.js';
import type { QuietNotification } from './types.js';
import { formatBriefingAsText } from './briefing.js';

/** Configuration for the ambient scheduler. */
export interface AmbientSchedulerConfig {
  /** Cron expression for morning briefing. */
  morningCron: string;
  /** Cron expression for evening summary. */
  eveningCron: string;
  /** Cron expression for email polling. */
  emailPollCron: string;
  /** Cron expression for calendar polling. */
  calendarPollCron: string;
  /** Cron expression for notification polling. */
  notificationPollCron: string;
  /** Calendar alert window in minutes. */
  calendarAlertMinutes: number;
  /** Whether the scheduler is enabled. */
  enabled: boolean;
  /** Categories to include in briefings. */
  categories: string[];
}

export const DEFAULT_AMBIENT_SCHEDULER_CONFIG: AmbientSchedulerConfig = {
  morningCron: '0 7 * * *',
  eveningCron: '0 18 * * *',
  emailPollCron: '*/2 * * * *',
  calendarPollCron: '*/5 * * * *',
  notificationPollCron: '*/1 * * * *',
  calendarAlertMinutes: 15,
  enabled: true,
  categories: ['calendar', 'email', 'tasks'],
};

/** Dependencies for the ambient scheduler. */
export interface AmbientSchedulerDeps {
  scheduler: Scheduler;
  connectorRegistry: ConnectorRegistry;
  triggerManager: TriggerManager;
  briefingGenerator: BriefingGenerator;
  emailIntelligence?: { triage?: { getTriageSummary(opts: { maxResults: number }): Promise<{ items: Array<{ subject: string; priority: string }> }> } };
  calendarIntelligence?: { analyzeDay(date: string): Promise<{ events: Array<{ title: string; time: string }> }> };
  notificationOrchestrator?: NotificationOrchestrator;
  deliveryChannel: (message: string) => Promise<void>;
  userId: string;
  config?: Partial<AmbientSchedulerConfig>;
}

const JOB_IDS = {
  emailPoll: 'ambient:email-poll',
  calendarPoll: 'ambient:calendar-poll',
  morningBriefing: 'ambient:morning-briefing',
  eveningSummary: 'ambient:evening-summary',
  notificationPoll: 'ambient:notification-poll',
} as const;

/**
 * Schedules ambient polling and briefing generation using cron jobs.
 */
export class AmbientScheduler {
  private readonly scheduler: Scheduler;
  private readonly connectorRegistry: ConnectorRegistry;
  private readonly triggerManager: TriggerManager;
  private readonly briefingGenerator: BriefingGenerator;
  private readonly emailIntelligence: AmbientSchedulerDeps['emailIntelligence'];
  private readonly calendarIntelligence: AmbientSchedulerDeps['calendarIntelligence'];
  private readonly notificationOrchestrator: NotificationOrchestrator | undefined;
  private readonly deliveryChannel: (message: string) => Promise<void>;
  private readonly userId: string;
  private readonly config: AmbientSchedulerConfig;
  private running = false;

  constructor(deps: AmbientSchedulerDeps) {
    this.scheduler = deps.scheduler;
    this.connectorRegistry = deps.connectorRegistry;
    this.triggerManager = deps.triggerManager;
    this.briefingGenerator = deps.briefingGenerator;
    this.emailIntelligence = deps.emailIntelligence;
    this.calendarIntelligence = deps.calendarIntelligence;
    this.notificationOrchestrator = deps.notificationOrchestrator;
    this.deliveryChannel = deps.deliveryChannel;
    this.userId = deps.userId;
    this.config = { ...DEFAULT_AMBIENT_SCHEDULER_CONFIG, ...deps.config };
  }

  /** Start all scheduled cron jobs. */
  start(): void {
    if (!this.config.enabled || this.running) return;

    this.scheduler.schedule(JOB_IDS.emailPoll, this.config.emailPollCron, () => {
      void this.triggerManager.pollAll();
    });

    this.scheduler.schedule(JOB_IDS.calendarPoll, this.config.calendarPollCron, () => {
      void this.pollCalendar();
    });

    this.scheduler.schedule(JOB_IDS.morningBriefing, this.config.morningCron, () => {
      void this.generateAndDeliverBriefing('morning');
    });

    this.scheduler.schedule(JOB_IDS.eveningSummary, this.config.eveningCron, () => {
      void this.generateAndDeliverBriefing('evening');
    });

    this.scheduler.schedule(JOB_IDS.notificationPoll, this.config.notificationPollCron, () => {
      void this.pollAndNotify();
    });

    this.running = true;
  }

  /** Stop all scheduled cron jobs. */
  stop(): void {
    this.scheduler.stop(JOB_IDS.emailPoll);
    this.scheduler.stop(JOB_IDS.calendarPoll);
    this.scheduler.stop(JOB_IDS.morningBriefing);
    this.scheduler.stop(JOB_IDS.eveningSummary);
    this.scheduler.stop(JOB_IDS.notificationPoll);
    this.running = false;
  }

  /** Whether the scheduler is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the current configuration. */
  getConfig(): AmbientSchedulerConfig {
    return { ...this.config };
  }

  /** Generate and deliver a briefing for the specified time of day. */
  async generateAndDeliverBriefing(time: 'morning' | 'evening'): Promise<void> {
    const calendarEvents = await this.fetchCalendarEvents(time);
    const emailNotifications = await this.fetchEmailSummary();

    const briefing = this.briefingGenerator.generateBriefing(
      this.userId,
      time,
      {
        calendarEvents,
        notifications: emailNotifications,
      },
    );

    const formatted = formatBriefingAsText(briefing);
    await this.deliveryChannel(formatted);
  }

  private async pollAndNotify(): Promise<void> {
    if (!this.notificationOrchestrator) return;

    const events = await this.triggerManager.pollAll();
    if (events.length > 0) {
      this.notificationOrchestrator.processTriggerEvents(events);
    }

    // Check for upcoming calendar events
    if (this.calendarIntelligence) {
      try {
        const today = new Date().toISOString().split('T')[0]!;
        const result = await this.calendarIntelligence.analyzeDay(today);
        const now = Date.now();
        const alertWindowMs = this.config.calendarAlertMinutes * 60_000;

        const upcomingEvents = (result.events ?? [])
          .map((e) => ({
            title: e.title,
            startTime: this.parseTimeToTimestamp(e.time),
          }))
          .filter((e) => {
            const timeUntil = e.startTime - now;
            return timeUntil > 0 && timeUntil <= alertWindowMs;
          });

        if (upcomingEvents.length > 0) {
          this.notificationOrchestrator.processCalendarCheck(upcomingEvents, now);
        }
      } catch {
        // Calendar fetch errors are silently ignored
      }
    }
  }

  private parseTimeToTimestamp(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return d.getTime();
  }

  private async pollCalendar(): Promise<void> {
    if (!this.calendarIntelligence) return;

    const today = new Date().toISOString().split('T')[0]!;
    await this.calendarIntelligence.analyzeDay(today);
  }

  private async fetchCalendarEvents(
    time: 'morning' | 'evening',
  ): Promise<Array<{ title: string; time: string }>> {
    if (!this.calendarIntelligence) return [];

    const targetDate = time === 'evening'
      ? new Date(Date.now() + 86_400_000).toISOString().split('T')[0]!
      : new Date().toISOString().split('T')[0]!;

    try {
      const result = await this.calendarIntelligence.analyzeDay(targetDate);
      return result.events ?? [];
    } catch {
      return [];
    }
  }

  private async fetchEmailSummary(): Promise<QuietNotification[]> {
    if (!this.emailIntelligence?.triage) return [];

    try {
      const result = await this.emailIntelligence.triage.getTriageSummary({ maxResults: 10 });
      return (result.items ?? []).map((item, i) => ({
        id: `email-${i}`,
        priority: item.priority === 'urgent' ? 'alert' as const : 'nudge' as const,
        message: item.subject,
        createdAt: Date.now(),
        dismissed: false,
        source: 'email',
      }));
    } catch {
      return [];
    }
  }
}
