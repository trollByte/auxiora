import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';
import type { UpdateInfo } from './types.js';

const logger = getLogger('desktop:updater');

export class AutoUpdater {
  private bridge: TauriBridge;
  private channel: 'stable' | 'beta' | 'nightly';
  private currentVersion: string;
  private lastCheck: UpdateInfo | null = null;

  constructor(bridge: TauriBridge, currentVersion: string, channel: 'stable' | 'beta' | 'nightly' = 'stable') {
    this.bridge = bridge;
    this.currentVersion = currentVersion;
    this.channel = channel;
  }

  getChannel(): string {
    return this.channel;
  }

  setChannel(channel: 'stable' | 'beta' | 'nightly'): void {
    this.channel = channel;
    logger.info('Update channel changed', { channel });
  }

  async check(): Promise<UpdateInfo> {
    const info = await this.bridge.checkForUpdate(this.channel);
    this.lastCheck = {
      currentVersion: this.currentVersion,
      latestVersion: info.version,
      channel: this.channel,
      available: info.available,
      releaseNotes: info.releaseNotes,
      downloadUrl: info.downloadUrl,
      publishedAt: info.publishedAt,
    };
    logger.info('Update check completed', {
      current: this.currentVersion,
      latest: info.version,
      available: info.available,
    });
    return this.lastCheck;
  }

  getLastCheck(): UpdateInfo | null {
    return this.lastCheck;
  }

  async download(): Promise<void> {
    if (!this.lastCheck?.available) {
      throw new Error('No update available to download');
    }
    await this.bridge.downloadUpdate();
    logger.info('Update downloaded');
  }

  async promptRestart(): Promise<boolean> {
    return this.bridge.promptRestart();
  }

  async rollback(): Promise<void> {
    await this.bridge.rollbackUpdate();
    logger.info('Update rolled back');
  }
}
