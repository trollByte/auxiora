import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';
import { downloadFile } from '../util/download.js';

const logger = getLogger('updater:strategies:tarball');

export class TarballStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'tarball';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    const timestamp = Date.now();
    const stagingDir = path.join(os.tmpdir(), `auxiora-update-${timestamp}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    const asset = target.assets.find(a => a.name.endsWith('.tar.gz'));
    if (!asset) {
      throw new Error('No .tar.gz asset found in release');
    }

    const tarballPath = path.join(stagingDir, asset.name);
    await downloadFile(asset.url, tarballPath);

    return {
      targetVersion: target.latestVersion,
      previousVersion: info.currentVersion,
      backupPath: path.join(stagingDir, 'backup'),
      stagedPath: tarballPath,
      method: this.method,
      timestamp,
    };
  }

  async apply(staged: StagedUpdate): Promise<void> {
    // Create backup of current installation
    fs.mkdirSync(staged.backupPath, { recursive: true });

    // The install path is derived from the staged path's parent
    const installPath = this.getInstallPath();

    // Move current install to backup
    const result = await safeExecFile('cp', ['-a', installPath, path.join(staged.backupPath, 'app')]);
    if (result.status === 'error') {
      throw new Error(`Backup failed: ${result.stderr}`);
    }

    // Extract new version
    const extractResult = await safeExecFile('tar', ['-xzf', staged.stagedPath, '-C', installPath, '--strip-components=1']);
    if (extractResult.status === 'error') {
      throw new Error(`Extract failed: ${extractResult.stderr}`);
    }

    logger.info('Applied tarball update', { version: staged.targetVersion });
  }

  async restart(_info: InstallationInfo): Promise<void> {
    logger.info('Restarting gateway process');
    await safeExecFile('pkill', ['-f', 'auxiora-gateway']);
  }

  async rollback(staged: StagedUpdate): Promise<void> {
    const installPath = this.getInstallPath();
    const backupAppPath = path.join(staged.backupPath, 'app');

    if (fs.existsSync(backupAppPath)) {
      // Remove failed installation
      await safeExecFile('rm', ['-rf', installPath]);
      // Restore backup
      await safeExecFile('mv', [backupAppPath, installPath]);
      logger.info('Rolled back to previous version', { version: staged.previousVersion });
    }
  }

  async cleanup(staged: StagedUpdate): Promise<void> {
    const stagingDir = path.dirname(staged.stagedPath);
    await safeExecFile('rm', ['-rf', stagingDir]);
    logger.info('Cleaned up staging directory');
  }

  private getInstallPath(): string {
    const home = process.env.HOME ?? '';
    const localPath = path.join(home, '.local/lib/auxiora');
    return fs.existsSync(localPath) ? localPath : '/opt/auxiora';
  }
}
