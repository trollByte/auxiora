import { getLogger } from '@auxiora/logger';
import type { DesktopConfig, DesktopStatus, NotificationPayload, TrayMenuItem } from './types.js';
import { DEFAULT_DESKTOP_CONFIG } from './types.js';
import { TrayManager } from './tray.js';
import { HotkeyManager } from './hotkey.js';
import { NotificationBridge } from './notifications.js';
import { AutoUpdater } from './updater.js';
import { OllamaBundleManager } from './ollama.js';

const logger = getLogger('desktop:app');

export interface TauriBridge {
  // Window
  showWindow(): Promise<void>;
  hideWindow(): Promise<void>;
  setWindowTitle(title: string): Promise<void>;

  // Tray
  showTray(): Promise<void>;
  hideTray(): Promise<void>;
  setTrayBadge(count: number): Promise<void>;
  sendQuickReply(message: string): Promise<void>;

  // Hotkeys
  registerHotkey(combo: string, id: string): Promise<void>;
  unregisterHotkey(combo: string): Promise<void>;

  // Notifications
  sendNotification(payload: NotificationPayload): Promise<void>;

  // Updates
  checkForUpdate(channel: string): Promise<{
    version: string;
    available: boolean;
    releaseNotes?: string;
    downloadUrl?: string;
    publishedAt?: string;
  }>;
  downloadUpdate(): Promise<void>;
  promptRestart(): Promise<boolean>;
  rollbackUpdate(): Promise<void>;

  // Ollama
  detectOllama(): Promise<boolean>;
  startOllama(port: number): Promise<void>;
  stopOllama(): Promise<void>;
  listOllamaModels(): Promise<string[]>;

  // Autostart
  setAutoStart(enabled: boolean): Promise<void>;
}

export interface DesktopAppOptions {
  bridge: TauriBridge;
  config?: DesktopConfig;
  version?: string;
}

export class DesktopApp {
  private bridge: TauriBridge;
  private config: DesktopConfig;
  private status: DesktopStatus = 'initializing';
  readonly tray: TrayManager;
  readonly hotkeys: HotkeyManager;
  readonly notifications: NotificationBridge;
  readonly updater: AutoUpdater;
  readonly ollama: OllamaBundleManager;

  constructor(options: DesktopAppOptions) {
    this.bridge = options.bridge;
    this.config = options.config ?? DEFAULT_DESKTOP_CONFIG;

    this.tray = new TrayManager(this.bridge);
    this.hotkeys = new HotkeyManager(this.bridge);
    this.notifications = new NotificationBridge(this.bridge);
    this.updater = new AutoUpdater(
      this.bridge,
      options.version ?? '0.0.0',
      this.config.updateChannel,
    );
    this.ollama = new OllamaBundleManager(this.bridge, this.config.ollamaPort);
  }

  getStatus(): DesktopStatus {
    return this.status;
  }

  getConfig(): DesktopConfig {
    return { ...this.config };
  }

  async init(): Promise<void> {
    logger.info('Desktop app initializing');

    await this.bridge.setAutoStart(this.config.autoStart);
    await this.setupTray();
    await this.registerHotkey(this.config.hotkey);
    this.setupNotifications();

    if (this.config.ollamaEnabled) {
      try {
        const detected = await this.ollama.detect();
        if (detected) {
          await this.ollama.start();
        }
      } catch (error) {
        logger.warn('Failed to start Ollama', { error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    this.status = 'running';
    logger.info('Desktop app initialized');
  }

  async setupTray(): Promise<TrayMenuItem[]> {
    const items: TrayMenuItem[] = [
      { id: 'show', label: 'Show Auxiora', enabled: true, accelerator: this.config.hotkey },
      { id: 'separator-1', label: '', enabled: false, separator: true },
      { id: 'status', label: 'Status: Running', enabled: false },
      { id: 'separator-2', label: '', enabled: false, separator: true },
      { id: 'updates', label: 'Check for Updates...', enabled: true },
      { id: 'preferences', label: 'Preferences...', enabled: true },
      { id: 'separator-3', label: '', enabled: false, separator: true },
      { id: 'quit', label: 'Quit Auxiora', enabled: true },
    ];

    return this.tray.buildMenu(items);
  }

  async registerHotkey(combo: string): Promise<void> {
    if (this.hotkeys.has('global-toggle')) {
      await this.hotkeys.unregister('global-toggle');
    }

    await this.hotkeys.register({
      id: 'global-toggle',
      combo,
      description: 'Toggle Auxiora window',
      action: async () => {
        if (this.status === 'hidden') {
          await this.bridge.showWindow();
          this.status = 'running';
        } else {
          await this.bridge.hideWindow();
          this.status = 'hidden';
        }
      },
    });
  }

  setupNotifications(): void {
    if (this.config.notificationsEnabled) {
      this.notifications.setFocused(true);
      logger.info('Notifications enabled');
    }
  }

  async checkUpdates(): Promise<boolean> {
    const info = await this.updater.check();
    return info.available;
  }

  async shutdown(): Promise<void> {
    logger.info('Desktop app shutting down');

    await this.hotkeys.unregisterAll();
    this.notifications.clearQueue();

    if (this.ollama.getStatus() === 'running') {
      await this.ollama.stop();
    }

    this.status = 'initializing';
    logger.info('Desktop app shutdown complete');
  }
}
