// Types
export type {
  InstallMethod,
  UpdateChannel,
  UpdateSource,
  InstallationInfo,
  ReleaseAsset,
  UpdateCheckResult,
  StagedUpdate,
  UpdateResult,
  UpdatePreferences,
  UpdateStrategy,
} from './types.js';
export { DEFAULT_UPDATE_PREFERENCES } from './types.js';

// Core classes
export { InstallationDetector } from './detector.js';
export { VersionChecker } from './version-checker.js';
export { HealthChecker } from './health-checker.js';
export type { HealthCheckResult, HealthCheckOptions } from './health-checker.js';
export { Updater } from './updater.js';
export type { UpdaterOptions } from './updater.js';

// Strategies
export { createStrategyMap } from './strategies/index.js';
export { NpmStrategy } from './strategies/npm.js';
export { GitStrategy } from './strategies/git.js';
export { DockerStrategy } from './strategies/docker.js';
export { AptStrategy } from './strategies/apt.js';
export { BrewStrategy } from './strategies/brew.js';
export { TarballStrategy } from './strategies/tarball.js';
export { K8sStrategy } from './strategies/k8s.js';

// Utilities
export { safeExecFile } from './util/exec.js';
export type { ExecResult, ExecOptions } from './util/exec.js';
export { downloadFile } from './util/download.js';
