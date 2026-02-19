import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrewStrategy } from '../../src/strategies/brew.js';
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
  method: 'brew',
  currentVersion: '1.3.0',
  installPath: '/opt/homebrew/opt/auxiora',
  canSelfUpdate: true,
  requiresSudo: false,
};

describe('BrewStrategy', () => {
  let strategy: BrewStrategy;

  beforeEach(() => {
    strategy = new BrewStrategy();
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage runs brew fetch auxiora', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('brew', ['fetch', 'auxiora']);
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('brew');
  });

  it('apply runs brew upgrade auxiora', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'brew',
      timestamp: Date.now(),
    };

    await strategy.apply(staged);

    expect(safeExecFile).toHaveBeenCalledWith('brew', ['upgrade', 'auxiora']);
  });

  it('rollback runs brew install with previous version', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '',
      method: 'brew',
      timestamp: Date.now(),
    };

    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('brew', ['install', 'auxiora@1.3.0']);
  });

  it('restart calls pkill with auxiora-gateway', async () => {
    await strategy.restart(mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('pkill', ['-f', 'auxiora-gateway']);
  });

  it('stage throws when brew fetch fails', async () => {
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'error', stdout: '', stderr: 'formula not found', exitCode: 1 });

    await expect(strategy.stage(mockTarget, mockInfo)).rejects.toThrow('brew fetch failed');
  });
});
