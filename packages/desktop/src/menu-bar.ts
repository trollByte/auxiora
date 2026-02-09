import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';
import type { TrayMenuItem, NotificationPayload, DesktopStatus } from './types.js';

const logger = getLogger('desktop:menu-bar');

/** Menu bar quick action. */
export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void | Promise<void>;
}

/** Configuration for the menu bar app. */
export interface MenuBarConfig {
  showStatusIcon: boolean;
  quickActions: QuickAction[];
  showRecentConversations: boolean;
  maxRecentConversations: number;
}

export const DEFAULT_MENU_BAR_CONFIG: MenuBarConfig = {
  showStatusIcon: true,
  quickActions: [],
  showRecentConversations: true,
  maxRecentConversations: 5,
};

/**
 * Manages the macOS menu bar / system tray presence for Auxiora.
 * Shows current status, provides quick actions, and handles
 * menu bar-specific interactions.
 */
export class MenuBarApp {
  private bridge: TauriBridge;
  private config: MenuBarConfig;
  private currentStatus: DesktopStatus = 'initializing';
  private statusText = 'Starting...';
  private quickActions: QuickAction[] = [];
  private visible = false;

  constructor(bridge: TauriBridge, config?: Partial<MenuBarConfig>) {
    this.bridge = bridge;
    this.config = { ...DEFAULT_MENU_BAR_CONFIG, ...config };
    this.quickActions = [...this.config.quickActions];
  }

  /** Initialize the menu bar. */
  async init(): Promise<void> {
    if (this.config.showStatusIcon) {
      await this.bridge.showTray();
      this.visible = true;
    }
    await this.updateMenu();
    logger.info('Menu bar initialized');
  }

  /** Update the displayed status. */
  async setStatus(status: DesktopStatus, text?: string): Promise<void> {
    this.currentStatus = status;
    this.statusText = text ?? this.statusTextForState(status);
    await this.updateMenu();
  }

  /** Add a quick action to the menu bar. */
  addQuickAction(action: QuickAction): void {
    this.quickActions.push(action);
  }

  /** Remove a quick action by ID. */
  removeQuickAction(id: string): boolean {
    const idx = this.quickActions.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.quickActions.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Get all quick actions. */
  getQuickActions(): QuickAction[] {
    return [...this.quickActions];
  }

  /** Show or hide the menu bar icon. */
  async setVisible(visible: boolean): Promise<void> {
    if (visible && !this.visible) {
      await this.bridge.showTray();
    } else if (!visible && this.visible) {
      await this.bridge.hideTray();
    }
    this.visible = visible;
  }

  /** Get current visibility. */
  isVisible(): boolean {
    return this.visible;
  }

  /** Get current status. */
  getStatus(): DesktopStatus {
    return this.currentStatus;
  }

  /** Get current status text. */
  getStatusText(): string {
    return this.statusText;
  }

  /** Build the full tray menu items. */
  buildMenuItems(): TrayMenuItem[] {
    const items: TrayMenuItem[] = [
      { id: 'status', label: `Status: ${this.statusText}`, enabled: false },
      { id: 'sep-1', label: '', enabled: false, separator: true },
    ];

    // Quick actions
    for (const action of this.quickActions) {
      items.push({
        id: `action-${action.id}`,
        label: action.label,
        enabled: true,
        accelerator: action.shortcut,
        action: action.action,
      });
    }

    if (this.quickActions.length > 0) {
      items.push({ id: 'sep-2', label: '', enabled: false, separator: true });
    }

    items.push(
      { id: 'show', label: 'Show Auxiora', enabled: true },
      { id: 'preferences', label: 'Preferences...', enabled: true },
      { id: 'sep-3', label: '', enabled: false, separator: true },
      { id: 'quit', label: 'Quit', enabled: true },
    );

    return items;
  }

  /** Destroy the menu bar. */
  async destroy(): Promise<void> {
    if (this.visible) {
      await this.bridge.hideTray();
      this.visible = false;
    }
    this.quickActions = [];
    logger.info('Menu bar destroyed');
  }

  private async updateMenu(): Promise<void> {
    // In a real implementation, this would update the native tray menu
    // For now, we just rebuild the menu items
    this.buildMenuItems();
  }

  private statusTextForState(status: DesktopStatus): string {
    switch (status) {
      case 'initializing': return 'Starting...';
      case 'running': return 'Running';
      case 'hidden': return 'Hidden';
      case 'updating': return 'Updating...';
      case 'error': return 'Error';
    }
  }
}
