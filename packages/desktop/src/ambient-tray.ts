import type { TauriBridge } from './app.js';
import type { TrayManager } from './tray.js';

/** Ambient state for tray indicators. */
export type AmbientTrayState = 'idle' | 'listening' | 'thinking' | 'alert';

/**
 * Manages ambient tray indicators for notification badges,
 * listening state, and quiet notification counts.
 */
export class AmbientTrayIndicator {
  private bridge: TauriBridge;
  private tray: TrayManager;
  private state: AmbientTrayState = 'idle';
  private notificationCount = 0;

  constructor(bridge: TauriBridge, tray: TrayManager) {
    this.bridge = bridge;
    this.tray = tray;
  }

  /** Set the ambient state (changes tray icon appearance). */
  async setState(state: AmbientTrayState): Promise<void> {
    this.state = state;
    // In a real implementation, this would change the tray icon
  }

  /** Update the notification badge count. */
  async setNotificationCount(count: number): Promise<void> {
    this.notificationCount = count;
    await this.bridge.setTrayBadge(count);
  }

  /** Get current state. */
  getState(): AmbientTrayState {
    return this.state;
  }

  /** Get notification count. */
  getNotificationCount(): number {
    return this.notificationCount;
  }
}
