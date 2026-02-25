export type InstallMethod = 'npm' | 'git' | 'docker' | 'apt' | 'brew' | 'tarball' | 'k8s' | 'unknown';

export type UpdateChannel = 'stable' | 'beta' | 'nightly';

export interface InstallationInfo {
  method: InstallMethod;
  currentVersion: string;
  installPath: string;
  canSelfUpdate: boolean;
  requiresSudo: boolean;
  containerRuntime?: 'docker' | 'podman';
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  channel: UpdateChannel;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: number;
  assets: ReleaseAsset[];
}

export interface StagedUpdate {
  targetVersion: string;
  previousVersion: string;
  backupPath: string;
  stagedPath: string;
  method: InstallMethod;
  timestamp: number;
}

export interface UpdateResult {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  method: InstallMethod;
  rolledBack: boolean;
  error?: string;
  durationMs: number;
}

export interface UpdatePreferences {
  channel: UpdateChannel;
  disableUpdateCheck: boolean;
  checkIntervalHours: number;
  autoUpdate: boolean;
  lastCheckTimestamp: number;
  lastUpdateResult?: UpdateResult;
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  channel: 'stable',
  disableUpdateCheck: false,
  checkIntervalHours: 24,
  autoUpdate: false,
  lastCheckTimestamp: 0,
};

export interface UpdateStrategy {
  readonly method: InstallMethod;
  stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate>;
  apply(staged: StagedUpdate): Promise<void>;
  restart(info: InstallationInfo): Promise<void>;
  rollback(staged: StagedUpdate): Promise<void>;
  cleanup(staged: StagedUpdate): Promise<void>;
}
