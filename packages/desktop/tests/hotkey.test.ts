import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('HotkeyManager', () => {
  let hotkeys: HotkeyManager;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    hotkeys = new HotkeyManager(bridge);
  });

  it('should register a hotkey', async () => {
    const action = vi.fn();
    await hotkeys.register({ id: 'toggle', combo: 'Ctrl+Space', description: 'Toggle', action });
    expect(bridge.registerHotkey).toHaveBeenCalledWith('Ctrl+Space', 'toggle');
    expect(hotkeys.has('toggle')).toBe(true);
  });

  it('should reject duplicate registration', async () => {
    const action = vi.fn();
    await hotkeys.register({ id: 'toggle', combo: 'Ctrl+Space', description: 'Toggle', action });
    await expect(
      hotkeys.register({ id: 'toggle', combo: 'Ctrl+X', description: 'Other', action }),
    ).rejects.toThrow('already registered');
  });

  it('should unregister a hotkey', async () => {
    const action = vi.fn();
    await hotkeys.register({ id: 'toggle', combo: 'Ctrl+Space', description: 'Toggle', action });
    const removed = await hotkeys.unregister('toggle');
    expect(removed).toBe(true);
    expect(hotkeys.has('toggle')).toBe(false);
    expect(bridge.unregisterHotkey).toHaveBeenCalledWith('Ctrl+Space');
  });

  it('should return false when unregistering unknown hotkey', async () => {
    const removed = await hotkeys.unregister('nonexistent');
    expect(removed).toBe(false);
  });

  it('should unregister all hotkeys', async () => {
    const action = vi.fn();
    await hotkeys.register({ id: 'a', combo: 'Ctrl+A', description: 'A', action });
    await hotkeys.register({ id: 'b', combo: 'Ctrl+B', description: 'B', action });
    await hotkeys.unregisterAll();
    expect(hotkeys.getBindings()).toHaveLength(0);
  });

  it('should list all bindings', async () => {
    const action = vi.fn();
    await hotkeys.register({ id: 'a', combo: 'Ctrl+A', description: 'A', action });
    await hotkeys.register({ id: 'b', combo: 'Ctrl+B', description: 'B', action });
    expect(hotkeys.getBindings()).toHaveLength(2);
  });

  it('should trigger a hotkey action', async () => {
    const action = vi.fn();
    await hotkeys.register({ id: 'test', combo: 'Ctrl+T', description: 'Test', action });
    await hotkeys.trigger('test');
    expect(action).toHaveBeenCalled();
  });

  it('should throw when triggering unknown hotkey', async () => {
    await expect(hotkeys.trigger('unknown')).rejects.toThrow('No hotkey binding');
  });
});
