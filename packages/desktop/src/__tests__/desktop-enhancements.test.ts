import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BridgeMessage, CapabilityRequestPayload } from '@auxiora/bridge';
import type { TauriBridge } from '../app.js';
import type { DesktopTransport } from '../desktop-node.js';
import { DesktopNode } from '../desktop-node.js';
import { MenuBarApp } from '../menu-bar.js';

// --- Mock Transport ---

function makeMockTransport(): DesktopTransport & {
  sent: string[];
  handlers: Record<string, Function>;
  simulateOpen(): void;
  simulateMessage(msg: BridgeMessage): void;
  simulateClose(code?: number, reason?: string): void;
} {
  const transport = {
    sent: [] as string[],
    handlers: {} as Record<string, Function>,
    _connected: false,

    connect() { transport._connected = true; },
    send(data: string) { transport.sent.push(data); },
    close() { transport._connected = false; },
    onOpen(h: () => void) { transport.handlers.open = h; },
    onMessage(h: (d: string) => void) { transport.handlers.message = h; },
    onClose(h: (c: number, r: string) => void) { transport.handlers.close = h; },
    onError(h: (e: Error) => void) { transport.handlers.error = h; },
    isConnected() { return transport._connected; },

    simulateOpen() {
      transport._connected = true;
      (transport.handlers.open as () => void)?.();
    },
    simulateMessage(msg: BridgeMessage) {
      (transport.handlers.message as (d: string) => void)?.(JSON.stringify(msg));
    },
    simulateClose(code = 1000, reason = '') {
      transport._connected = false;
      (transport.handlers.close as (c: number, r: string) => void)?.(code, reason);
    },
  };
  return transport;
}

// --- Mock Tauri Bridge ---

function makeMockBridge(): TauriBridge {
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

// --- DesktopNode Tests ---

describe('DesktopNode', () => {
  let transport: ReturnType<typeof makeMockTransport>;
  let bridge: TauriBridge;
  let node: DesktopNode;

  beforeEach(() => {
    transport = makeMockTransport();
    bridge = makeMockBridge();
    node = new DesktopNode(transport, bridge, {
      deviceName: 'Test Desktop',
      capabilities: ['screen', 'notifications', 'clipboard'],
    });
  });

  afterEach(() => {
    node.disconnect();
  });

  it('starts disconnected', () => {
    expect(node.getState()).toBe('disconnected');
    expect(node.getDeviceId()).toBeNull();
  });

  it('connects to bridge server', () => {
    node.connect();
    expect(node.getState()).toBe('connecting');
  });

  it('pairs with bridge server', () => {
    node.connect();
    transport.simulateOpen();
    node.pair('123456');

    expect(transport.sent).toHaveLength(1);
    const msg = JSON.parse(transport.sent[0]) as BridgeMessage;
    expect(msg.type).toBe('pair_request');
    const payload = msg.payload as any;
    expect(payload.code).toBe('123456');
    expect(payload.deviceName).toBe('Test Desktop');
    expect(payload.capabilities).toEqual(['screen', 'notifications', 'clipboard']);
  });

  it('handles pair acceptance', () => {
    node.connect();
    transport.simulateOpen();
    node.pair('123456');

    transport.simulateMessage({
      type: 'pair_accepted',
      deviceId: 'desk-1',
      payload: { deviceId: 'desk-1' },
      timestamp: Date.now(),
    });

    expect(node.getState()).toBe('paired');
    expect(node.getDeviceId()).toBe('desk-1');
  });

  it('handles pair rejection', () => {
    node.connect();
    transport.simulateOpen();
    node.pair('999999');

    transport.simulateMessage({
      type: 'pair_rejected',
      payload: { reason: 'bad code' },
      timestamp: Date.now(),
    });

    expect(node.getState()).toBe('disconnected');
  });

  it('handles notification capability request', async () => {
    node.connect();
    transport.simulateOpen();
    node.pair('123456');
    transport.simulateMessage({
      type: 'pair_accepted',
      deviceId: 'desk-1',
      payload: { deviceId: 'desk-1' },
      timestamp: Date.now(),
    });
    transport.sent.length = 0;

    transport.simulateMessage({
      type: 'capability_request',
      id: 'req-1',
      payload: {
        capability: 'notifications',
        action: 'show',
        params: { title: 'Hello', body: 'World' },
      } satisfies CapabilityRequestPayload,
      timestamp: Date.now(),
    });

    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

    const response = JSON.parse(transport.sent[0]) as BridgeMessage;
    expect(response.type).toBe('capability_response');
    const payload = response.payload as any;
    expect(payload.success).toBe(true);
    expect(bridge.sendNotification).toHaveBeenCalledWith({ title: 'Hello', body: 'World' });
  });

  it('handles screen capture request', async () => {
    node.connect();
    transport.simulateOpen();
    node.pair('123456');
    transport.simulateMessage({
      type: 'pair_accepted',
      deviceId: 'desk-1',
      payload: { deviceId: 'desk-1' },
      timestamp: Date.now(),
    });
    transport.sent.length = 0;

    transport.simulateMessage({
      type: 'capability_request',
      id: 'req-2',
      payload: { capability: 'screen', action: 'capture' } satisfies CapabilityRequestPayload,
      timestamp: Date.now(),
    });

    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

    const response = JSON.parse(transport.sent[0]) as BridgeMessage;
    const payload = response.payload as any;
    expect(payload.success).toBe(true);
    expect(payload.data.captured).toBe(true);
  });

  it('returns error for unsupported capability', async () => {
    node.connect();
    transport.simulateOpen();
    node.pair('123456');
    transport.simulateMessage({
      type: 'pair_accepted',
      deviceId: 'desk-1',
      payload: { deviceId: 'desk-1' },
      timestamp: Date.now(),
    });
    transport.sent.length = 0;

    transport.simulateMessage({
      type: 'capability_request',
      id: 'req-3',
      payload: { capability: 'camera', action: 'capture' } satisfies CapabilityRequestPayload,
      timestamp: Date.now(),
    });

    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

    const response = JSON.parse(transport.sent[0]) as BridgeMessage;
    const payload = response.payload as any;
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('Unsupported capability');
  });

  it('disconnects cleanly', () => {
    node.connect();
    transport.simulateOpen();
    node.disconnect();
    expect(node.getState()).toBe('disconnected');
  });

  it('reports capabilities', () => {
    expect(node.getCapabilities()).toEqual(['screen', 'notifications', 'clipboard']);
  });
});

// --- MenuBarApp Tests ---

describe('MenuBarApp', () => {
  let bridge: TauriBridge;
  let menuBar: MenuBarApp;

  beforeEach(() => {
    bridge = makeMockBridge();
    menuBar = new MenuBarApp(bridge);
  });

  afterEach(async () => {
    await menuBar.destroy();
  });

  it('initializes and shows tray', async () => {
    await menuBar.init();
    expect(bridge.showTray).toHaveBeenCalled();
    expect(menuBar.isVisible()).toBe(true);
  });

  it('sets status', async () => {
    await menuBar.init();
    await menuBar.setStatus('running');
    expect(menuBar.getStatus()).toBe('running');
    expect(menuBar.getStatusText()).toBe('Running');
  });

  it('sets custom status text', async () => {
    await menuBar.setStatus('running', 'Processing...');
    expect(menuBar.getStatusText()).toBe('Processing...');
  });

  it('adds and removes quick actions', () => {
    menuBar.addQuickAction({
      id: 'test',
      label: 'Test Action',
      action: () => {},
    });
    expect(menuBar.getQuickActions()).toHaveLength(1);

    expect(menuBar.removeQuickAction('test')).toBe(true);
    expect(menuBar.getQuickActions()).toHaveLength(0);
  });

  it('returns false for removing unknown action', () => {
    expect(menuBar.removeQuickAction('nonexistent')).toBe(false);
  });

  it('builds menu items with status and quick actions', () => {
    menuBar.addQuickAction({
      id: 'new-chat',
      label: 'New Chat',
      shortcut: 'Cmd+N',
      action: () => {},
    });

    const items = menuBar.buildMenuItems();
    expect(items[0].id).toBe('status');
    expect(items.find((i) => i.id === 'action-new-chat')).toBeDefined();
    expect(items.find((i) => i.id === 'quit')).toBeDefined();
  });

  it('toggles visibility', async () => {
    await menuBar.init();
    await menuBar.setVisible(false);
    expect(menuBar.isVisible()).toBe(false);
    expect(bridge.hideTray).toHaveBeenCalled();

    await menuBar.setVisible(true);
    expect(menuBar.isVisible()).toBe(true);
  });

  it('destroys cleanly', async () => {
    await menuBar.init();
    await menuBar.destroy();
    expect(menuBar.isVisible()).toBe(false);
    expect(menuBar.getQuickActions()).toHaveLength(0);
  });

  it('does not show tray if config disabled', async () => {
    const mb = new MenuBarApp(bridge, { showStatusIcon: false });
    await mb.init();
    expect(mb.isVisible()).toBe(false);
    expect(bridge.showTray).not.toHaveBeenCalled();
  });
});
