export type {
  InstallMethod,
  UpdateChannel,
  InstallationInfo,
  ReleaseAsset,
  UpdateCheckResult,
  StagedUpdate,
  UpdateResult,
  UpdatePreferences,
  UpdateStrategy,
} from './types.js';
export { DEFAULT_UPDATE_PREFERENCES } from './types.js';
export { InstallationDetector } from './detector.js';
export { HealthChecker } from './health-checker.js';
export type { HealthCheckResult, HealthCheckOptions } from './health-checker.js';
export { VersionChecker } from './version-checker.js';
export { Updater } from './updater.js';
export type { UpdaterOptions } from './updater.js';
