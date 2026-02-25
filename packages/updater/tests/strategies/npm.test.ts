import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NpmStrategy } from '../../src/strategies/npm.js';
import type { UpdateCheckResult, InstallationInfo, StagedUpdate } from '../../src/types.js';

vi.mock('node:fs');
vi.mock('../../src/util/exec.js');

import * as fs from 'node:fs';
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
  method: 'npm',
  currentVersion: '1.3.0',
  installPath: '/usr/local/lib/node_modules/auxiora',
  canSelfUpdate: true,
  requiresSudo: false,
};

describe('NpmStrategy', () => {
  let strategy: NpmStrategy;

  beforeEach(() => {
    strategy = new NpmStrategy();
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage runs npm pack with correct version', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith(
      'npm',
      ['pack', 'auxiora@2.0.0'],
      expect.objectContaining({ cwd: expect.any(String) }),
    );
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('npm');
  });

  it('apply runs npm install -g with correct version', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '/tmp/auxiora-update-npm-123',
      method: 'npm',
      timestamp: Date.now(),
    };

    await strategy.apply(staged);

    expect(safeExecFile).toHaveBeenCalledWith('npm', ['install', '-g', 'auxiora@2.0.0']);
  });

  it('rollback runs npm install -g with previous version', async () => {
    const staged: StagedUpdate = {
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '',
      stagedPath: '/tmp/auxiora-update-npm-123',
      method: 'npm',
      timestamp: Date.now(),
    };

    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('npm', ['install', '-g', 'auxiora@1.3.0']);
  });

  it('restart calls pkill with auxiora-gateway', async () => {
    await strategy.restart(mockInfo);

    expect(safeExecFile).toHaveBeenCalledWith('pkill', ['-f', 'auxiora-gateway']);
  });

  it('stage throws when npm pack fails', async () => {
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'error', stdout: '', stderr: 'not found', exitCode: 1 });

    await expect(strategy.stage(mockTarget, mockInfo)).rejects.toThrow('npm pack failed');
  });
});
