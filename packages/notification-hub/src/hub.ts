import { nanoid } from 'nanoid';
import type {
  Notification,
  NotificationInput,
  NotificationConfig,
  NotificationPriority,
  NotificationSource,
  DeliveryChannel,
} from './types.js';

export class NotificationHub {
  private notifications: Notification[] = [];
  private batch: Notification[] = [];
  private config: NotificationConfig;

  constructor(config: NotificationConfig = {}) {
    this.config = config;
  }

  send(input: NotificationInput): Notification {
    const notification: Notification = {
      id: nanoid(),
      source: input.source,
      priority: input.priority ?? this.config.defaultPriority ?? 'low',
      title: input.title,
      body: input.body,
      timestamp: Date.now(),
      read: false,
      actioned: false,
      metadata: input.metadata,
      groupId: input.groupId,
    };

    if (this.shouldBatch(notification)) {
      this.batch.push(notification);
    } else {
      this.notifications.push(notification);
    }

    return notification;
  }

  getUnread(filter?: { source?: NotificationSource; priority?: NotificationPriority }): Notification[] {
    return this.notifications.filter((n) => {
      if (n.read) return false;
      if (filter?.source && n.source !== filter.source) return false;
      if (filter?.priority && n.priority !== filter.priority) return false;
      return true;
    });
  }

  getAll(): Notification[] {
    return this.notifications;
  }

  markRead(id: string): boolean {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return false;
    notification.read = true;
    return true;
  }

  markActioned(id: string): boolean {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return false;
    notification.actioned = true;
    return true;
  }

  getBatch(): Notification[] {
    return [...this.batch];
  }

  flushBatch(): Notification[] {
    const flushed = [...this.batch];
    this.notifications.push(...flushed);
    this.batch = [];
    return flushed;
  }

  clear(): void {
    this.notifications = [];
    this.batch = [];
  }

  getStats(): {
    total: number;
    unread: number;
    batched: number;
    bySource: Record<string, number>;
    byPriority: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let unread = 0;

    for (const n of this.notifications) {
      if (!n.read) unread++;
      bySource[n.source] = (bySource[n.source] ?? 0) + 1;
      byPriority[n.priority] = (byPriority[n.priority] ?? 0) + 1;
    }

    return {
      total: this.notifications.length,
      unread,
      batched: this.batch.length,
      bySource,
      byPriority,
    };
  }

  private shouldBatch(notification: Notification): boolean {
    return notification.priority === 'low' || notification.priority === 'muted';
  }

  private getRoutes(notification: Notification): DeliveryChannel[] {
    if (this.config.routingRules) {
      for (const rule of this.config.routingRules) {
        const sourceMatch = !rule.source || rule.source === notification.source;
        const priorityMatch = !rule.priority || rule.priority === notification.priority;
        if (sourceMatch && priorityMatch) {
          return rule.deliverVia;
        }
      }
    }
    return ['webchat'];
  }
}
