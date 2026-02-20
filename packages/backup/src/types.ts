export type BackupFormat = 'json' | 'archive';
export type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type DataCategory = 'conversations' | 'memory' | 'preferences' | 'behaviors' | 'connectors' | 'settings';

export interface BackupManifest {
  version: string;
  auxioraVersion: string;
  createdAt: number;
  categories: DataCategory[];
  totalItems: number;
  sizeBytes: number;
  checksum: string;
}

export interface BackupResult {
  status: BackupStatus;
  manifest: BackupManifest;
  data: Record<DataCategory, unknown>;
  error?: string;
}

export interface RestoreResult {
  status: BackupStatus;
  restoredCategories: DataCategory[];
  skippedCategories: DataCategory[];
  itemsRestored: number;
  warnings: string[];
  error?: string;
}

export interface DataProvider {
  category: DataCategory;
  export(): Promise<unknown>;
  import(data: unknown): Promise<{ itemCount: number; warnings: string[] }>;
  count(): Promise<number>;
}
