import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';

const logger = getLogger('updater:strategies:git');

export class GitStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'git';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    logger.info('Fetching git tags', { version: target.latestVersion });
    const result = await safeExecFile('git', ['fetch', '--tags'], { cwd: info.installPath });
    if (result.status === 'error') {
      throw new Error(`git fetch failed: ${result.stderr}`);
    }

    return {
      targetVersion: target.latestVersion,
      previousVersion: info.currentVersion,
      backupPath: '',
      stagedPath: info.installPath,
      method: this.method,
      timestamp: Date.now(),
    };
  }

  async apply(staged: StagedUpdate): Promise<void> {
    logger.info('Checking out git tag', { version: staged.targetVersion });

    const checkoutResult = await safeExecFile('git', ['checkout', `v${staged.targetVersion}`], { cwd: staged.stagedPath });
    if (checkoutResult.status === 'error') {
      throw new Error(`git checkout failed: ${checkoutResult.stderr}`);
    }

    const installResult = await safeExecFile('pnpm', ['install'], { cwd: staged.stagedPath });
    if (installResult.status === 'error') {
      throw new Error(`pnpm install failed: ${installResult.stderr}`);
    }

    const buildResult = await safeExecFile('pnpm', ['build'], { cwd: staged.stagedPath });
    if (buildResult.status === 'error') {
      throw new Error(`pnpm build failed: ${buildResult.stderr}`);
    }
  }

  async restart(_info: InstallationInfo): Promise<void> {
    logger.info('Restarting gateway process');
    await safeExecFile('pkill', ['-f', 'auxiora-gateway']);
  }

  async rollback(staged: StagedUpdate): Promise<void> {
    logger.info('Rolling back git checkout', { version: staged.previousVersion });

    const checkoutResult = await safeExecFile('git', ['checkout', `v${staged.previousVersion}`], { cwd: staged.stagedPath });
    if (checkoutResult.status === 'error') {
      throw new Error(`git checkout rollback failed: ${checkoutResult.stderr}`);
    }

    const installResult = await safeExecFile('pnpm', ['install'], { cwd: staged.stagedPath });
    if (installResult.status === 'error') {
      throw new Error(`pnpm install rollback failed: ${installResult.stderr}`);
    }

    const buildResult = await safeExecFile('pnpm', ['build'], { cwd: staged.stagedPath });
    if (buildResult.status === 'error') {
      throw new Error(`pnpm build rollback failed: ${buildResult.stderr}`);
    }
  }

  async cleanup(_staged: StagedUpdate): Promise<void> {
    // No-op: git repo stays in place
  }
}
