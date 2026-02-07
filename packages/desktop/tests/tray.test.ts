import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrayManager } from '../src/tray.js';
import type { TauriBridge } from '../src/app.js';
import type { TrayMenuItem } from '../src/types.js';

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
    checkForUpdate: vi.fn().mockResolvedValue({ version: '1.0.0', available: false }),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    promptRestart: vi.fn().mockResolvedValue(false),
    rollbackUpdate: vi.fn().mockResolvedValue(undefined),
    detectOllama: vi.fn().mockResolvedValue(false),
    startOllama: vi.fn().mockResolvedValue(undefined),
    stopOllama: vi.fn().mockResolvedValue(undefined),
    listOllamaModels: vi.fn().mockResolvedValue([]),
    setAutoStart: vi.fn().mockResolvedValue(undefined),
  };
}

describe('TrayManager', () => {
  let tray: TrayManager;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    tray = new TrayManager(bridge);
  });

  it('should build a menu', () => {
    const items: TrayMenuItem[] = [
      { id: 'show', label: 'Show', enabled: true },
      { id: 'quit', label: 'Quit', enabled: true },
    ];
    const result = tray.buildMenu(items);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('show');
  });

  it('should return current menu via getMenu', () => {
    const items: TrayMenuItem[] = [{ id: 'test', label: 'Test', enabled: true }];
    tray.buildMenu(items);
    expect(tray.getMenu()).toEqual(items);
  });

  it('should update badge count', () => {
    tray.updateBadge(5);
    expect(tray.getBadge()).toBe(5);
    expect(bridge.setTrayBadge).toHaveBeenCalledWith(5);
  });

  it('should clamp badge to zero', () => {
    tray.updateBadge(-3);
    expect(tray.getBadge()).toBe(0);
  });

  it('should send quick reply', async () => {
    await tray.quickReply('Hello');
    expect(bridge.sendQuickReply).toHaveBeenCalledWith('Hello');
  });

  it('should reject empty quick reply', async () => {
    await expect(tray.quickReply('   ')).rejects.toThrow('empty');
  });

  it('should show and hide tray', async () => {
    await tray.show();
    expect(bridge.showTray).toHaveBeenCalled();
    await tray.hide();
    expect(bridge.hideTray).toHaveBeenCalled();
  });
});
