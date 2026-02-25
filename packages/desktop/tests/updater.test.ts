import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoUpdater } from '../src/updater.js';
import type { TauriBridge } from '../src/app.js';

function mockBridge(): TauriBridge {
  return {
    showWindow: vi.fn().mockResolvedValue(undefined),
    hideWindow: vi.fn().mockResolvedValue(undefined),
    setWindowTitle: vi.fn().mockResolvedValue(undefined),
    showTray: vi.fn().mockResolvedValue(undefined),
    hideTray: vi.fn().mockResolvedValue(undefined),
    setTrayBadge: vi.fn().mockResolvedValue(undefined),
    sendQuickReply: vi.fn().mockResolvedValue(undefined),
    registerHotkey: vi.fn().mockResolvedValue(undefined),
    unregisterHotkey: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue({
      version: '2.0.0',
      available: true,
      releaseNotes: 'New features',
      downloadUrl: 'https://example.com/update',
      publishedAt: '2026-01-01T00:00:00Z',
    }),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    promptRestart: vi.fn().mockResolvedValue(true),
    rollbackUpdate: vi.fn().mockResolvedValue(undefined),
    detectOllama: vi.fn().mockResolvedValue(false),
    startOllama: vi.fn().mockResolvedValue(undefined),
    stopOllama: vi.fn().mockResolvedValue(undefined),
    listOllamaModels: vi.fn().mockResolvedValue([]),
    setAutoStart: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AutoUpdater', () => {
  let updater: AutoUpdater;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    updater = new AutoUpdater(bridge, '1.0.0', 'stable');
  });

  it('should check for updates', async () => {
    const info = await updater.check();
    expect(info.available).toBe(true);
    expect(info.latestVersion).toBe('2.0.0');
    expect(info.currentVersion).toBe('1.0.0');
    expect(info.channel).toBe('stable');
    expect(bridge.checkForUpdate).toHaveBeenCalledWith('stable');
  });

  it('should store last check result', async () => {
    expect(updater.getLastCheck()).toBeNull();
    await updater.check();
    const last = updater.getLastCheck();
    expect(last).not.toBeNull();
    expect(last!.available).toBe(true);
  });

  it('should change update channel', () => {
    updater.setChannel('beta');
    expect(updater.getChannel()).toBe('beta');
  });

  it('should download update when available', async () => {
    await updater.check();
    await updater.download();
    expect(bridge.downloadUpdate).toHaveBeenCalled();
  });

  it('should reject download when no update available', async () => {
    await expect(updater.download()).rejects.toThrow('No update available');
  });

  it('should prompt restart', async () => {
    const result = await updater.promptRestart();
    expect(result).toBe(true);
    expect(bridge.promptRestart).toHaveBeenCalled();
  });

  it('should rollback update', async () => {
    await updater.rollback();
    expect(bridge.rollbackUpdate).toHaveBeenCalled();
  });
});
