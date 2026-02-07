import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationBridge } from '../src/notifications.js';
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

describe('NotificationBridge', () => {
  let notifications: NotificationBridge;
  let bridge: TauriBridge;

  beforeEach(() => {
    bridge = mockBridge();
    notifications = new NotificationBridge(bridge);
  });

  it('should send notification when focused', async () => {
    notifications.setFocused(true);
    await notifications.send({ title: 'Test', body: 'Hello' });
    expect(bridge.sendNotification).toHaveBeenCalledWith({ title: 'Test', body: 'Hello' });
  });

  it('should queue notification when not focused', async () => {
    notifications.setFocused(false);
    await notifications.send({ title: 'Test', body: 'Hello' });
    expect(bridge.sendNotification).not.toHaveBeenCalled();
    expect(notifications.getQueueSize()).toBe(1);
  });

  it('should flush queue when focused', async () => {
    notifications.setFocused(false);
    await notifications.send({ title: 'A', body: 'First' });
    await notifications.send({ title: 'B', body: 'Second' });
    expect(notifications.getQueueSize()).toBe(2);

    notifications.setFocused(true);
    // Wait for flushQueue to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(bridge.sendNotification).toHaveBeenCalledTimes(2);
    expect(notifications.getQueueSize()).toBe(0);
  });

  it('should clear the queue', async () => {
    notifications.setFocused(false);
    await notifications.send({ title: 'A', body: 'First' });
    notifications.clearQueue();
    expect(notifications.getQueueSize()).toBe(0);
  });

  it('should report focus state', () => {
    expect(notifications.isFocused()).toBe(true);
    notifications.setFocused(false);
    expect(notifications.isFocused()).toBe(false);
  });
});
