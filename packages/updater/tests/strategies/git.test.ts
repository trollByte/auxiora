import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitStrategy } from '../../src/strategies/git.js';
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
  method: 'git',
  currentVersion: '1.3.0',
  installPath: '/opt/auxiora',
  canSelfUpdate: true,
  requiresSudo: false,
};

describe('GitStrategy', () => {
  let strategy: GitStrategy;

  beforeEach(() => {
    strategy = new GitStrategy();
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage runs git fetch --tags in install dir', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith(
      'git',
      ['fetch', '--tags'],
      expect.objectContaining({ cwd: '/opt/auxiora' }),
    );
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('git');
  });

  it('apply runs git checkout, pnpm install, pnpm build', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '/opt/auxiora',
      method: 'git',
      timestamp: Date.now(),
    };

    await strategy.apply(staged);

    expect(safeExecFile).toHaveBeenCalledWith('git', ['checkout', 'v2.0.0'], expect.objectContaining({ cwd: '/opt/auxiora' }));
    expect(safeExecFile).toHaveBeenCalledWith('pnpm', ['install'], expect.objectContaining({ cwd: '/opt/auxiora' }));
    expect(safeExecFile).toHaveBeenCalledWith('pnpm', ['build'], expect.objectContaining({ cwd: '/opt/auxiora' }));
  });

  it('rollback runs git checkout with previous version, pnpm install, pnpm build', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '/opt/auxiora',
      method: 'git',
      timestamp: Date.now(),
    };

    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('git', ['checkout', 'v1.3.0'], expect.objectContaining({ cwd: '/opt/auxiora' }));
    expect(safeExecFile).toHaveBeenCalledWith('pnpm', ['install'], expect.objectContaining({ cwd: '/opt/auxiora' }));
    expect(safeExecFile).toHaveBeenCalledWith('pnpm', ['build'], expect.objectContaining({ cwd: '/opt/auxiora' }));
  });

  it('restart calls pkill with auxiora-gateway', async () => {
    await strategy.restart(mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('pkill', ['-f', 'auxiora-gateway']);
  });

  it('stage throws when git fetch fails', async () => {
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'error', stdout: '', stderr: 'network error', exitCode: 1 });

    await expect(strategy.stage(mockTarget, mockInfo)).rejects.toThrow('git fetch failed');
  });
});
