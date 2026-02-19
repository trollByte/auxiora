import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Updater } from '../src/updater.js';
import type { UpdateStrategy, InstallationInfo, UpdateCheckResult, StagedUpdate, InstallMethod } from '../src/types.js';
import type { HealthCheckResult } from '../src/health-checker.js';

// Mock fs for persist/load
vi.mock('node:fs');
import * as fs from 'node:fs';

function createMockDetector(info: Partial<InstallationInfo> = {}) {
  return {
    detect: vi.fn().mockReturnValue({
      method: 'tarball' as InstallMethod,
      currentVersion: '1.3.0',
      installPath: '/opt/auxiora',
      canSelfUpdate: true,
      requiresSudo: false,
      ...info,
    }),
  };
}

function createMockVersionChecker(available = true) {
  return {
    check: vi.fn().mockResolvedValue({
      available,
      currentVersion: '1.3.0',
      latestVersion: '2.0.0',
      channel: 'stable',
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: Date.now(),
      assets: [{ name: 'a.tar.gz', url: 'https://example.com/a.tar.gz', size: 1000, contentType: 'application/gzip' }],
    } as UpdateCheckResult),
  };
}

function createMockHealthChecker(healthy = true) {
  return {
    waitForHealthy: vi.fn().mockResolvedValue({
      healthy,
      reason: healthy ? undefined : 'Health check failed after 10 attempts -- version 2.0.0 not confirmed',
      attempts: 1,
    } as HealthCheckResult),
  };
}

function createMockStrategy(): UpdateStrategy {
  return {
    method: 'tarball' as InstallMethod,
    stage: vi.fn().mockResolvedValue({
      targetVersion: '2.0.0',
      previousVersion: '1.3.0',
      backupPath: '/tmp/backup',
      stagedPath: '/tmp/staged/a.tar.gz',
      method: 'tarball',
      timestamp: Date.now(),
    } as StagedUpdate),
    apply: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Updater', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);
  });

  it('returns early when no update is available', async () => {
    const strategy = createMockStrategy();
    const updater = new Updater({
      detector: createMockDetector() as any,
      versionChecker: createMockVersionChecker(false) as any,
      healthChecker: createMockHealthChecker() as any,
      strategies: new Map([['tarball', strategy]]),
    });

    const result = await updater.update();
    expect(result.success).toBe(false);
    expect(result.error).toContain('up to date');
    expect(strategy.stage).not.toHaveBeenCalled();
  });

  it('returns early when install method is unknown', async () => {
    const updater = new Updater({
      detector: createMockDetector({ method: 'unknown', canSelfUpdate: false }) as any,
      versionChecker: createMockVersionChecker() as any,
      healthChecker: createMockHealthChecker() as any,
      strategies: new Map(),
    });

    const result = await updater.update();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot self-update');
  });

  it('runs full lifecycle: stage -> apply -> restart -> health -> cleanup', async () => {
    const strategy = createMockStrategy();
    const updater = new Updater({
      detector: createMockDetector() as any,
      versionChecker: createMockVersionChecker() as any,
      healthChecker: createMockHealthChecker() as any,
      strategies: new Map([['tarball', strategy]]),
    });

    const result = await updater.update();
    expect(result.success).toBe(true);
    expect(result.newVersion).toBe('2.0.0');
    expect(result.rolledBack).toBe(false);
    expect(strategy.stage).toHaveBeenCalled();
    expect(strategy.apply).toHaveBeenCalled();
    expect(strategy.restart).toHaveBeenCalled();
    expect(strategy.cleanup).toHaveBeenCalled();
  });

  it('rolls back and restarts when health check fails', async () => {
    const strategy = createMockStrategy();
    const updater = new Updater({
      detector: createMockDetector() as any,
      versionChecker: createMockVersionChecker() as any,
      healthChecker: createMockHealthChecker(false) as any,
      strategies: new Map([['tarball', strategy]]),
    });

    const result = await updater.update();
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(strategy.rollback).toHaveBeenCalled();
    expect(strategy.cleanup).not.toHaveBeenCalled();
  });

  it('persists StagedUpdate to disk before apply', async () => {
    const strategy = createMockStrategy();
    const updater = new Updater({
      detector: createMockDetector() as any,
      versionChecker: createMockVersionChecker() as any,
      healthChecker: createMockHealthChecker() as any,
      strategies: new Map([['tarball', strategy]]),
    });

    await updater.update();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('last-update.json'),
      expect.any(String),
    );
  });

  it('cleans up staged update file on success', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (String(p).includes('last-update.json')) return true;
      return false;
    });

    const strategy = createMockStrategy();
    const updater = new Updater({
      detector: createMockDetector() as any,
      versionChecker: createMockVersionChecker() as any,
      healthChecker: createMockHealthChecker() as any,
      strategies: new Map([['tarball', strategy]]),
    });

    await updater.update();
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('last-update.json'),
    );
  });
});
