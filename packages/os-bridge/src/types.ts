export type Platform = 'darwin' | 'linux' | 'win32';

export interface ClipboardEntry {
  content: string;
  type: 'text' | 'image' | 'html';
  timestamp: number;
}

export interface FileEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  filename: string;
  timestamp: number;
}

export type FileClassification =
  | 'document'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'archive'
  | 'spreadsheet'
  | 'presentation'
  | 'other';

export interface AppInfo {
  name: string;
  pid: number;
  focused: boolean;
}

export interface SystemState {
  platform: Platform;
  hostname: string;
  uptime: number;
  memory: {
    total: number;
    free: number;
    usedPercent: number;
  };
  cpu: {
    model: string;
    cores: number;
    loadAvg: number[];
  };
  disk?: {
    total: number;
    free: number;
    usedPercent: number;
  };
  battery?: {
    level: number;
    charging: boolean;
  } | null;
}

export interface GpuInfo {
  name: string;
  memoryTotalMB: number;
  memoryUsedMB: number;
  utilizationPercent: number;
}

export interface ResourceSnapshot {
  cpu: { cores: number; model: string; loadAvg1m: number; loadAvg5m: number; utilization: number };
  memory: { totalMB: number; freeMB: number; availableMB: number; usedPercent: number };
  swap: { totalMB: number; usedMB: number; usedPercent: number };
  gpu: GpuInfo | null;
  disk: { totalMB: number; freeMB: number; usedPercent: number } | null;
  timestamp: number;
}

export type MachineClass = 'minimal' | 'light' | 'standard' | 'workstation' | 'server';

export interface MachineProfile {
  machineClass: MachineClass;
  hasGpu: boolean;
  recommendedMaxAgents: number;
  cpuCeiling: number;
  ramCeiling: number;
}

export interface OsBridgeConfig {
  watchDirs?: string[];
  clipboardPollMs?: number;
  platform?: Platform;
}
