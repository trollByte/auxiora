import { getLogger } from '@auxiora/logger';
import type { HotkeyManager } from './hotkey.js';

const logger = getLogger('desktop:ptt');

export interface PttOverlayConfig {
  /** Whether PTT overlay is enabled. */
  enabled: boolean;
  /** Hotkey combo for push-to-talk. */
  hotkey: string;
  /** Whether to show the floating overlay indicator. */
  showOverlay: boolean;
}

export const DEFAULT_PTT_CONFIG: PttOverlayConfig = {
  enabled: false,
  hotkey: 'CmdOrCtrl+Shift+Space',
  showOverlay: true,
};

export type PttState = 'idle' | 'recording' | 'processing';

export interface PttCallbacks {
  /** Called when PTT key is pressed — start recording. */
  onPress: () => void | Promise<void>;
  /** Called when PTT key is released — stop recording and trigger STT. */
  onRelease: () => void | Promise<void>;
}

/**
 * Push-to-talk overlay for desktop voice input.
 *
 * Registers a system-wide hotkey that toggles recording on/off.
 * The first press starts recording, the second press stops and
 * triggers transcription. Manages a minimal overlay UI state
 * (recording indicator).
 */
export class PttOverlay {
  private hotkeys: HotkeyManager;
  private config: PttOverlayConfig;
  private state: PttState = 'idle';
  private callbacks?: PttCallbacks;
  private registered = false;

  constructor(hotkeys: HotkeyManager, config?: Partial<PttOverlayConfig>) {
    this.hotkeys = hotkeys;
    this.config = { ...DEFAULT_PTT_CONFIG, ...config };
  }

  /** Register the PTT hotkey. */
  async register(): Promise<void> {
    if (this.registered) {
      throw new Error('PTT overlay is already registered');
    }

    await this.hotkeys.register({
      id: 'ptt-toggle',
      combo: this.config.hotkey,
      description: 'Push-to-talk toggle',
      action: async () => {
        await this.toggle();
      },
    });

    this.registered = true;
    logger.info('PTT overlay registered', { hotkey: this.config.hotkey });
  }

  /** Unregister the PTT hotkey. */
  async unregister(): Promise<void> {
    if (!this.registered) return;

    // If currently recording, stop first
    if (this.state === 'recording') {
      await this.stopRecording();
    }

    if (this.hotkeys.has('ptt-toggle')) {
      await this.hotkeys.unregister('ptt-toggle');
    }

    this.registered = false;
    this.state = 'idle';
    logger.info('PTT overlay unregistered');
  }

  /** Set the callbacks for press/release events. */
  setCallbacks(callbacks: PttCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Get current PTT state. */
  getState(): PttState {
    return this.state;
  }

  /** Get current config. */
  getConfig(): PttOverlayConfig {
    return { ...this.config };
  }

  /** Whether the PTT hotkey is registered. */
  isRegistered(): boolean {
    return this.registered;
  }

  /** Whether the overlay indicator should be visible. */
  isOverlayVisible(): boolean {
    return this.config.showOverlay && this.state === 'recording';
  }

  /** Toggle recording state (press to start, press again to stop). */
  private async toggle(): Promise<void> {
    if (this.state === 'idle') {
      await this.startRecording();
    } else if (this.state === 'recording') {
      await this.stopRecording();
    }
    // Ignore toggle during 'processing' state
  }

  private async startRecording(): Promise<void> {
    this.state = 'recording';
    logger.info('PTT recording started');
    if (this.callbacks?.onPress) {
      await this.callbacks.onPress();
    }
  }

  private async stopRecording(): Promise<void> {
    this.state = 'processing';
    logger.info('PTT recording stopped, processing');
    if (this.callbacks?.onRelease) {
      await this.callbacks.onRelease();
    }
    this.state = 'idle';
  }
}
