import { getLogger } from '@auxiora/logger';
import type { UpdateStrategy, InstallMethod, UpdateCheckResult, InstallationInfo, StagedUpdate } from '../types.js';
import { safeExecFile } from '../util/exec.js';

const logger = getLogger('updater:strategies:k8s');

const IMAGE_BASE = 'ghcr.io/trollbyte/auxiora';
const DEPLOYMENT = 'auxiora';

export class K8sStrategy implements UpdateStrategy {
  readonly method: InstallMethod = 'k8s';

  async stage(target: UpdateCheckResult, info: InstallationInfo): Promise<StagedUpdate> {
    logger.info('Validating kubernetes deployment exists');
    const result = await safeExecFile('kubectl', ['get', 'deployment', DEPLOYMENT, '-o', 'json']);
    if (result.status === 'error') {
      throw new Error(`kubectl get deployment failed: ${result.stderr}`);
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
    const newImage = `${IMAGE_BASE}:v${staged.targetVersion}`;
    logger.info('Updating kubernetes deployment image', { image: newImage });

    const result = await safeExecFile('kubectl', [
      'set', 'image',
      `deployment/${DEPLOYMENT}`,
      `${DEPLOYMENT}=${newImage}`,
    ]);
    if (result.status === 'error') {
      throw new Error(`kubectl set image failed: ${result.stderr}`);
    }
  }

  async restart(_info: InstallationInfo): Promise<void> {
    logger.info('Restarting kubernetes deployment');
    const result = await safeExecFile('kubectl', ['rollout', 'restart', `deployment/${DEPLOYMENT}`]);
    if (result.status === 'error') {
      throw new Error(`kubectl rollout restart failed: ${result.stderr}`);
    }
  }

  async rollback(_staged: StagedUpdate): Promise<void> {
    logger.info('Undoing kubernetes deployment rollout');
    const result = await safeExecFile('kubectl', ['rollout', 'undo', `deployment/${DEPLOYMENT}`]);
    if (result.status === 'error') {
      throw new Error(`kubectl rollout undo failed: ${result.stderr}`);
    }
  }

  async cleanup(_staged: StagedUpdate): Promise<void> {
    // No-op: kubernetes manages its own resources
  }
}
