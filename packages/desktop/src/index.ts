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
// [P15] Screen, ambient, voice activation
export { ScreenPermissionManager, type ScreenPermissionState } from './screen-permission.js';
export { AmbientTrayIndicator, type AmbientTrayState } from './ambient-tray.js';
export { VoiceActivation } from './voice-activation.js';
