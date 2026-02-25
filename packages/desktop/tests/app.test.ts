import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesktopApp } from '../src/app.js';
import type { TauriBridge } from '../src/app.js';
import { DEFAULT_DESKTOP_CONFIG } from '../src/types.js';

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

describe('DesktopApp', () => {
  let app: DesktopApp;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    app = new DesktopApp({ bridge, version: '1.0.0' });
  });

  it('should initialize with default config', () => {
    expect(app.getStatus()).toBe('initializing');
    expect(app.getConfig()).toEqual(DEFAULT_DESKTOP_CONFIG);
  });

  it('should init and become running', async () => {
    await app.init();
    expect(app.getStatus()).toBe('running');
    expect(bridge.setAutoStart).toHaveBeenCalledWith(false);
    expect(bridge.registerHotkey).toHaveBeenCalled();
  });

  it('should setup tray menu', async () => {
    const items = await app.setupTray();
    expect(items.length).toBeGreaterThan(0);
    expect(items.find(i => i.id === 'show')).toBeDefined();
    expect(items.find(i => i.id === 'quit')).toBeDefined();
  });

  it('should register global hotkey', async () => {
    await app.registerHotkey('Ctrl+Shift+A');
    expect(bridge.registerHotkey).toHaveBeenCalledWith('Ctrl+Shift+A', 'global-toggle');
  });

  it('should check for updates', async () => {
    const available = await app.checkUpdates();
    expect(available).toBe(false);
    expect(bridge.checkForUpdate).toHaveBeenCalled();
  });

  it('should shutdown gracefully', async () => {
    await app.init();
    await app.shutdown();
    expect(app.getStatus()).toBe('initializing');
    expect(bridge.unregisterHotkey).toHaveBeenCalled();
  });

  it('should accept custom config', () => {
    const config = { ...DEFAULT_DESKTOP_CONFIG, autoStart: true, hotkey: 'Ctrl+Alt+A' };
    const customApp = new DesktopApp({ bridge, config });
    expect(customApp.getConfig().autoStart).toBe(true);
    expect(customApp.getConfig().hotkey).toBe('Ctrl+Alt+A');
  });

  it('should start ollama when enabled and detected', async () => {
    (bridge.detectOllama as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const config = { ...DEFAULT_DESKTOP_CONFIG, ollamaEnabled: true };
    const ollamaApp = new DesktopApp({ bridge, config });
    await ollamaApp.init();
    expect(bridge.detectOllama).toHaveBeenCalled();
    expect(bridge.startOllama).toHaveBeenCalled();
  });

  it('should not crash when ollama start fails', async () => {
    (bridge.detectOllama as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (bridge.startOllama as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    const config = { ...DEFAULT_DESKTOP_CONFIG, ollamaEnabled: true };
    const ollamaApp = new DesktopApp({ bridge, config });
    await ollamaApp.init();
    expect(ollamaApp.getStatus()).toBe('running');
  });

  it('should stop ollama on shutdown if running', async () => {
    (bridge.detectOllama as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const config = { ...DEFAULT_DESKTOP_CONFIG, ollamaEnabled: true };
    const ollamaApp = new DesktopApp({ bridge, config });
    await ollamaApp.init();
    await ollamaApp.shutdown();
    expect(bridge.stopOllama).toHaveBeenCalled();
  });
});
