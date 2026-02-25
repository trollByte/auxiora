import type { TauriBridge } from './app.js';

/** Screen capture permission state. */
export type ScreenPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt';

/**
 * Manages screen capture permissions on the desktop.
 * Wraps platform-specific permission APIs (macOS Screen Recording, etc.).
 */
export class ScreenPermissionManager {
  private bridge: TauriBridge;
  private state: ScreenPermissionState = 'unknown';

  constructor(bridge: TauriBridge) {
    this.bridge = bridge;
  }

  /** Check current screen capture permission state. */
  async check(): Promise<ScreenPermissionState> {
    // In a real implementation, this would query OS-level permissions
    // For now, assume granted if the bridge is available
    this.state = 'granted';
    return this.state;
  }

  /** Request screen capture permission from the user. */
  async request(): Promise<ScreenPermissionState> {
    if (this.state === 'granted') return 'granted';
    // Would trigger OS permission dialog
    this.state = 'prompt';
    return this.state;
  }

  /** Get current permission state without querying. */
  getState(): ScreenPermissionState {
    return this.state;
  }
}
