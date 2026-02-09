import { getLogger } from '@auxiora/logger';
import * as crypto from 'node:crypto';
import type {
  BridgeConfig,
  BridgeMessage,
  DeviceCapability,
  DeviceInfo,
  DevicePlatform,
  PairRequestPayload,
  CapabilityRequestPayload,
  CapabilityResponsePayload,
} from './types.js';
import { DEFAULT_BRIDGE_CONFIG } from './types.js';
import { DeviceRegistry } from './registry.js';
import { PairingFlow } from './pairing.js';

const logger = getLogger('bridge:server');

/** Minimal WebSocket interface for dependency injection (no tight coupling to 'ws'). */
export interface BridgeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

/** WebSocket readyState constants. */
export const WS_OPEN = 1;

/** Event handler for Bridge server events. */
export interface BridgeEventHandler {
  onDevicePaired?(device: DeviceInfo): void;
  onDeviceDisconnected?(deviceId: string): void;
  onCapabilityResponse?(deviceId: string, response: CapabilityResponsePayload): void;
}

/**
 * Bridge server that manages device connections and the pairing protocol.
 * Designed to be mounted on an existing WebSocket server (e.g., the gateway).
 */
export class BridgeServer {
  private config: BridgeConfig;
  readonly registry: DeviceRegistry;
  readonly pairing: PairingFlow;
  private connections = new Map<string, BridgeSocket>();
  private pendingRequests = new Map<string, {
    resolve: (response: CapabilityResponsePayload) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventHandler: BridgeEventHandler = {};

  constructor(config?: Partial<BridgeConfig>) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    this.registry = new DeviceRegistry(this.config.maxDevices);
    this.pairing = new PairingFlow(this.config);
  }

  /** Set event handler. */
  onEvent(handler: BridgeEventHandler): void {
    this.eventHandler = handler;
  }

  /** Handle a new WebSocket connection from a device. */
  handleConnection(socket: BridgeSocket, connectionId: string): void {
    this.connections.set(connectionId, socket);
    logger.info('New bridge connection', { connectionId });
  }

  /** Handle a message from a connected device. */
  async handleMessage(connectionId: string, raw: string): Promise<void> {
    let message: BridgeMessage;
    try {
      message = JSON.parse(raw) as BridgeMessage;
    } catch {
      this.sendError(connectionId, 'Invalid message format');
      return;
    }

    switch (message.type) {
      case 'pair_request':
        await this.handlePairRequest(connectionId, message);
        break;
      case 'heartbeat':
        this.handleHeartbeat(connectionId, message);
        break;
      case 'capability_response':
        this.handleCapabilityResponse(message);
        break;
      case 'device_info':
        this.handleDeviceInfo(connectionId, message);
        break;
      case 'disconnect':
        this.handleDisconnect(connectionId);
        break;
      default:
        this.sendError(connectionId, `Unknown message type: ${message.type}`);
    }
  }

  /** Handle device disconnection. */
  handleDisconnection(connectionId: string): void {
    this.connections.delete(connectionId);

    // Find device for this connection
    const device = this.findDeviceByConnection(connectionId);
    if (device) {
      this.registry.setState(device.id, 'offline');
      this.eventHandler.onDeviceDisconnected?.(device.id);
      logger.info('Device disconnected', { deviceId: device.id });
    }
  }

  /** Request a capability from a specific device. */
  async requestCapability(
    deviceId: string,
    capability: DeviceCapability,
    action: string,
    params?: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<CapabilityResponsePayload> {
    const device = this.registry.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    if (device.state !== 'online') {
      throw new Error(`Device is not online: ${deviceId}`);
    }
    if (!device.capabilities.includes(capability)) {
      throw new Error(`Device ${deviceId} does not have capability: ${capability}`);
    }

    const requestId = crypto.randomUUID();
    const request: BridgeMessage = {
      type: 'capability_request',
      id: requestId,
      deviceId,
      payload: { capability, action, params } satisfies CapabilityRequestPayload,
      timestamp: Date.now(),
    };

    return new Promise<CapabilityResponsePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Capability request timed out: ${capability}/${action}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.sendToDevice(deviceId, request);
    });
  }

  /** Generate a new pairing code. */
  generatePairingCode(): string {
    const pc = this.pairing.generateCode();
    return pc.code;
  }

  /** Start heartbeat checking. */
  start(): void {
    this.pairing.startCleanup();
    const interval = this.config.heartbeatIntervalMs;
    const timeout = interval * this.config.offlineAfterMissedHeartbeats;

    this.heartbeatTimer = setInterval(() => {
      const timedOut = this.registry.checkTimeouts(timeout);
      for (const deviceId of timedOut) {
        this.eventHandler.onDeviceDisconnected?.(deviceId);
      }
    }, interval);

    logger.info('Bridge server started');
  }

  /** Stop the bridge server. */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.pairing.destroy();

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge server stopped'));
      this.pendingRequests.delete(id);
    }

    // Close all connections
    for (const [id, socket] of this.connections) {
      try {
        socket.close(1001, 'Bridge server stopping');
      } catch {
        // Ignore close errors
      }
    }
    this.connections.clear();

    logger.info('Bridge server stopped');
  }

  /** Get the number of active connections. */
  getConnectionCount(): number {
    return this.connections.size;
  }

  // --- Private helpers ---

  private async handlePairRequest(connectionId: string, message: BridgeMessage): Promise<void> {
    const payload = message.payload as PairRequestPayload;
    if (!payload?.code || !payload?.deviceName || !payload?.platform) {
      this.sendError(connectionId, 'Invalid pair request: missing required fields');
      return;
    }

    const valid = this.pairing.consume(payload.code);
    if (!valid) {
      this.sendTo(connectionId, {
        type: 'pair_rejected',
        id: message.id,
        payload: { reason: 'Invalid or expired pairing code' },
        timestamp: Date.now(),
      });
      return;
    }

    const deviceId = crypto.randomUUID();
    const device: DeviceInfo = {
      id: deviceId,
      name: payload.deviceName,
      platform: payload.platform,
      capabilities: payload.capabilities ?? [],
      state: 'online',
      pairedAt: Date.now(),
      lastSeen: Date.now(),
    };

    this.registry.register(device);

    // Associate this connection with the device
    this.setDeviceConnection(deviceId, connectionId);

    this.sendTo(connectionId, {
      type: 'pair_accepted',
      id: message.id,
      deviceId,
      payload: { deviceId, name: device.name },
      timestamp: Date.now(),
    });

    this.eventHandler.onDevicePaired?.(device);
    logger.info('Device paired', { deviceId, name: device.name, platform: device.platform });
  }

  private handleHeartbeat(connectionId: string, message: BridgeMessage): void {
    const device = this.findDeviceByConnection(connectionId);
    if (device) {
      this.registry.heartbeat(device.id);
      this.sendTo(connectionId, {
        type: 'heartbeat_ack',
        id: message.id,
        deviceId: device.id,
        timestamp: Date.now(),
      });
    }
  }

  private handleCapabilityResponse(message: BridgeMessage): void {
    if (!message.id) return;
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.id);
      pending.resolve(message.payload as CapabilityResponsePayload);
      this.eventHandler.onCapabilityResponse?.(
        message.deviceId ?? '',
        message.payload as CapabilityResponsePayload,
      );
    }
  }

  private handleDeviceInfo(connectionId: string, message: BridgeMessage): void {
    const device = this.findDeviceByConnection(connectionId);
    if (!device) return;

    const info = message.payload as Partial<{ name: string; capabilities: DeviceCapability[] }>;
    if (info?.capabilities) {
      // Re-register with updated capabilities
      const existing = this.registry.get(device.id);
      if (existing) {
        existing.capabilities = info.capabilities;
        if (info.name) existing.name = info.name;
        this.registry.register(existing);
      }
    }
  }

  private handleDisconnect(connectionId: string): void {
    this.handleDisconnection(connectionId);
  }

  private sendTo(connectionId: string, message: BridgeMessage): void {
    const socket = this.connections.get(connectionId);
    if (socket && socket.readyState === WS_OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendToDevice(deviceId: string, message: BridgeMessage): void {
    const connectionId = this.deviceConnections.get(deviceId);
    if (connectionId) {
      this.sendTo(connectionId, message);
    }
  }

  private sendError(connectionId: string, errorMessage: string): void {
    this.sendTo(connectionId, {
      type: 'error',
      payload: { message: errorMessage },
      timestamp: Date.now(),
    });
  }

  // Device-to-connection mapping
  private deviceConnections = new Map<string, string>();
  private connectionDevices = new Map<string, string>();

  private setDeviceConnection(deviceId: string, connectionId: string): void {
    this.deviceConnections.set(deviceId, connectionId);
    this.connectionDevices.set(connectionId, deviceId);
  }

  private findDeviceByConnection(connectionId: string): DeviceInfo | undefined {
    const deviceId = this.connectionDevices.get(connectionId);
    return deviceId ? this.registry.get(deviceId) : undefined;
  }
}
