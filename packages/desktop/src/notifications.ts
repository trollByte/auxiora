import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

/**
 * Show a native OS notification for a new message.
 * Requests permission on first use if not already granted.
 */
export async function notifyNewMessage(title: string, body: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === 'granted';
  }
  if (granted) {
    sendNotification({ title, body });
  }
}

/**
 * Check if notification permissions are currently granted.
 */
export async function isNotificationEnabled(): Promise<boolean> {
  return isPermissionGranted();
}
