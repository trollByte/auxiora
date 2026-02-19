import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';

const logger = getLogger('updater:strategies:docker');

const IMAGE_BASE = 'ghcr.io/trollbyte/auxiora';
const CONTAINER_NAME = 'auxiora';

export class DockerStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'docker';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    const imageTag = `${IMAGE_BASE}:v${target.latestVersion}`;
    logger.info('Pulling docker image', { image: imageTag });

    const result = await safeExecFile('docker', ['pull', imageTag]);
    if (result.status === 'error') {
      throw new Error(`docker pull failed: ${result.stderr}`);
    }

    return {
      targetVersion: target.latestVersion,
      previousVersion: info.currentVersion,
      backupPath: '',
      stagedPath: imageTag,
      method: this.method,
      timestamp: Date.now(),
    };
  }

  async apply(staged: StagedUpdate): Promise<void> {
    const newImage = `${IMAGE_BASE}:v${staged.targetVersion}`;
    logger.info('Deploying new docker container', { image: newImage });

    const stopResult = await safeExecFile('docker', ['stop', CONTAINER_NAME]);
    if (stopResult.status === 'error') {
      throw new Error(`docker stop failed: ${stopResult.stderr}`);
    }

    const rmResult = await safeExecFile('docker', ['rm', CONTAINER_NAME]);
    if (rmResult.status === 'error') {
      throw new Error(`docker rm failed: ${rmResult.stderr}`);
    }

    const runResult = await safeExecFile('docker', [
      'run', '-d',
      '--name', CONTAINER_NAME,
      '--restart', 'unless-stopped',
      newImage,
    ]);
    if (runResult.status === 'error') {
      throw new Error(`docker run failed: ${runResult.stderr}`);
    }
  }

  async restart(_info: InstallationInfo): Promise<void> {
    // Implicit: a new container was started during apply()
    logger.info('Docker container restart is implicit via apply()');
  }

  async rollback(staged: StagedUpdate): Promise<void> {
    const prevImage = `${IMAGE_BASE}:v${staged.previousVersion}`;
    logger.info('Rolling back docker container', { image: prevImage });

    const stopResult = await safeExecFile('docker', ['stop', CONTAINER_NAME]);
    if (stopResult.status === 'error') {
      throw new Error(`docker stop failed: ${stopResult.stderr}`);
    }

    const rmResult = await safeExecFile('docker', ['rm', CONTAINER_NAME]);
    if (rmResult.status === 'error') {
      throw new Error(`docker rm failed: ${rmResult.stderr}`);
    }

    const runResult = await safeExecFile('docker', [
      'run', '-d',
      '--name', CONTAINER_NAME,
      '--restart', 'unless-stopped',
      prevImage,
    ]);
    if (runResult.status === 'error') {
      throw new Error(`docker run rollback failed: ${runResult.stderr}`);
    }
  }

  async cleanup(_staged: StagedUpdate): Promise<void> {
    logger.info('Pruning unused docker images');
    await safeExecFile('docker', ['image', 'prune', '-f']);
  }
}
