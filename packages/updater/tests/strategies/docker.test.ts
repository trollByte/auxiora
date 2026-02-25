import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DockerStrategy } from '../../src/strategies/docker.js';
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
  method: 'docker',
  currentVersion: '1.3.0',
  installPath: '/var/lib/docker/containers',
  canSelfUpdate: true,
  requiresSudo: false,
};

describe('DockerStrategy', () => {
  let strategy: DockerStrategy;

  beforeEach(() => {
    strategy = new DockerStrategy();
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage pulls the correct docker image', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('docker', ['pull', 'ghcr.io/trollbyte/auxiora:v2.0.0']);
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('docker');
  });

  it('apply stops, removes, and runs new container', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: 'ghcr.io/trollbyte/auxiora:v2.0.0',
      method: 'docker',
      timestamp: Date.now(),
    };

    await strategy.apply(staged);

    expect(safeExecFile).toHaveBeenCalledWith('docker', ['stop', 'auxiora']);
    expect(safeExecFile).toHaveBeenCalledWith('docker', ['rm', 'auxiora']);
    expect(safeExecFile).toHaveBeenCalledWith('docker', [
      'run', '-d',
      '--name', 'auxiora',
      '--restart', 'unless-stopped',
      'ghcr.io/trollbyte/auxiora:v2.0.0',
    ]);
  });

  it('rollback stops, removes, and runs previous container', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: 'ghcr.io/trollbyte/auxiora:v2.0.0',
      method: 'docker',
      timestamp: Date.now(),
    };

    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('docker', ['stop', 'auxiora']);
    expect(safeExecFile).toHaveBeenCalledWith('docker', ['rm', 'auxiora']);
    expect(safeExecFile).toHaveBeenCalledWith('docker', [
      'run', '-d',
      '--name', 'auxiora',
      '--restart', 'unless-stopped',
      'ghcr.io/trollbyte/auxiora:v1.3.0',
    ]);
  });

  it('cleanup prunes unused docker images', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'docker',
      timestamp: Date.now(),
    };

    await strategy.cleanup(staged);

    expect(safeExecFile).toHaveBeenCalledWith('docker', ['image', 'prune', '-f']);
  });

  it('stage throws when docker pull fails', async () => {
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'error', stdout: '', stderr: 'manifest unknown', exitCode: 1 });

    await expect(strategy.stage(mockTarget, mockInfo)).rejects.toThrow('docker pull failed');
  });
});
