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

export interface OsBridgeConfig {
  watchDirs?: string[];
  clipboardPollMs?: number;
  platform?: Platform;
}
