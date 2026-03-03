export interface ResourceSnapshotLike {
  cpu: { cores: number; utilization: number; loadAvg1m: number };
  memory: { totalMB: number; freeMB: number; availableMB: number; usedPercent: number };
  swap: { usedPercent: number };
  timestamp: number;
}

export interface MachineProfileLike {
  machineClass: string;
  hasGpu: boolean;
  recommendedMaxAgents: number;
  cpuCeiling: number;
  ramCeiling: number;
}

export interface ResourceProbeLike {
  probe(): Promise<ResourceSnapshotLike>;
  classify(snapshot: ResourceSnapshotLike): MachineProfileLike;
  safeSlots(snapshot: ResourceSnapshotLike, profile: MachineProfileLike): number;
}
