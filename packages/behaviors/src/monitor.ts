import { getLogger } from '@auxiora/logger';

const logger = getLogger('behaviors:monitor');

export class MonitorEngine {
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  start(id: string, intervalMs: number, callback: () => void): void {
    // Stop existing monitor with same ID
    this.stop(id);

    const timer = setInterval(() => {
      logger.debug('Monitor poll fired', { id, intervalMs });
      callback();
    }, intervalMs);

    this.timers.set(id, timer);
    logger.info('Started monitor', { id, intervalMs });
  }

  stop(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
      logger.debug('Stopped monitor', { id });
    }
  }

  stopAll(): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
      logger.debug('Stopped monitor', { id });
    }
    this.timers.clear();
  }

  isRunning(id: string): boolean {
    return this.timers.has(id);
  }

  listRunning(): string[] {
    return Array.from(this.timers.keys());
  }
}
