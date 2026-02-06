import cron from 'node-cron';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('behaviors:scheduler');

export class Scheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  schedule(id: string, cronExpression: string, callback: () => void, timezone?: string): void {
    // Stop existing job with same ID
    this.stop(id);

    const options: cron.ScheduleOptions = {
      scheduled: true,
      timezone: timezone || undefined,
    };

    const task = cron.schedule(cronExpression, () => {
      logger.debug('Cron job fired', { id, cron: cronExpression });
      callback();
    }, options);

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
    return cron.validate(expression);
  }
}
