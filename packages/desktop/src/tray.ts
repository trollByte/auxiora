import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';
import type { TrayMenuItem } from './types.js';

const logger = getLogger('desktop:tray');

export class TrayManager {
  private bridge: TauriBridge;
  private items: TrayMenuItem[] = [];
  private badge = 0;

  constructor(bridge: TauriBridge) {
    this.bridge = bridge;
  }

  buildMenu(items: TrayMenuItem[]): TrayMenuItem[] {
    this.items = items;
    logger.info('Tray menu built', { itemCount: items.length });
    return this.items;
  }

  getMenu(): TrayMenuItem[] {
    return this.items;
  }

  updateBadge(count: number): void {
    this.badge = Math.max(0, count);
    void this.bridge.setTrayBadge(this.badge);
    logger.info('Tray badge updated', { count: this.badge });
  }

  getBadge(): number {
    return this.badge;
  }

  async quickReply(message: string): Promise<void> {
    if (!message.trim()) {
      throw new Error('Quick reply message cannot be empty');
    }
    await this.bridge.sendQuickReply(message);
    logger.info('Quick reply sent', { length: message.length });
  }

  async show(): Promise<void> {
    await this.bridge.showTray();
  }

  async hide(): Promise<void> {
    await this.bridge.hideTray();
  }
}
