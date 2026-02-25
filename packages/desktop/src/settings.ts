import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';

/**
 * Check if Auxiora is configured to auto-start on login.
 */
export async function getAutoStartEnabled(): Promise<boolean> {
  return isEnabled();
}

/**
 * Enable or disable auto-start on login.
 */
export async function setAutoStartEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}
