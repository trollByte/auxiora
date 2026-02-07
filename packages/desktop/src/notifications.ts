import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';
import type { NotificationPayload } from './types.js';

const logger = getLogger('desktop:notifications');

export class NotificationBridge {
  private bridge: TauriBridge;
  private queue: NotificationPayload[] = [];
  private focused = true;

  constructor(bridge: TauriBridge) {
    this.bridge = bridge;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    if (focused) {
      void this.flushQueue();
    }
  }

  isFocused(): boolean {
    return this.focused;
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.focused) {
      this.queue.push(payload);
      logger.info('Notification queued (app not focused)', { title: payload.title });
      return;
    }

    await this.bridge.sendNotification(payload);
    logger.info('Notification sent', { title: payload.title });
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  async flushQueue(): Promise<void> {
    const pending = [...this.queue];
    this.queue = [];

    for (const payload of pending) {
      await this.bridge.sendNotification(payload);
      logger.info('Queued notification sent', { title: payload.title });
    }
  }

  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];
    logger.info('Notification queue cleared', { count });
  }
}
