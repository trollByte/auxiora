import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AptStrategy } from '../../src/strategies/apt.js';
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
  method: 'apt',
  currentVersion: '1.3.0',
  installPath: '/usr/bin/auxiora',
  canSelfUpdate: true,
  requiresSudo: true,
};

describe('AptStrategy', () => {
  let strategy: AptStrategy;

  beforeEach(() => {
    strategy = new AptStrategy();
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage runs sudo apt-get update', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('sudo', ['apt-get', 'update']);
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('apt');
  });

  it('apply runs sudo apt-get install with correct version', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'apt',
      timestamp: Date.now(),
    };

    await strategy.apply(staged);

    expect(safeExecFile).toHaveBeenCalledWith('sudo', ['apt-get', 'install', '-y', 'auxiora=2.0.0']);
  });

  it('rollback runs sudo apt-get install with previous version', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'apt',
      timestamp: Date.now(),
    };

    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('sudo', ['apt-get', 'install', '-y', 'auxiora=1.3.0']);
  });

  it('restart runs sudo systemctl restart auxiora', async () => {
    await strategy.restart(mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('sudo', ['systemctl', 'restart', 'auxiora']);
  });

  it('stage throws when apt-get update fails', async () => {
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'error', stdout: '', stderr: 'permission denied', exitCode: 1 });

    await expect(strategy.stage(mockTarget, mockInfo)).rejects.toThrow('apt-get update failed');
  });
});
