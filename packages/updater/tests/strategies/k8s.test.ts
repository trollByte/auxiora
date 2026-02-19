import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { K8sStrategy } from '../../src/strategies/k8s.js';
import type { UpdateCheckResult, InstallationInfo, StagedUpdate } from '../../src/types.js';

vi.mock('../../src/util/exec.js');

import { safeExecFile } from '../../src/util/exec.js';

const mockTarget: UpdateCheckResult = {
  available: true,
  currentVersion: '1.3.0',
  latestVersion: '2.0.0',
  channel: 'stable',
  releaseUrl: 'https://github.com/trollByte/auxiora/releases/tag/v2.0.0',
  releaseNotes: 'New release',
  publishedAt: Date.now(),
  assets: [],
};

const mockInfo: InstallationInfo = {
  method: 'k8s',
  currentVersion: '1.3.0',
  installPath: '',
  canSelfUpdate: true,
  requiresSudo: false,
};

describe('K8sStrategy', () => {
  let strategy: K8sStrategy;

  beforeEach(() => {
    strategy = new K8sStrategy();
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '{}', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage validates deployment exists via kubectl get', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('kubectl', ['get', 'deployment', 'auxiora', '-o', 'json']);
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('k8s');
  });

  it('apply runs kubectl set image with correct image tag', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'k8s',
      timestamp: Date.now(),
    };

    await strategy.apply(staged);

    expect(safeExecFile).toHaveBeenCalledWith('kubectl', [
      'set', 'image',
      'deployment/auxiora',
      'auxiora=ghcr.io/trollbyte/auxiora:v2.0.0',
    ]);
  });

  it('rollback runs kubectl rollout undo', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'k8s',
      timestamp: Date.now(),
    };

    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('kubectl', ['rollout', 'undo', 'deployment/auxiora']);
  });

  it('restart runs kubectl rollout restart', async () => {
    await strategy.restart(mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('kubectl', ['rollout', 'restart', 'deployment/auxiora']);
  });

  it('stage throws when kubectl get deployment fails', async () => {
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'error', stdout: '', stderr: 'not found', exitCode: 1 });

    await expect(strategy.stage(mockTarget, mockInfo)).rejects.toThrow('kubectl get deployment failed');
  });
});
