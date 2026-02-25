import type { TriggerEvent } from '@auxiora/connectors';
import type { NotificationHub, DoNotDisturbManager, NotificationPriority } from '@auxiora/notification-hub';

/** Configuration for the NotificationOrchestrator. */
export interface OrchestratorConfig {
  /** Calendar alert window in ms (default 15 minutes). */
  calendarAlertWindowMs?: number;
}

/** A pending orchestrator notification. */
export interface OrchestratorNotification {
  id: string;
  source: string;
  priority: NotificationPriority;
  message: string;
  createdAt: number;
  delivered: boolean;
}

/** Function that delivers a notification to the user. */
export type DeliveryChannelFn = (notification: OrchestratorNotification) => void;

const URGENCY_KEYWORDS = ['urgent', 'asap', 'important', 'action required', 'deadline'];

const DEFAULT_CALENDAR_ALERT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export class NotificationOrchestrator {
  private hub: NotificationHub;
  private dnd: DoNotDisturbManager;
  private deliveryChannel: DeliveryChannelFn;
  private pending: OrchestratorNotification[] = [];
  private calendarAlertWindowMs: number;

  constructor(
    hub: NotificationHub,
    dnd: DoNotDisturbManager,
    deliveryChannel: DeliveryChannelFn,
    config?: OrchestratorConfig,
  ) {
    this.hub = hub;
    this.dnd = dnd;
    this.deliveryChannel = deliveryChannel;
    this.calendarAlertWindowMs = config?.calendarAlertWindowMs ?? DEFAULT_CALENDAR_ALERT_WINDOW_MS;
  }

  /** Map trigger events to notifications and deliver or queue them. */
  processTriggerEvents(events: TriggerEvent[]): OrchestratorNotification[] {
    const results: OrchestratorNotification[] = [];

    for (const event of events) {
      const { priority, message, source } = this.mapTriggerEvent(event);

      const notification: OrchestratorNotification = {
        id: crypto.randomUUID(),
        source,
        priority,
        message,
        createdAt: Date.now(),
        delivered: false,
      };

      this.hub.send({
        source: source as 'email' | 'calendar' | 'system',
        priority,
        title: event.triggerId,
        body: message,
      });

      this.routeNotification(notification);
      results.push(notification);
    }

    return results;
  }

  /** Check calendar events and create notifications for those starting soon. */
  processCalendarCheck(
    events: Array<{ title: string; startTime: number }>,
    now?: number,
  ): OrchestratorNotification[] {
    const currentTime = now ?? Date.now();
    const results: OrchestratorNotification[] = [];

    for (const event of events) {
      const timeUntilStart = event.startTime - currentTime;
      if (timeUntilStart > 0 && timeUntilStart <= this.calendarAlertWindowMs) {
        const minutesUntil = Math.round(timeUntilStart / 60_000);
        const message = `"${event.title}" starts in ${minutesUntil} minute${minutesUntil === 1 ? '' : 's'}`;

        const notification: OrchestratorNotification = {
          id: crypto.randomUUID(),
          source: 'calendar',
          priority: 'important',
          message,
          createdAt: currentTime,
          delivered: false,
        };

        this.hub.send({
          source: 'calendar',
          priority: 'important',
          title: event.title,
          body: message,
        });

        this.routeNotification(notification);
        results.push(notification);
      }
    }

    return results;
  }

  /** Get all pending (undelivered or queued) notifications. */
  getPending(): OrchestratorNotification[] {
    return this.pending.filter((n) => !n.delivered);
  }

  /** Dismiss a pending notification by ID. Returns true if found and removed. */
  dismiss(id: string): boolean {
    const index = this.pending.findIndex((n) => n.id === id);
    if (index === -1) return false;
    this.pending.splice(index, 1);
    return true;
  }

  private mapTriggerEvent(event: TriggerEvent): {
    priority: NotificationPriority;
    message: string;
    source: string;
  } {
    switch (event.triggerId) {
      case 'new-email': {
        const subject = String(event.data['subject'] ?? '');
        const from = String(event.data['from'] ?? 'unknown sender');
        const isUrgent = URGENCY_KEYWORDS.some((kw) =>
          subject.toLowerCase().includes(kw),
        );
        return {
          priority: isUrgent ? 'urgent' : 'important',
          message: `New email from ${from}: ${subject}`,
          source: 'email',
        };
      }

      case 'event-starting-soon': {
        const title = String(event.data['title'] ?? 'Untitled event');
        return {
          priority: 'important',
          message: `Event starting soon: ${title}`,
          source: 'calendar',
        };
      }

      case 'file-shared': {
        const fileName = String(event.data['fileName'] ?? 'a file');
        const sharedBy = String(event.data['sharedBy'] ?? 'someone');
        return {
          priority: 'low',
          message: `${sharedBy} shared ${fileName} with you`,
          source: 'system',
        };
      }

      default:
        return {
          priority: 'low',
          message: `Notification from ${event.connectorId}: ${event.triggerId}`,
          source: 'system',
        };
    }
  }

  private routeNotification(notification: OrchestratorNotification): void {
    const dndActive = this.dnd.isActive();

    if (dndActive && notification.priority !== 'urgent') {
      // Queue silently — do not deliver
      notification.delivered = false;
      this.pending.push(notification);
      return;
    }

    // Deliver immediately
    notification.delivered = true;
    this.deliveryChannel(notification);
  }
}
