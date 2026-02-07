export type {
  DesktopConfig,
  TrayMenuItem,
  NotificationPayload,
  HotkeyBinding,
  UpdateInfo,
  DesktopStatus,
} from './types.js';
export { DEFAULT_DESKTOP_CONFIG } from './types.js';
export { DesktopApp, type DesktopAppOptions, type TauriBridge } from './app.js';
export { TrayManager } from './tray.js';
export { HotkeyManager } from './hotkey.js';
export { NotificationBridge } from './notifications.js';
export { AutoUpdater } from './updater.js';
export { OllamaBundleManager, type OllamaStatus } from './ollama.js';
