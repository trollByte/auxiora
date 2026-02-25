export interface DesktopConfig {
  autoStart: boolean;
  minimizeToTray: boolean;
  hotkey: string;
  notificationsEnabled: boolean;
  updateChannel: 'stable' | 'beta' | 'nightly';
  ollamaEnabled: boolean;
  ollamaPort: number;
  windowWidth: number;
  windowHeight: number;
}

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  autoStart: false,
  minimizeToTray: true,
  hotkey: 'CommandOrControl+Shift+A',
  notificationsEnabled: true,
  updateChannel: 'stable',
  ollamaEnabled: false,
  ollamaPort: 11434,
  windowWidth: 1024,
  windowHeight: 768,
};

export interface TrayMenuItem {
  id: string;
  label: string;
  enabled: boolean;
  separator?: boolean;
  accelerator?: string;
  action?: () => void | Promise<void>;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  replyAction?: boolean;
  tag?: string;
}

export interface HotkeyBinding {
  id: string;
  combo: string;
  description: string;
  action: () => void | Promise<void>;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  channel: 'stable' | 'beta' | 'nightly';
  available: boolean;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string;
}

export type DesktopStatus = 'initializing' | 'running' | 'hidden' | 'updating' | 'error';
