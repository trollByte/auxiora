import type { ResourceSnapshotLike } from './resource-types.js';

export type ResourceAction = 'ok' | 'throttle' | 'pause' | 'kill';

export interface BreakerThresholds {
  ramPausePercent: number;
  ramKillPercent: number;
  cpuThrottlePercent: number;
  swapEmergencyPercent: number;
}

const ACTION_SEVERITY: Record<ResourceAction, number> = {
  ok: 0,
  throttle: 1,
  pause: 2,
  kill: 3,
};

export class ResourceBreakers {
  private thresholds: BreakerThresholds;

  constructor(thresholds?: Partial<BreakerThresholds>) {
    this.thresholds = {
      ramPausePercent: thresholds?.ramPausePercent ?? 85,
      ramKillPercent: thresholds?.ramKillPercent ?? 90,
      cpuThrottlePercent: thresholds?.cpuThrottlePercent ?? 90,
      swapEmergencyPercent: thresholds?.swapEmergencyPercent ?? 50,
    };
  }

  evaluate(snapshot: ResourceSnapshotLike): { action: ResourceAction; reasons: string[] } {
    let action: ResourceAction = 'ok';
    const reasons: string[] = [];

    // RAM kill check
    if (snapshot.memory.usedPercent > this.thresholds.ramKillPercent) {
      action = this.worst(action, 'kill');
      reasons.push(`RAM usage ${snapshot.memory.usedPercent.toFixed(1)}% exceeds kill threshold ${this.thresholds.ramKillPercent}%`);
    }

    // Swap emergency check
    if (snapshot.swap.usedPercent > this.thresholds.swapEmergencyPercent) {
      action = this.worst(action, 'kill');
      reasons.push(`Swap usage ${snapshot.swap.usedPercent.toFixed(1)}% exceeds emergency threshold ${this.thresholds.swapEmergencyPercent}%`);
    }

    // RAM pause check (only if not already at kill level from RAM)
    if (snapshot.memory.usedPercent > this.thresholds.ramPausePercent && snapshot.memory.usedPercent <= this.thresholds.ramKillPercent) {
      action = this.worst(action, 'pause');
      reasons.push(`RAM usage ${snapshot.memory.usedPercent.toFixed(1)}% exceeds pause threshold ${this.thresholds.ramPausePercent}%`);
    }

    // CPU throttle check
    if (snapshot.cpu.utilization * 100 > this.thresholds.cpuThrottlePercent) {
      action = this.worst(action, 'throttle');
      reasons.push(`CPU utilization ${(snapshot.cpu.utilization * 100).toFixed(1)}% exceeds throttle threshold ${this.thresholds.cpuThrottlePercent}%`);
    }

    return { action, reasons };
  }

  private worst(current: ResourceAction, candidate: ResourceAction): ResourceAction {
    return ACTION_SEVERITY[candidate] > ACTION_SEVERITY[current] ? candidate : current;
  }
}
