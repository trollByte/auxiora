import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PttOverlay, DEFAULT_PTT_CONFIG } from '../src/ptt-overlay.js';
import { HotkeyManager } from '../src/hotkey.js';
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

describe('PttOverlay', () => {
  let ptt: PttOverlay;
  let hotkeys: HotkeyManager;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    hotkeys = new HotkeyManager(bridge);
    ptt = new PttOverlay(hotkeys, { enabled: true });
  });

  describe('defaults', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_PTT_CONFIG.enabled).toBe(false);
      expect(DEFAULT_PTT_CONFIG.hotkey).toBe('CmdOrCtrl+Shift+Space');
      expect(DEFAULT_PTT_CONFIG.showOverlay).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('should start in idle state', () => {
      expect(ptt.getState()).toBe('idle');
      expect(ptt.isRegistered()).toBe(false);
    });

    it('should register the PTT hotkey', async () => {
      await ptt.register();
      expect(ptt.isRegistered()).toBe(true);
      expect(hotkeys.has('ptt-toggle')).toBe(true);
      expect(bridge.registerHotkey).toHaveBeenCalledWith('CmdOrCtrl+Shift+Space', 'ptt-toggle');
    });

    it('should throw on duplicate registration', async () => {
      await ptt.register();
      await expect(ptt.register()).rejects.toThrow('already registered');
    });

    it('should unregister the PTT hotkey', async () => {
      await ptt.register();
      await ptt.unregister();
      expect(ptt.isRegistered()).toBe(false);
      expect(hotkeys.has('ptt-toggle')).toBe(false);
    });

    it('should ignore unregister if not registered', async () => {
      await expect(ptt.unregister()).resolves.not.toThrow();
    });

    it('should return config copy', () => {
      const config = ptt.getConfig();
      expect(config.hotkey).toBe('CmdOrCtrl+Shift+Space');
      expect(config.showOverlay).toBe(true);
    });

    it('should use custom hotkey from config', async () => {
      const customPtt = new PttOverlay(hotkeys, {
        enabled: true,
        hotkey: 'Alt+V',
      });
      await customPtt.register();
      expect(bridge.registerHotkey).toHaveBeenCalledWith('Alt+V', 'ptt-toggle');
      await customPtt.unregister();
    });
  });

  describe('toggle recording', () => {
    it('should start recording on first press', async () => {
      const onPress = vi.fn();
      const onRelease = vi.fn();
      ptt.setCallbacks({ onPress, onRelease });

      await ptt.register();
      await hotkeys.trigger('ptt-toggle');

      expect(ptt.getState()).toBe('recording');
      expect(onPress).toHaveBeenCalledOnce();
      expect(onRelease).not.toHaveBeenCalled();
    });

    it('should stop recording on second press', async () => {
      const onPress = vi.fn();
      const onRelease = vi.fn();
      ptt.setCallbacks({ onPress, onRelease });

      await ptt.register();
      await hotkeys.trigger('ptt-toggle'); // Start
      await hotkeys.trigger('ptt-toggle'); // Stop

      expect(ptt.getState()).toBe('idle');
      expect(onPress).toHaveBeenCalledOnce();
      expect(onRelease).toHaveBeenCalledOnce();
    });

    it('should cycle through multiple start/stop', async () => {
      const onPress = vi.fn();
      const onRelease = vi.fn();
      ptt.setCallbacks({ onPress, onRelease });

      await ptt.register();
      await hotkeys.trigger('ptt-toggle'); // Start 1
      await hotkeys.trigger('ptt-toggle'); // Stop 1
      await hotkeys.trigger('ptt-toggle'); // Start 2
      await hotkeys.trigger('ptt-toggle'); // Stop 2

      expect(onPress).toHaveBeenCalledTimes(2);
      expect(onRelease).toHaveBeenCalledTimes(2);
      expect(ptt.getState()).toBe('idle');
    });

    it('should work without callbacks set', async () => {
      await ptt.register();
      await expect(hotkeys.trigger('ptt-toggle')).resolves.not.toThrow();
      expect(ptt.getState()).toBe('recording');
    });
  });

  describe('overlay visibility', () => {
    it('should not show overlay when idle', () => {
      expect(ptt.isOverlayVisible()).toBe(false);
    });

    it('should show overlay when recording', async () => {
      await ptt.register();
      await hotkeys.trigger('ptt-toggle');
      expect(ptt.isOverlayVisible()).toBe(true);
    });

    it('should hide overlay after stop', async () => {
      await ptt.register();
      await hotkeys.trigger('ptt-toggle'); // Start
      await hotkeys.trigger('ptt-toggle'); // Stop
      expect(ptt.isOverlayVisible()).toBe(false);
    });

    it('should not show overlay when showOverlay is false', async () => {
      const noOverlayPtt = new PttOverlay(hotkeys, {
        enabled: true,
        showOverlay: false,
      });
      await noOverlayPtt.register();
      await hotkeys.trigger('ptt-toggle');
      expect(noOverlayPtt.isOverlayVisible()).toBe(false);
      await noOverlayPtt.unregister();
    });
  });

  describe('unregister during recording', () => {
    it('should stop recording when unregistered during recording', async () => {
      const onRelease = vi.fn();
      ptt.setCallbacks({ onPress: vi.fn(), onRelease });

      await ptt.register();
      await hotkeys.trigger('ptt-toggle'); // Start recording
      expect(ptt.getState()).toBe('recording');

      await ptt.unregister();
      expect(ptt.getState()).toBe('idle');
      expect(onRelease).toHaveBeenCalledOnce();
    });
  });
});
