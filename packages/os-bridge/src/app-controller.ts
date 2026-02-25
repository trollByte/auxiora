import type { Platform } from './types.js';

export class AppController {
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  getCommand(action: 'launch' | 'focus' | 'close' | 'list', appName?: string): string {
    switch (this.platform) {
      case 'darwin':
        return this.getDarwinCommand(action, appName);
      case 'linux':
        return this.getLinuxCommand(action, appName);
      case 'win32':
        return this.getWin32Command(action, appName);
    }
  }

  private getDarwinCommand(action: string, appName?: string): string {
    switch (action) {
      case 'launch':
        return `open -a "${appName}"`;
      case 'focus':
        return `osascript -e 'tell app "${appName}" to activate'`;
      case 'close':
        return `osascript -e 'tell app "${appName}" to quit'`;
      case 'list':
        return 'ps aux';
      default:
        return '';
    }
  }

  private getLinuxCommand(action: string, appName?: string): string {
    switch (action) {
      case 'launch':
        return `xdg-open "${appName}" || ${appName}`;
      case 'focus':
        return `wmctrl -a "${appName}"`;
      case 'close':
        return `pkill -f "${appName}"`;
      case 'list':
        return 'ps aux';
      default:
        return '';
    }
  }

  private getWin32Command(action: string, appName?: string): string {
    switch (action) {
      case 'launch':
        return `start "" "${appName}"`;
      case 'focus':
        return `powershell -c "(New-Object -ComObject WScript.Shell).AppActivate('${appName}')"`;
      case 'close':
        return `taskkill /IM "${appName}" /F`;
      case 'list':
        return 'tasklist';
      default:
        return '';
    }
  }

  async launch(appName: string): Promise<{ success: boolean; command: string }> {
    const command = this.getCommand('launch', appName);
    return { success: true, command };
  }

  async focus(appName: string): Promise<{ success: boolean; command: string }> {
    const command = this.getCommand('focus', appName);
    return { success: true, command };
  }

  async close(appName: string): Promise<{ success: boolean; command: string }> {
    const command = this.getCommand('close', appName);
    return { success: true, command };
  }
}
