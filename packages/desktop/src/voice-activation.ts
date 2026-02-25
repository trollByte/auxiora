import type { TauriBridge } from './app.js';
import type { HotkeyManager } from './hotkey.js';

/**
 * Desktop voice activation — hotkey-triggered voice input.
 */
export class VoiceActivation {
  private bridge: TauriBridge;
  private hotkeys: HotkeyManager;
  private active = false;
  private onActivate?: () => void | Promise<void>;
  private onDeactivate?: () => void | Promise<void>;

  constructor(bridge: TauriBridge, hotkeys: HotkeyManager) {
    this.bridge = bridge;
    this.hotkeys = hotkeys;
  }

  /** Register the voice activation hotkey. */
  async register(combo: string): Promise<void> {
    await this.hotkeys.register({
      id: 'voice-activate',
      combo,
      description: 'Push-to-talk voice activation',
      action: async () => {
        if (this.active) {
          this.active = false;
          if (this.onDeactivate) await this.onDeactivate();
        } else {
          this.active = true;
          if (this.onActivate) await this.onActivate();
        }
      },
    });
  }

  /** Unregister the voice activation hotkey. */
  async unregister(): Promise<void> {
    if (this.hotkeys.has('voice-activate')) {
      await this.hotkeys.unregister('voice-activate');
    }
    this.active = false;
  }

  /** Set callbacks for activation/deactivation. */
  setCallbacks(
    onActivate: () => void | Promise<void>,
    onDeactivate: () => void | Promise<void>,
  ): void {
    this.onActivate = onActivate;
    this.onDeactivate = onDeactivate;
  }

  /** Whether voice is currently active. */
  isActive(): boolean {
    return this.active;
  }
}
