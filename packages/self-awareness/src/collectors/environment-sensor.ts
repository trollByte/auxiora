import os from 'node:os';
import type { SignalCollector, CollectionContext, AwarenessSignal } from '../types.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class EnvironmentSensor implements SignalCollector {
  readonly name = 'environment-sensor';
  enabled = true;

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    const now = new Date();
    const day = DAY_NAMES[now.getDay()];
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const loadAvg = os.loadavg()[0].toFixed(1);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const platform = os.platform();

    return [{
      dimension: this.name,
      priority: 0.3,
      text: `Environment: ${day} ${time}. System load: ${loadAvg}, free memory: ${freeMem}MB/${totalMem}MB.`,
      data: { platform, loadAvg: parseFloat(loadAvg), freeMemMB: freeMem, totalMemMB: totalMem },
    }];
  }
}
