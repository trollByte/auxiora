import type { SignalCollector, CollectionContext, AwarenessSignal } from '../types.js';

export class CapacityMonitor implements SignalCollector {
  readonly name = 'capacity-monitor';
  enabled = true;

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapPct = heapTotalMB > 0 ? heapUsedMB / heapTotalMB : 0;

    let priority = 0.4;
    let memLabel = 'normal';
    if (heapPct > 0.85) { priority = 0.9; memLabel = 'HIGH'; }
    else if (heapPct > 0.7) { priority = 0.6; memLabel = 'elevated'; }

    return [{
      dimension: this.name,
      priority,
      text: `Capacity: Memory: ${heapUsedMB}MB/${heapTotalMB}MB (${memLabel}), RSS: ${rssMB}MB.`,
      data: { heapUsedMB, heapTotalMB, rssMB, heapPct, memLabel },
    }];
  }
}
