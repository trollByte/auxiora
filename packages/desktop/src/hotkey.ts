import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';
import type { HotkeyBinding } from './types.js';

const logger = getLogger('desktop:hotkey');

export class HotkeyManager {
  private bridge: TauriBridge;
  private bindings = new Map<string, HotkeyBinding>();

  constructor(bridge: TauriBridge) {
    this.bridge = bridge;
  }

  async register(binding: HotkeyBinding): Promise<void> {
    if (this.bindings.has(binding.id)) {
      throw new Error(`Hotkey binding "${binding.id}" is already registered`);
    }

    await this.bridge.registerHotkey(binding.combo, binding.id);
    this.bindings.set(binding.id, binding);
    logger.info('Hotkey registered', { id: binding.id, combo: binding.combo });
  }

  async unregister(id: string): Promise<boolean> {
    const binding = this.bindings.get(id);
    if (!binding) {
      return false;
    }

    await this.bridge.unregisterHotkey(binding.combo);
    this.bindings.delete(id);
    logger.info('Hotkey unregistered', { id });
    return true;
  }

  async unregisterAll(): Promise<void> {
    for (const [id, binding] of this.bindings) {
      await this.bridge.unregisterHotkey(binding.combo);
      logger.info('Hotkey unregistered', { id });
    }
    this.bindings.clear();
  }

  getBindings(): HotkeyBinding[] {
    return Array.from(this.bindings.values());
  }

  has(id: string): boolean {
    return this.bindings.has(id);
  }

  async trigger(id: string): Promise<void> {
    const binding = this.bindings.get(id);
    if (!binding) {
      throw new Error(`No hotkey binding found for "${id}"`);
    }
    await binding.action();
  }
}
