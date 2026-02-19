import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TarballStrategy } from '../../src/strategies/tarball.js';
import type { UpdateCheckResult, InstallationInfo } from '../../src/types.js';

// Mock dependencies
vi.mock('node:fs');
vi.mock('../../src/util/exec.js');
vi.mock('../../src/util/download.js');

import * as fs from 'node:fs';
import { safeExecFile } from '../../src/util/exec.js';
import { downloadFile } from '../../src/util/download.js';

const mockTarget: UpdateCheckResult = {
  available: true,
  currentVersion: '1.3.0',
  latestVersion: '2.0.0',
  channel: 'stable',
  releaseUrl: 'https://github.com/trollByte/auxiora/releases/tag/v2.0.0',
  releaseNotes: 'New release',
  publishedAt: Date.now(),
  assets: [{ name: 'auxiora-2.0.0-linux-x64.tar.gz', url: 'https://example.com/a.tar.gz', size: 1000, contentType: 'application/gzip' }],
};

const mockInfo: InstallationInfo = {
  method: 'tarball',
  currentVersion: '1.3.0',
  installPath: '/opt/auxiora',
  canSelfUpdate: true,
  requiresSudo: false,
};

describe('TarballStrategy', () => {
  let strategy: TarballStrategy;

  beforeEach(() => {
    strategy = new TarballStrategy();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(safeExecFile).mockResolvedValue({ status: 'ok', stdout: '', stderr: '', exitCode: 0 });
    vi.mocked(downloadFile).mockResolvedValue('/tmp/auxiora-update/a.tar.gz');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stage downloads the tarball asset', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);
    expect(downloadFile).toHaveBeenCalledWith(
      'https://example.com/a.tar.gz',
      expect.stringContaining('auxiora-2.0.0-linux-x64.tar.gz'),
    );
    expect(staged.targetVersion).toBe('2.0.0');
    expect(staged.previousVersion).toBe('1.3.0');
    expect(staged.method).toBe('tarball');
  });

  it('stage throws when no .tar.gz asset found', async () => {
    const noAssets = { ...mockTarget, assets: [] };
    await expect(strategy.stage(noAssets, mockInfo)).rejects.toThrow('.tar.gz');
  });

  it('apply backs up and extracts tarball', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);
    await strategy.apply(staged);

    // Should have called safeExecFile for cp (backup) and tar (extract)
    expect(safeExecFile).toHaveBeenCalledWith('cp', expect.arrayContaining(['-a']));
    expect(safeExecFile).toHaveBeenCalledWith('tar', expect.arrayContaining(['-xzf']));
  });

  it('rollback restores backup', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);
    await strategy.rollback(staged);

    expect(safeExecFile).toHaveBeenCalledWith('rm', expect.arrayContaining(['-rf']));
    expect(safeExecFile).toHaveBeenCalledWith('mv', expect.any(Array));
  });

  it('cleanup removes staging directory', async () => {
    const staged = await strategy.stage(mockTarget, mockInfo);
    await strategy.cleanup(staged);

    expect(safeExecFile).toHaveBeenCalledWith('rm', expect.arrayContaining(['-rf']));
  });
});
