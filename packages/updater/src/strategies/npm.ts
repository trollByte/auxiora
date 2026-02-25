import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';

const logger = getLogger('updater:strategies:npm');

export class NpmStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'npm';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    const timestamp = Date.now();
    const stagingDir = path.join(os.tmpdir(), `auxiora-update-npm-${timestamp}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    logger.info('Staging npm package', { version: target.latestVersion });
    const result = await safeExecFile('npm', ['pack', `auxiora@${target.latestVersion}`], { cwd: stagingDir });
    if (result.status === 'error') {
      throw new Error(`npm pack failed: ${result.stderr}`);
    }

    return {
      targetVersion: target.latestVersion,
      previousVersion: info.currentVersion,
      backupPath: path.join(stagingDir, 'backup'),
      stagedPath: stagingDir,
      method: this.method,
      timestamp,
    };
  }

  async apply(staged: StagedUpdate): Promise<void> {
    logger.info('Installing npm package globally', { version: staged.targetVersion });
    const result = await safeExecFile('npm', ['install', '-g', `auxiora@${staged.targetVersion}`]);
    if (result.status === 'error') {
      throw new Error(`npm install failed: ${result.stderr}`);
    }
  }

  async restart(_info: InstallationInfo): Promise<void> {
    logger.info('Restarting gateway process');
    await safeExecFile('pkill', ['-f', 'auxiora-gateway']);
  }

  async rollback(staged: StagedUpdate): Promise<void> {
    logger.info('Rolling back npm package', { version: staged.previousVersion });
    const result = await safeExecFile('npm', ['install', '-g', `auxiora@${staged.previousVersion}`]);
    if (result.status === 'error') {
      throw new Error(`npm rollback failed: ${result.stderr}`);
    }
  }

  async cleanup(staged: StagedUpdate): Promise<void> {
    logger.info('Cleaning up npm staging directory');
    await safeExecFile('rm', ['-rf', staged.stagedPath]);
  }
}
