import { Cron } from 'croner';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('behaviors:scheduler');

export class Scheduler {
  private jobs = new Map<string, Cron>();

  schedule(id: string, cronExpression: string, callback: () => void, timezone?: string): void {
    // Stop existing job with same ID
    this.stop(id);

    const task = new Cron(cronExpression, {
      timezone: timezone || undefined,
    }, () => {
      logger.debug('Cron job fired', { id, cron: cronExpression });
      callback();
    });

    this.jobs.set(id, task);
    logger.info('Scheduled cron job', { id, cron: cronExpression, timezone });
  }

  stop(id: string): void {
    const task = this.jobs.get(id);
    if (task) {
      task.stop();
      this.jobs.delete(id);
      logger.debug('Stopped cron job', { id });
    }
  }

  stopAll(): void {
    for (const [id, task] of this.jobs) {
      task.stop();
      logger.debug('Stopped cron job', { id });
    }
    this.jobs.clear();
  }

  isScheduled(id: string): boolean {
    return this.jobs.has(id);
  }

  listScheduled(): string[] {
    return Array.from(this.jobs.keys());
  }

  static isValidCron(expression: string): boolean {
    try {
      // Croner validates on construction; use a dry-run pattern check
      const c = new Cron(expression, { paused: true });
      c.stop();
      return true;
    } catch {
      return false;
    }
  }
}
