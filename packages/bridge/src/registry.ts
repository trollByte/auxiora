import { getLogger } from '@auxiora/logger';
import type { DeviceInfo, DeviceCapability, DeviceConnectionState } from './types.js';

const logger = getLogger('bridge:registry');

/**
 * Tracks paired devices, their capabilities, and online status.
 */
export class DeviceRegistry {
  private devices = new Map<string, DeviceInfo>();
  private maxDevices: number;

  constructor(maxDevices = 10) {
    this.maxDevices = maxDevices;
  }

  /** Register a newly paired device. */
  register(device: DeviceInfo): void {
    if (this.devices.size >= this.maxDevices && !this.devices.has(device.id)) {
      throw new Error(`Maximum device limit (${this.maxDevices}) reached`);
    }
    this.devices.set(device.id, { ...device });
    logger.info('Device registered', { deviceId: device.id, name: device.name, platform: device.platform });
  }

  /** Remove a device from the registry. */
  unregister(deviceId: string): boolean {
    const removed = this.devices.delete(deviceId);
    if (removed) {
      logger.info('Device unregistered', { deviceId });
    }
    return removed;
  }

  /** Get a device by ID. */
  get(deviceId: string): DeviceInfo | undefined {
    const device = this.devices.get(deviceId);
    return device ? { ...device } : undefined;
  }

  /** Get all registered devices. */
  getAll(): DeviceInfo[] {
    return Array.from(this.devices.values()).map((d) => ({ ...d }));
  }

  /** Get devices that are currently online. */
  getOnline(): DeviceInfo[] {
    return this.getAll().filter((d) => d.state === 'online');
  }

  /** Get devices that have a specific capability. */
  getByCapability(capability: DeviceCapability): DeviceInfo[] {
    return this.getAll().filter((d) => d.capabilities.includes(capability));
  }

  /** Update a device's connection state. */
  setState(deviceId: string, state: DeviceConnectionState): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.state = state;
      if (state === 'online') {
        device.lastSeen = Date.now();
      }
    }
  }

  /** Record that a heartbeat was received from a device. */
  heartbeat(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      if (device.state !== 'online') {
        device.state = 'online';
      }
    }
  }

  /** Check for devices that have gone offline based on heartbeat timeout. */
  checkTimeouts(timeoutMs: number): string[] {
    const now = Date.now();
    const timedOut: string[] = [];

    for (const device of this.devices.values()) {
      if (device.state === 'online' && now - device.lastSeen > timeoutMs) {
        device.state = 'offline';
        timedOut.push(device.id);
        logger.info('Device timed out', { deviceId: device.id });
      }
    }

    return timedOut;
  }

  /** Get the total count of devices. */
  get size(): number {
    return this.devices.size;
  }

  /** Check if registry has space for more devices. */
  hasCapacity(): boolean {
    return this.devices.size < this.maxDevices;
  }

  /** Clear all devices. */
  clear(): void {
    this.devices.clear();
  }
}
