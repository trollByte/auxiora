import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';

const logger = getLogger('updater:strategies:brew');

export class BrewStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'brew';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    logger.info('Fetching homebrew package');
    const result = await safeExecFile('brew', ['fetch', 'auxiora']);
    if (result.status === 'error') {
      throw new Error(`brew fetch failed: ${result.stderr}`);
    }

    return {
      targetVersion: target.latestVersion,
      previousVersion: info.currentVersion,
      backupPath: '',
      stagedPath: '',
      method: this.method,
      timestamp: Date.now(),
    };
  }

  async apply(staged: StagedUpdate): Promise<void> {
    logger.info('Upgrading homebrew package', { version: staged.targetVersion });
    const result = await safeExecFile('brew', ['upgrade', 'auxiora']);
    if (result.status === 'error') {
      throw new Error(`brew upgrade failed: ${result.stderr}`);
    }
  }

  async restart(_info: InstallationInfo): Promise<void> {
    logger.info('Restarting gateway process');
    await safeExecFile('pkill', ['-f', 'auxiora-gateway']);
  }

  async rollback(staged: StagedUpdate): Promise<void> {
    logger.info('Rolling back homebrew package', { version: staged.previousVersion });
    const result = await safeExecFile('brew', ['install', `auxiora@${staged.previousVersion}`]);
    if (result.status === 'error') {
      throw new Error(`brew rollback failed: ${result.stderr}`);
    }
  }

  async cleanup(_staged: StagedUpdate): Promise<void> {
    // No-op: brew manages its own cache
  }
}
