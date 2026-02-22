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
  /** IANA timezone for cron schedules (e.g. 'America/New_York'). Defaults to system timezone. */
  timezone?: string;
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

/** Adapter interface for a consciousness monitor (e.g. SelfMonitor). */
export interface BriefingMonitorLike {
  getPulse(): {
    overall: string;
    anomalies: Array<{ subsystem: string; description: string; severity: string }>;
  };
}

/** Adapter interface for a decision log (e.g. DecisionLog from The Architect). */
export interface BriefingDecisionLogLike {
  query(filter: { status: string }): Array<{ summary: string; domain: string; status: string }>;
  getDueFollowUps(): Array<{ summary: string; followUpDate: number }>;
}

/** Adapter interface for a feedback store (e.g. FeedbackStore from The Architect). */
export interface BriefingFeedbackStoreLike {
  getInsights(): { trend: string; weakDomains: string[]; totalFeedback: number };
}

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

  // Consciousness / Architect data sources for enriched briefings
  consciousnessMonitor?: BriefingMonitorLike;
  decisionLog?: BriefingDecisionLogLike;
  feedbackStore?: BriefingFeedbackStoreLike;
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
  private readonly consciousnessMonitor: BriefingMonitorLike | undefined;
  private readonly decisionLog: BriefingDecisionLogLike | undefined;
  private readonly feedbackStore: BriefingFeedbackStoreLike | undefined;
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
    this.consciousnessMonitor = deps.consciousnessMonitor;
    this.decisionLog = deps.decisionLog;
    this.feedbackStore = deps.feedbackStore;
  }

  /** Start all scheduled cron jobs. */
  start(): void {
    if (!this.config.enabled || this.running) return;

    const tz = this.config.timezone;

    this.scheduler.schedule(JOB_IDS.emailPoll, this.config.emailPollCron, () => {
      void this.triggerManager.pollAll();
    }, tz);

    this.scheduler.schedule(JOB_IDS.calendarPoll, this.config.calendarPollCron, () => {
      void this.pollCalendar();
    }, tz);

    this.scheduler.schedule(JOB_IDS.morningBriefing, this.config.morningCron, () => {
      void this.generateAndDeliverBriefing('morning');
    }, tz);

    this.scheduler.schedule(JOB_IDS.eveningSummary, this.config.eveningCron, () => {
      void this.generateAndDeliverBriefing('evening');
    }, tz);

    this.scheduler.schedule(JOB_IDS.notificationPoll, this.config.notificationPollCron, () => {
      void this.pollAndNotify();
    }, tz);

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

    const tasks = this.fetchDecisionTasks();
    const { notifications: healthNotifications, patterns } = this.fetchConsciousnessData();

    const briefing = this.briefingGenerator.generateBriefing(
      this.userId,
      time,
      {
        calendarEvents,
        notifications: [...emailNotifications, ...healthNotifications],
        tasks,
        patterns,
      },
    );

    // Don't send empty briefings — "No updates right now" is noise
    if (briefing.sections.length === 0) return;

    const formatted = formatBriefingAsText(briefing);
    await this.deliveryChannel(formatted);
  }

  private fetchDecisionTasks(): Array<{ title: string; status: string }> {
    if (!this.decisionLog) return [];
    try {
      const active = this.decisionLog.query({ status: 'active' });
      const dueFollowUps = this.decisionLog.getDueFollowUps();
      const tasks: Array<{ title: string; status: string }> = active.map(d => ({
        title: d.summary,
        status: 'active',
      }));
      for (const fu of dueFollowUps) {
        tasks.push({ title: `Follow up: ${fu.summary}`, status: 'due' });
      }
      return tasks;
    } catch {
      return [];
    }
  }

  private fetchConsciousnessData(): {
    notifications: QuietNotification[];
    patterns: Array<{ id: string; type: 'preference'; description: string; confidence: number; evidence: string[]; detectedAt: number; lastConfirmedAt: number; occurrences: number }>;
  } {
    const notifications: QuietNotification[] = [];
    const patterns: Array<{ id: string; type: 'preference'; description: string; confidence: number; evidence: string[]; detectedAt: number; lastConfirmedAt: number; occurrences: number }> = [];

    if (this.consciousnessMonitor) {
      try {
        const pulse = this.consciousnessMonitor.getPulse();
        if (pulse.overall !== 'healthy') {
          notifications.push({
            id: 'health-status',
            priority: pulse.overall === 'critical' ? 'alert' : 'nudge',
            message: `System health is ${pulse.overall}`,
            createdAt: Date.now(),
            dismissed: false,
            source: 'consciousness',
          });
        }
        for (const anomaly of pulse.anomalies) {
          notifications.push({
            id: `anomaly-${anomaly.subsystem}`,
            priority: anomaly.severity === 'high' ? 'alert' : 'nudge',
            message: `${anomaly.subsystem}: ${anomaly.description}`,
            createdAt: Date.now(),
            dismissed: false,
            source: 'consciousness',
          });
        }
      } catch {
        // Consciousness monitor errors are silently ignored
      }
    }

    if (this.feedbackStore) {
      try {
        const insights = this.feedbackStore.getInsights();
        if (insights.totalFeedback > 0) {
          const now = Date.now();
          patterns.push({
            id: 'satisfaction-trend',
            type: 'preference',
            description: `User satisfaction is ${insights.trend} (${insights.totalFeedback} responses)`,
            confidence: 0.8,
            evidence: insights.weakDomains.length > 0
              ? [`Weak areas: ${insights.weakDomains.join(', ')}`]
              : [],
            detectedAt: now,
            lastConfirmedAt: now,
            occurrences: insights.totalFeedback,
          });
        }
      } catch {
        // Feedback store errors are silently ignored
      }
    }

    return { notifications, patterns };
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
