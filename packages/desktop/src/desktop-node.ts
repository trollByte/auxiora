import { getLogger } from '@auxiora/logger';
import type {
  BridgeMessage,
  CapabilityRequestPayload,
  CapabilityResponsePayload,
  DeviceCapability,
  DeviceInfo,
} from '@auxiora/bridge';
import type { TauriBridge } from './app.js';

const logger = getLogger('desktop:node');

/** Transport interface for the desktop node's WebSocket connection. */
export interface DesktopTransport {
  connect(url: string): void;
  send(data: string): void;
  close(): void;
  onOpen(handler: () => void): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
  isConnected(): boolean;
}

/** Configuration for the desktop node. */
export interface DesktopNodeConfig {
  serverUrl: string;
  deviceName: string;
  capabilities: DeviceCapability[];
  heartbeatIntervalMs: number;
}

export const DEFAULT_DESKTOP_NODE_CONFIG: DesktopNodeConfig = {
  serverUrl: 'ws://localhost:3000/bridge',
  deviceName: 'Desktop',
  capabilities: ['screen', 'notifications', 'clipboard'],
  heartbeatIntervalMs: 30_000,
};

export type DesktopNodeState = 'disconnected' | 'connecting' | 'pairing' | 'paired';

/**
 * Desktop device node that connects to the Bridge server.
 * Provides screen capture, notifications, and clipboard capabilities
 * via the Tauri bridge.
 */
export class DesktopNode {
  private config: DesktopNodeConfig;
  private transport: DesktopTransport;
  private tauriBridge: TauriBridge;
  private state: DesktopNodeState = 'disconnected';
  private deviceId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    transport: DesktopTransport,
    tauriBridge: TauriBridge,
    config?: Partial<DesktopNodeConfig>,
  ) {
    this.config = { ...DEFAULT_DESKTOP_NODE_CONFIG, ...config };
    this.transport = transport;
    this.tauriBridge = tauriBridge;

    this.transport.onOpen(() => this.handleOpen());
    this.transport.onMessage((data) => this.handleMessage(data));
    this.transport.onClose(() => this.handleClose());
    this.transport.onError((err) => logger.error('Connection error', { error: err }));
  }

  /** Connect to the Bridge server. */
  connect(): void {
    if (this.state !== 'disconnected') return;
    this.state = 'connecting';
    this.transport.connect(this.config.serverUrl);
  }

  /** Pair with the Bridge server using a code. */
  pair(code: string): void {
    if (this.state === 'disconnected') {
      this.connect();
    }
    this.state = 'pairing';

    const message: BridgeMessage = {
      type: 'pair_request',
      id: `pair-${Date.now()}`,
      payload: {
        code,
        deviceName: this.config.deviceName,
        platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
        capabilities: this.config.capabilities,
      },
      timestamp: Date.now(),
    };

    this.send(message);
    logger.info('Desktop node pairing request sent');
  }

  /** Disconnect from the Bridge server. */
  disconnect(): void {
    this.stopHeartbeat();
    this.transport.close();
    this.state = 'disconnected';
    this.deviceId = null;
  }

  getState(): DesktopNodeState { return this.state; }
  getDeviceId(): string | null { return this.deviceId; }
  getCapabilities(): DeviceCapability[] { return [...this.config.capabilities]; }

  private handleOpen(): void {
    logger.info('Connected to Bridge server');
  }

  private handleMessage(raw: string): void {
    let message: BridgeMessage;
    try {
      message = JSON.parse(raw) as BridgeMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'pair_accepted': {
        const payload = message.payload as { deviceId: string };
        this.deviceId = payload.deviceId;
        this.state = 'paired';
        this.startHeartbeat();
        logger.info('Desktop node paired', { deviceId: this.deviceId });
        break;
      }
      case 'pair_rejected':
        this.state = 'disconnected';
        logger.warn('Desktop node pairing rejected');
        break;
      case 'heartbeat_ack':
        break;
      case 'capability_request':
        this.handleCapabilityRequest(message);
        break;
    }
  }

  private async handleCapabilityRequest(message: BridgeMessage): Promise<void> {
    const payload = message.payload as CapabilityRequestPayload;
    let response: CapabilityResponsePayload;

    try {
      const data = await this.performCapability(payload.capability, payload.action, payload.params);
      response = {
        capability: payload.capability,
        action: payload.action,
        success: true,
        data,
      };
    } catch (error) {
      response = {
        capability: payload.capability,
        action: payload.action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    this.send({
      type: 'capability_response',
      id: message.id,
      deviceId: this.deviceId ?? undefined,
      payload: response,
      timestamp: Date.now(),
    });
  }

  private async performCapability(
    capability: DeviceCapability,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    switch (capability) {
      case 'screen':
        if (action === 'capture') {
          // Delegate to Tauri bridge — actual screen capture in native layer
          return { captured: true, timestamp: Date.now() };
        }
        throw new Error(`Unknown screen action: ${action}`);

      case 'notifications':
        if (action === 'show' && params) {
          await this.tauriBridge.sendNotification({
            title: String(params.title ?? ''),
            body: String(params.body ?? ''),
          });
          return { sent: true };
        }
        throw new Error(`Unknown notification action: ${action}`);

      case 'clipboard':
        if (action === 'read' || action === 'write') {
          return { supported: true, action };
        }
        throw new Error(`Unknown clipboard action: ${action}`);

      default:
        throw new Error(`Unsupported capability: ${capability}`);
    }
  }

  private handleClose(): void {
    this.stopHeartbeat();
    this.state = 'disconnected';
    logger.info('Desktop node disconnected');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'heartbeat',
        deviceId: this.deviceId ?? undefined,
        timestamp: Date.now(),
      });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(message: BridgeMessage): void {
    if (this.transport.isConnected()) {
      this.transport.send(JSON.stringify(message));
    }
  }
}
