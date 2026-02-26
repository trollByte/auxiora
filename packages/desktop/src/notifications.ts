import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';
import type { NotificationPayload } from './types.js';

const logger = getLogger('desktop:notifications');

export class NotificationBridge {
  private bridge: TauriBridge;
  private focused = false;
  private queue: NotificationPayload[] = [];

  constructor(bridge: TauriBridge) {
    this.bridge = bridge;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (this.focused && !payload.silent) {
      this.queue.push(payload);
      return;
    }
    await this.bridge.sendNotification(payload);
    logger.info('Notification sent', { title: payload.title, tag: payload.tag });
  }

  clearQueue(): void {
    this.queue = [];
  }
}

/**
 * Show a native OS notification for a new message.
 * Requests permission on first use if not already granted.
 */
export async function notifyNewMessage(title: string, body: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === 'granted';
  }
  if (granted) {
    sendNotification({ title, body });
  }
}

/**
 * Check if notification permissions are currently granted.
 */
export async function isNotificationEnabled(): Promise<boolean> {
  return isPermissionGranted();
}
