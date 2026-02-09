import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceRegistry } from '../registry.js';
import { PairingFlow } from '../pairing.js';
import { BridgeServer, WS_OPEN, type BridgeSocket } from '../server.js';
import type { DeviceInfo, BridgeMessage } from '../types.js';

function makeMockSocket(): BridgeSocket & { sent: string[]; closed: boolean } {
  return {
    sent: [],
    closed: false,
    readyState: WS_OPEN,
    send(data: string) { this.sent.push(data); },
    close() { this.closed = true; this.readyState = 3; },
  };
}

function parseMessage(raw: string): BridgeMessage {
  return JSON.parse(raw) as BridgeMessage;
}

describe('DeviceRegistry', () => {
  let registry: DeviceRegistry;

  const device1: DeviceInfo = {
    id: 'dev-1',
    name: 'iPhone',
    platform: 'ios',
    capabilities: ['camera', 'location', 'notifications'],
    state: 'online',
    pairedAt: Date.now(),
    lastSeen: Date.now(),
  };

  const device2: DeviceInfo = {
    id: 'dev-2',
    name: 'MacBook',
    platform: 'macos',
    capabilities: ['screen', 'clipboard', 'notifications'],
    state: 'online',
    pairedAt: Date.now(),
    lastSeen: Date.now(),
  };

  beforeEach(() => {
    registry = new DeviceRegistry(5);
  });

  it('registers and retrieves a device', () => {
    registry.register(device1);
    const found = registry.get('dev-1');
    expect(found).toBeDefined();
    expect(found!.name).toBe('iPhone');
    expect(found!.platform).toBe('ios');
  });

  it('returns a copy of device info', () => {
    registry.register(device1);
    const found = registry.get('dev-1')!;
    found.name = 'Modified';
    expect(registry.get('dev-1')!.name).toBe('iPhone');
  });

  it('returns undefined for unknown device', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all devices', () => {
    registry.register(device1);
    registry.register(device2);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('filters by capability', () => {
    registry.register(device1);
    registry.register(device2);
    const withCamera = registry.getByCapability('camera');
    expect(withCamera).toHaveLength(1);
    expect(withCamera[0].id).toBe('dev-1');
  });

  it('filters online devices', () => {
    registry.register(device1);
    registry.register({ ...device2, state: 'offline' });
    const online = registry.getOnline();
    expect(online).toHaveLength(1);
  });

  it('unregisters a device', () => {
    registry.register(device1);
    expect(registry.unregister('dev-1')).toBe(true);
    expect(registry.get('dev-1')).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it('enforces max device limit', () => {
    const small = new DeviceRegistry(1);
    small.register(device1);
    expect(() => small.register(device2)).toThrow('Maximum device limit (1) reached');
  });

  it('allows re-registering existing device', () => {
    const small = new DeviceRegistry(1);
    small.register(device1);
    small.register({ ...device1, name: 'Updated iPhone' });
    expect(small.get('dev-1')!.name).toBe('Updated iPhone');
  });

  it('updates connection state', () => {
    registry.register(device1);
    registry.setState('dev-1', 'offline');
    expect(registry.get('dev-1')!.state).toBe('offline');
  });

  it('updates lastSeen on heartbeat', () => {
    registry.register({ ...device1, lastSeen: 1000 });
    registry.heartbeat('dev-1');
    expect(registry.get('dev-1')!.lastSeen).toBeGreaterThan(1000);
  });

  it('detects timed-out devices', () => {
    registry.register({ ...device1, lastSeen: Date.now() - 100_000 });
    const timedOut = registry.checkTimeouts(60_000);
    expect(timedOut).toEqual(['dev-1']);
    expect(registry.get('dev-1')!.state).toBe('offline');
  });

  it('reports capacity', () => {
    const small = new DeviceRegistry(1);
    expect(small.hasCapacity()).toBe(true);
    small.register(device1);
    expect(small.hasCapacity()).toBe(false);
  });
});

describe('PairingFlow', () => {
  let pairing: PairingFlow;

  beforeEach(() => {
    pairing = new PairingFlow({ codeLength: 6, codeExpirySeconds: 300 });
  });

  afterEach(() => {
    pairing.destroy();
  });

  it('generates a code of correct length', () => {
    const code = pairing.generateCode();
    expect(code.code).toHaveLength(6);
    expect(code.used).toBe(false);
    expect(code.expiresAt).toBeGreaterThan(Date.now());
  });

  it('validates a fresh code', () => {
    const code = pairing.generateCode();
    expect(pairing.validate(code.code)).toBe(true);
  });

  it('rejects unknown code', () => {
    expect(pairing.validate('000000')).toBe(false);
  });

  it('consumes a code', () => {
    const code = pairing.generateCode();
    expect(pairing.consume(code.code)).toBe(true);
    // Cannot consume again
    expect(pairing.consume(code.code)).toBe(false);
    // Cannot validate consumed code
    expect(pairing.validate(code.code)).toBe(false);
  });

  it('revokes a code', () => {
    const code = pairing.generateCode();
    expect(pairing.revoke(code.code)).toBe(true);
    expect(pairing.validate(code.code)).toBe(false);
  });

  it('rejects expired codes', () => {
    const code = pairing.generateCode();
    // Manually expire
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 400_000);
    expect(pairing.validate(code.code)).toBe(false);
    vi.restoreAllMocks();
  });

  it('lists active codes', () => {
    pairing.generateCode();
    pairing.generateCode();
    const consumed = pairing.generateCode();
    pairing.consume(consumed.code);

    const active = pairing.getActiveCodes();
    expect(active).toHaveLength(2);
  });

  it('cleans up expired and consumed codes', () => {
    const c1 = pairing.generateCode();
    pairing.consume(c1.code);
    pairing.generateCode(); // still active

    const removed = pairing.cleanup();
    expect(removed).toBe(1);
  });
});

describe('BridgeServer', () => {
  let server: BridgeServer;

  beforeEach(() => {
    server = new BridgeServer({ maxDevices: 5, codeLength: 6, codeExpirySeconds: 300 });
  });

  afterEach(() => {
    server.stop();
  });

  it('generates pairing codes', () => {
    const code = server.generatePairingCode();
    expect(code).toHaveLength(6);
  });

  it('handles device connection', () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');
    expect(server.getConnectionCount()).toBe(1);
  });

  it('handles full pairing flow', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    const code = server.generatePairingCode();

    await server.handleMessage('conn-1', JSON.stringify({
      type: 'pair_request',
      id: 'req-1',
      payload: {
        code,
        deviceName: 'Test Phone',
        platform: 'android',
        capabilities: ['camera', 'location'],
      },
      timestamp: Date.now(),
    }));

    expect(socket.sent).toHaveLength(1);
    const response = parseMessage(socket.sent[0]);
    expect(response.type).toBe('pair_accepted');
    expect(response.deviceId).toBeDefined();

    // Device should be in registry
    const devices = server.registry.getAll();
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('Test Phone');
    expect(devices[0].platform).toBe('android');
    expect(devices[0].capabilities).toEqual(['camera', 'location']);
  });

  it('rejects invalid pairing code', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    await server.handleMessage('conn-1', JSON.stringify({
      type: 'pair_request',
      id: 'req-1',
      payload: {
        code: '999999',
        deviceName: 'Test Phone',
        platform: 'android',
        capabilities: [],
      },
      timestamp: Date.now(),
    }));

    const response = parseMessage(socket.sent[0]);
    expect(response.type).toBe('pair_rejected');
  });

  it('rejects incomplete pair request', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    await server.handleMessage('conn-1', JSON.stringify({
      type: 'pair_request',
      id: 'req-1',
      payload: { code: '123456' },
      timestamp: Date.now(),
    }));

    const response = parseMessage(socket.sent[0]);
    expect(response.type).toBe('error');
  });

  it('handles heartbeat from paired device', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    // Pair the device first
    const code = server.generatePairingCode();
    await server.handleMessage('conn-1', JSON.stringify({
      type: 'pair_request',
      id: 'req-1',
      payload: {
        code,
        deviceName: 'Phone',
        platform: 'ios',
        capabilities: [],
      },
      timestamp: Date.now(),
    }));

    socket.sent.length = 0;

    await server.handleMessage('conn-1', JSON.stringify({
      type: 'heartbeat',
      id: 'hb-1',
      timestamp: Date.now(),
    }));

    expect(socket.sent).toHaveLength(1);
    const response = parseMessage(socket.sent[0]);
    expect(response.type).toBe('heartbeat_ack');
  });

  it('handles device disconnection', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    // Pair device
    const code = server.generatePairingCode();
    await server.handleMessage('conn-1', JSON.stringify({
      type: 'pair_request',
      id: 'req-1',
      payload: {
        code,
        deviceName: 'Phone',
        platform: 'ios',
        capabilities: ['camera'],
      },
      timestamp: Date.now(),
    }));

    const deviceId = server.registry.getAll()[0].id;
    server.handleDisconnection('conn-1');

    expect(server.registry.get(deviceId)!.state).toBe('offline');
    expect(server.getConnectionCount()).toBe(0);
  });

  it('handles invalid JSON gracefully', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    await server.handleMessage('conn-1', 'not-json{');
    const response = parseMessage(socket.sent[0]);
    expect(response.type).toBe('error');
  });

  it('handles unknown message type', async () => {
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    await server.handleMessage('conn-1', JSON.stringify({
      type: 'unknown_type',
      timestamp: Date.now(),
    }));

    const response = parseMessage(socket.sent[0]);
    expect(response.type).toBe('error');
    expect((response.payload as { message: string }).message).toContain('Unknown message type');
  });

  it('fires event on device paired', async () => {
    const paired: DeviceInfo[] = [];
    server.onEvent({ onDevicePaired: (d) => paired.push(d) });

    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');
    const code = server.generatePairingCode();

    await server.handleMessage('conn-1', JSON.stringify({
      type: 'pair_request',
      id: 'req-1',
      payload: {
        code,
        deviceName: 'Phone',
        platform: 'android',
        capabilities: [],
      },
      timestamp: Date.now(),
    }));

    expect(paired).toHaveLength(1);
    expect(paired[0].name).toBe('Phone');
  });

  it('rejects capability request for unknown device', async () => {
    await expect(
      server.requestCapability('unknown', 'camera', 'capture'),
    ).rejects.toThrow('Device not found');
  });

  it('stops cleanly', () => {
    server.start();
    const socket = makeMockSocket();
    server.handleConnection(socket, 'conn-1');

    server.stop();
    expect(socket.closed).toBe(true);
    expect(server.getConnectionCount()).toBe(0);
  });
});
