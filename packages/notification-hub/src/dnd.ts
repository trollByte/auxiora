import type { DndSchedule, Notification } from './types.js';

export class DoNotDisturbManager {
  private schedule?: DndSchedule;
  private manualUntil?: number;

  setSchedule(schedule: DndSchedule): void {
    this.schedule = schedule;
  }

  setManual(durationMs: number): void {
    this.manualUntil = Date.now() + durationMs;
  }

  clearManual(): void {
    this.manualUntil = undefined;
  }

  isActive(now?: Date): boolean {
    const current = now ?? new Date();

    // Manual override takes precedence
    if (this.manualUntil !== undefined && current.getTime() < this.manualUntil) {
      return true;
    }

    // Check schedule
    if (this.schedule?.enabled) {
      const day = current.getDay();
      const hour = current.getHours();

      if (!this.schedule.days.includes(day)) {
        return false;
      }

      const { startHour, endHour } = this.schedule;
      if (startHour <= endHour) {
        // Same-day range (e.g., 22-23 or 9-17)
        return hour >= startHour && hour < endHour;
      } else {
        // Overnight range (e.g., 22-7)
        return hour >= startHour || hour < endHour;
      }
    }

    return false;
  }

  filter(notifications: Notification[]): Notification[] {
    if (!this.isActive()) {
      return notifications;
    }

    const allowUrgent = this.schedule?.allowUrgent ?? false;

    return notifications.filter((n) => {
      if (allowUrgent && n.priority === 'urgent') {
        return true;
      }
      return false;
    });
  }
}
