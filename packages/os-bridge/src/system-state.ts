import os from 'node:os';
import type { Platform, SystemState } from './types.js';

export class SystemStateMonitor {
  private platform: Platform;

  constructor(platform?: Platform) {
    this.platform = platform ?? (os.platform() as Platform);
  }

  getState(): SystemState {
    return {
      platform: this.platform,
      hostname: os.hostname(),
      uptime: os.uptime(),
      memory: this.getMemoryUsage(),
      cpu: this.getCpuInfo(),
    };
  }

  getMemoryUsage(): { total: number; free: number; usedPercent: number } {
    const total = os.totalmem();
    const free = os.freemem();
    const usedPercent = ((total - free) / total) * 100;
    return { total, free, usedPercent };
  }

  getCpuInfo(): { model: string; cores: number; loadAvg: number[] } {
    const cpus = os.cpus();
    return {
      model: cpus[0]?.model ?? 'unknown',
      cores: cpus.length,
      loadAvg: os.loadavg(),
    };
  }
}
