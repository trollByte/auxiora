import * as crypto from 'node:crypto';
import type { NotificationPriority, QuietNotification } from './types.js';

/** Priority ordering for queue sorting. */
const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  alert: 3,
  nudge: 2,
  whisper: 1,
};

/**
 * Priority-based queue for quiet notifications.
 */
export class QuietNotificationManager {
  private notifications: Map<string, QuietNotification> = new Map();

  /** Create and queue a notification. */
  notify(
    priority: NotificationPriority,
    message: string,
    options?: { detail?: string; source?: string }
  ): QuietNotification {
    const notification: QuietNotification = {
      id: crypto.randomUUID(),
      priority,
      message,
      detail: options?.detail,
      createdAt: Date.now(),
      dismissed: false,
      source: options?.source ?? 'ambient',
    };

    this.notifications.set(notification.id, notification);
    return notification;
  }

  /** Get all pending notifications, sorted by priority (highest first). */
  getQueue(): QuietNotification[] {
    return Array.from(this.notifications.values())
      .filter(n => !n.dismissed)
      .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
  }

  /** Get notifications filtered by priority. */
  getByPriority(priority: NotificationPriority): QuietNotification[] {
    return Array.from(this.notifications.values())
      .filter(n => !n.dismissed && n.priority === priority);
  }

  /** Dismiss a notification. */
  dismiss(id: string): boolean {
    const n = this.notifications.get(id);
    if (!n) return false;
    n.dismissed = true;
    return true;
  }

  /** Dismiss all notifications. */
  dismissAll(): number {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (!n.dismissed) {
        n.dismissed = true;
        count++;
      }
    }
    return count;
  }

  /** Get a notification by ID. */
  get(id: string): QuietNotification | undefined {
    return this.notifications.get(id);
  }

  /** Get count of pending notifications. */
  getPendingCount(): number {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (!n.dismissed) count++;
    }
    return count;
  }

  /** Remove old dismissed notifications. */
  prune(maxAge = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let pruned = 0;
    for (const [id, n] of this.notifications) {
      if (n.dismissed && n.createdAt < cutoff) {
        this.notifications.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /** Clear all notifications. */
  clear(): void {
    this.notifications.clear();
  }
}
