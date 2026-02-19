import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';

const logger = getLogger('updater:strategies:apt');

export class AptStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'apt';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    logger.info('Running apt-get update');
    const result = await safeExecFile('sudo', ['apt-get', 'update']);
    if (result.status === 'error') {
      throw new Error(`apt-get update failed: ${result.stderr}`);
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
    logger.info('Installing apt package', { version: staged.targetVersion });
    const result = await safeExecFile('sudo', ['apt-get', 'install', '-y', `auxiora=${staged.targetVersion}`]);
    if (result.status === 'error') {
      throw new Error(`apt-get install failed: ${result.stderr}`);
    }
  }

  async restart(_info: InstallationInfo): Promise<void> {
    logger.info('Restarting auxiora systemd service');
    const result = await safeExecFile('sudo', ['systemctl', 'restart', 'auxiora']);
    if (result.status === 'error') {
      throw new Error(`systemctl restart failed: ${result.stderr}`);
    }
  }

  async rollback(staged: StagedUpdate): Promise<void> {
    logger.info('Rolling back apt package', { version: staged.previousVersion });
    const result = await safeExecFile('sudo', ['apt-get', 'install', '-y', `auxiora=${staged.previousVersion}`]);
    if (result.status === 'error') {
      throw new Error(`apt-get rollback failed: ${result.stderr}`);
    }
  }

  async cleanup(_staged: StagedUpdate): Promise<void> {
    // No-op: apt manages its own cache
  }
}
