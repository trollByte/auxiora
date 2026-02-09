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
export {
  PttOverlay,
  DEFAULT_PTT_CONFIG,
  type PttOverlayConfig,
  type PttState,
  type PttCallbacks,
} from './ptt-overlay.js';
// [P17] Bridge integration and menu bar
export {
  DesktopNode,
  DEFAULT_DESKTOP_NODE_CONFIG,
  type DesktopNodeConfig,
  type DesktopNodeState,
  type DesktopTransport,
} from './desktop-node.js';
export {
  MenuBarApp,
  DEFAULT_MENU_BAR_CONFIG,
  type MenuBarConfig,
  type QuickAction,
} from './menu-bar.js';
