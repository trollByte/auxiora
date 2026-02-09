import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BridgeMessage, CapabilityRequestPayload } from '@auxiora/bridge';
import type {
  MobileTransport,
  CameraProvider,
  ScreenProvider,
  LocationProvider,
  NotificationProvider,
} from '../types.js';
import { MobileNode } from '../node.js';

function makeMockTransport(): MobileTransport & {
  sent: string[];
  handlers: {
    open?: () => void;
    message?: (data: string) => void;
    close?: (code: number, reason: string) => void;
    error?: (error: Error) => void;
  };
  simulateOpen(): void;
  simulateMessage(msg: BridgeMessage): void;
  simulateClose(code?: number, reason?: string): void;
} {
  const transport = {
    sent: [] as string[],
    handlers: {} as any,
    _connected: false,

    connect(url: string) {
      transport._connected = true;
    },
    send(data: string) {
      transport.sent.push(data);
    },
    close() {
      transport._connected = false;
    },
    onOpen(handler: () => void) { transport.handlers.open = handler; },
    onMessage(handler: (data: string) => void) { transport.handlers.message = handler; },
    onClose(handler: (code: number, reason: string) => void) { transport.handlers.close = handler; },
    onError(handler: (error: Error) => void) { transport.handlers.error = handler; },
    isConnected() { return transport._connected; },

    simulateOpen() {
      transport._connected = true;
      transport.handlers.open?.();
    },
    simulateMessage(msg: BridgeMessage) {
      transport.handlers.message?.(JSON.stringify(msg));
    },
    simulateClose(code = 1000, reason = '') {
      transport._connected = false;
      transport.handlers.close?.(code, reason);
    },
  };
  return transport;
}

function makeMockCamera(): CameraProvider {
  return {
    async capturePhoto() {
      return { imageData: 'base64data', mimeType: 'image/jpeg', width: 1920, height: 1080 };
    },
    async isAvailable() { return true; },
  };
}

function makeMockLocation(): LocationProvider {
  return {
    async getCurrentLocation() {
      return { latitude: 37.7749, longitude: -122.4194, accuracy: 10, timestamp: Date.now() };
    },
    watchPosition(callback) {
      const id = setInterval(() => {
        callback({ latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() });
      }, 1000);
      return () => clearInterval(id);
    },
    async isAvailable() { return true; },
  };
}

function makeMockNotifications(): NotificationProvider {
  return {
    async show() {},
    async requestPermission() { return true; },
    async isAvailable() { return true; },
  };
}

function makeMockScreen(): ScreenProvider {
  return {
    async captureScreen() {
      return { imageData: 'screendata', mimeType: 'image/png', width: 1170, height: 2532 };
    },
    async isAvailable() { return true; },
  };
}

describe('MobileNode', () => {
  let transport: ReturnType<typeof makeMockTransport>;
  let node: MobileNode;

  beforeEach(() => {
    transport = makeMockTransport();
    node = new MobileNode(transport, {
      deviceName: 'Test Phone',
      platform: 'ios',
      serverUrl: 'ws://localhost:3000/bridge',
    });
  });

  afterEach(() => {
    node.disconnect();
  });

  describe('connection', () => {
    it('starts in disconnected state', () => {
      expect(node.getState()).toBe('disconnected');
    });

    it('connects to server', () => {
      node.connect();
      expect(node.getState()).toBe('connecting');
    });

    it('does not double-connect', () => {
      node.connect();
      node.connect();
      expect(node.getState()).toBe('connecting');
    });

    it('disconnects cleanly', () => {
      node.connect();
      transport.simulateOpen();
      node.disconnect();
      expect(node.getState()).toBe('disconnected');
      expect(node.getDeviceId()).toBeNull();
    });
  });

  describe('pairing', () => {
    it('sends pair request with device info', () => {
      node.connect();
      transport.simulateOpen();
      node.pair('123456');

      expect(transport.sent).toHaveLength(1);
      const msg = JSON.parse(transport.sent[0]) as BridgeMessage;
      expect(msg.type).toBe('pair_request');
      const payload = msg.payload as any;
      expect(payload.code).toBe('123456');
      expect(payload.deviceName).toBe('Test Phone');
      expect(payload.platform).toBe('ios');
    });

    it('transitions to paired on acceptance', () => {
      node.connect();
      transport.simulateOpen();
      node.pair('123456');

      transport.simulateMessage({
        type: 'pair_accepted',
        id: 'req-1',
        deviceId: 'dev-abc',
        payload: { deviceId: 'dev-abc' },
        timestamp: Date.now(),
      });

      expect(node.getState()).toBe('paired');
      expect(node.getDeviceId()).toBe('dev-abc');
    });

    it('transitions to error on rejection', () => {
      node.connect();
      transport.simulateOpen();
      node.pair('999999');

      transport.simulateMessage({
        type: 'pair_rejected',
        payload: { reason: 'Invalid code' },
        timestamp: Date.now(),
      });

      expect(node.getState()).toBe('error');
    });

    it('auto-connects when pairing from disconnected state', () => {
      node.pair('123456');
      expect(node.getState()).toBe('pairing');
    });
  });

  describe('capability registration', () => {
    it('registers camera provider', () => {
      node.setCamera(makeMockCamera());
      expect(node.getCapabilities()).toContain('camera');
    });

    it('registers screen provider', () => {
      node.setScreen(makeMockScreen());
      expect(node.getCapabilities()).toContain('screen');
    });

    it('registers location provider', () => {
      node.setLocation(makeMockLocation());
      expect(node.getCapabilities()).toContain('location');
    });

    it('registers notification provider', () => {
      node.setNotifications(makeMockNotifications());
      expect(node.getCapabilities()).toContain('notifications');
    });

    it('does not duplicate capabilities', () => {
      node.setCamera(makeMockCamera());
      node.setCamera(makeMockCamera());
      const caps = node.getCapabilities().filter((c) => c === 'camera');
      expect(caps).toHaveLength(1);
    });
  });

  describe('capability handling', () => {
    function pairNode(): void {
      node.connect();
      transport.simulateOpen();
      node.pair('123456');
      transport.simulateMessage({
        type: 'pair_accepted',
        deviceId: 'dev-abc',
        payload: { deviceId: 'dev-abc' },
        timestamp: Date.now(),
      });
      transport.sent.length = 0;
    }

    it('handles camera capture request', async () => {
      node.setCamera(makeMockCamera());
      pairNode();

      transport.simulateMessage({
        type: 'capability_request',
        id: 'req-cam-1',
        payload: { capability: 'camera', action: 'capture' } satisfies CapabilityRequestPayload,
        timestamp: Date.now(),
      });

      // Allow async handler to complete
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      const response = JSON.parse(transport.sent[0]) as BridgeMessage;
      expect(response.type).toBe('capability_response');
      expect(response.id).toBe('req-cam-1');
      const payload = response.payload as any;
      expect(payload.success).toBe(true);
      expect(payload.capability).toBe('camera');
      expect(payload.data.mimeType).toBe('image/jpeg');
    });

    it('handles location request', async () => {
      node.setLocation(makeMockLocation());
      pairNode();

      transport.simulateMessage({
        type: 'capability_request',
        id: 'req-loc-1',
        payload: { capability: 'location', action: 'current' } satisfies CapabilityRequestPayload,
        timestamp: Date.now(),
      });

      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      const response = JSON.parse(transport.sent[0]) as BridgeMessage;
      const payload = response.payload as any;
      expect(payload.success).toBe(true);
      expect(payload.data.latitude).toBe(37.7749);
    });

    it('handles notification request', async () => {
      node.setNotifications(makeMockNotifications());
      pairNode();

      transport.simulateMessage({
        type: 'capability_request',
        id: 'req-notif-1',
        payload: {
          capability: 'notifications',
          action: 'show',
          params: { title: 'Test', body: 'Hello' },
        } satisfies CapabilityRequestPayload,
        timestamp: Date.now(),
      });

      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      const response = JSON.parse(transport.sent[0]) as BridgeMessage;
      const payload = response.payload as any;
      expect(payload.success).toBe(true);
    });

    it('returns error for unavailable capability', async () => {
      pairNode();

      transport.simulateMessage({
        type: 'capability_request',
        id: 'req-cam-1',
        payload: { capability: 'camera', action: 'capture' } satisfies CapabilityRequestPayload,
        timestamp: Date.now(),
      });

      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      const response = JSON.parse(transport.sent[0]) as BridgeMessage;
      const payload = response.payload as any;
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Camera not available');
    });

    it('returns error for unsupported capability', async () => {
      pairNode();

      transport.simulateMessage({
        type: 'capability_request',
        id: 'req-1',
        payload: { capability: 'sensors', action: 'read' } satisfies CapabilityRequestPayload,
        timestamp: Date.now(),
      });

      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      const response = JSON.parse(transport.sent[0]) as BridgeMessage;
      const payload = response.payload as any;
      expect(payload.success).toBe(false);
      expect(payload.error).toContain('Unsupported capability');
    });

    it('returns error for unknown action', async () => {
      node.setCamera(makeMockCamera());
      pairNode();

      transport.simulateMessage({
        type: 'capability_request',
        id: 'req-1',
        payload: { capability: 'camera', action: 'zoom' } satisfies CapabilityRequestPayload,
        timestamp: Date.now(),
      });

      await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

      const response = JSON.parse(transport.sent[0]) as BridgeMessage;
      const payload = response.payload as any;
      expect(payload.success).toBe(false);
      expect(payload.error).toContain('Unknown camera action');
    });
  });

  describe('protocol messages', () => {
    it('ignores invalid JSON', () => {
      node.connect();
      transport.simulateOpen();
      transport.handlers.message?.('not-json');
      expect(node.getState()).toBe('connecting');
    });

    it('ignores unknown message types', () => {
      node.connect();
      transport.simulateOpen();
      transport.simulateMessage({
        type: 'error',
        payload: { message: 'test error' },
        timestamp: Date.now(),
      });
      // Should not crash
      expect(node.getState()).toBe('connecting');
    });
  });
});
