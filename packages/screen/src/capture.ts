import type { CaptureBackend, ScreenBounds, ScreenCapture, ScreenConfig } from './types.js';
import { DEFAULT_SCREEN_CONFIG } from './types.js';

/**
 * Screen capturer with injectable backend.
 * Uses a CaptureBackend for actual capture (Tauri bridge on desktop, mock in tests).
 */
export class ScreenCapturer {
  private backend: CaptureBackend;
  private config: ScreenConfig;

  constructor(backend: CaptureBackend, config?: Partial<ScreenConfig>) {
    this.backend = backend;
    this.config = { ...DEFAULT_SCREEN_CONFIG, ...config };
  }

  /** Capture the entire screen. */
  async captureScreen(): Promise<ScreenCapture> {
    if (!this.config.captureEnabled) {
      throw new Error('Screen capture is disabled');
    }
    return this.backend.captureScreen();
  }

  /** Capture a specific region of the screen. */
  async captureRegion(bounds: ScreenBounds): Promise<ScreenCapture> {
    if (!this.config.captureEnabled) {
      throw new Error('Screen capture is disabled');
    }
    if (bounds.width > this.config.maxCaptureWidth || bounds.height > this.config.maxCaptureHeight) {
      throw new Error(
        `Region exceeds max capture dimensions (${this.config.maxCaptureWidth}x${this.config.maxCaptureHeight})`
      );
    }
    return this.backend.captureRegion(bounds);
  }

  /** Capture a window by title. */
  async captureWindow(title: string): Promise<ScreenCapture> {
    if (!this.config.captureEnabled) {
      throw new Error('Screen capture is disabled');
    }
    if (!title || title.trim().length === 0) {
      throw new Error('Window title must not be empty');
    }
    return this.backend.captureWindow(title);
  }

  /** Get current config. */
  getConfig(): ScreenConfig {
    return { ...this.config };
  }
}
