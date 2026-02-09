import { getLogger } from '@auxiora/logger';
import type {
  BridgeMessage,
  CapabilityRequestPayload,
  CapabilityResponsePayload,
  DeviceCapability,
} from '@auxiora/bridge';
import type {
  MobileNodeConfig,
  MobileNodeState,
  MobileTransport,
  CameraProvider,
  ScreenProvider,
  LocationProvider,
  NotificationProvider,
} from './types.js';
import { DEFAULT_MOBILE_CONFIG } from './types.js';

const logger = getLogger('mobile:node');

/**
 * Mobile node that connects to a Bridge server and exposes device capabilities.
 * This is the contract layer — actual native implementations (Swift/Kotlin)
 * would provide the capability providers.
 */
export class MobileNode {
  private config: MobileNodeConfig;
  private transport: MobileTransport;
  private state: MobileNodeState = 'disconnected';
  private deviceId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;

  // Capability providers (injected by native layer)
  private cameraProvider: CameraProvider | null = null;
  private screenProvider: ScreenProvider | null = null;
  private locationProvider: LocationProvider | null = null;
  private notificationProvider: NotificationProvider | null = null;

  constructor(transport: MobileTransport, config?: Partial<MobileNodeConfig>) {
    this.config = { ...DEFAULT_MOBILE_CONFIG, ...config };
    this.transport = transport;

    this.transport.onOpen(() => this.handleOpen());
    this.transport.onMessage((data) => this.handleMessage(data));
    this.transport.onClose((code, reason) => this.handleClose(code, reason));
    this.transport.onError((error) => this.handleError(error));
  }

  /** Register a camera capability provider. */
  setCamera(provider: CameraProvider): void {
    this.cameraProvider = provider;
    if (!this.config.capabilities.includes('camera')) {
      this.config.capabilities.push('camera');
    }
  }

  /** Register a screen capture capability provider. */
  setScreen(provider: ScreenProvider): void {
    this.screenProvider = provider;
    if (!this.config.capabilities.includes('screen')) {
      this.config.capabilities.push('screen');
    }
  }

  /** Register a location capability provider. */
  setLocation(provider: LocationProvider): void {
    this.locationProvider = provider;
    if (!this.config.capabilities.includes('location')) {
      this.config.capabilities.push('location');
    }
  }

  /** Register a notification capability provider. */
  setNotifications(provider: NotificationProvider): void {
    this.notificationProvider = provider;
    if (!this.config.capabilities.includes('notifications')) {
      this.config.capabilities.push('notifications');
    }
  }

  /** Connect to the Bridge server. */
  connect(): void {
    if (this.state === 'connecting' || this.state === 'paired') {
      return;
    }
    this.state = 'connecting';
    this.transport.connect(this.config.serverUrl);
    logger.info('Connecting to Bridge server', { url: this.config.serverUrl });
  }

  /** Initiate pairing with the given code. */
  pair(code: string): void {
    if (this.state !== 'connecting' && this.state !== 'pairing') {
      // If not connected yet, connect first then pair
      if (this.state === 'disconnected') {
        this.connect();
      }
    }
    this.state = 'pairing';

    const message: BridgeMessage = {
      type: 'pair_request',
      id: `pair-${Date.now()}`,
      payload: {
        code,
        deviceName: this.config.deviceName,
        platform: this.config.platform,
        capabilities: this.config.capabilities,
      },
      timestamp: Date.now(),
    };

    this.send(message);
    logger.info('Pairing request sent', { code });
  }

  /** Disconnect from the Bridge server. */
  disconnect(): void {
    this.stopHeartbeat();
    this.transport.close();
    this.state = 'disconnected';
    this.deviceId = null;
    this.reconnectAttempts = 0;
    logger.info('Disconnected');
  }

  /** Get the current connection state. */
  getState(): MobileNodeState {
    return this.state;
  }

  /** Get the assigned device ID (available after pairing). */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /** Get the capabilities this node provides. */
  getCapabilities(): DeviceCapability[] {
    return [...this.config.capabilities];
  }

  // --- Private handlers ---

  private handleOpen(): void {
    logger.info('Connected to Bridge server');
    this.reconnectAttempts = 0;
    if (this.state === 'connecting') {
      // Ready for pairing
      this.state = 'connecting';
    }
  }

  private handleMessage(raw: string): void {
    let message: BridgeMessage;
    try {
      message = JSON.parse(raw) as BridgeMessage;
    } catch {
      logger.warn('Received invalid message from server');
      return;
    }

    switch (message.type) {
      case 'pair_accepted':
        this.handlePairAccepted(message);
        break;
      case 'pair_rejected':
        this.handlePairRejected(message);
        break;
      case 'heartbeat_ack':
        // Server acknowledged our heartbeat
        break;
      case 'capability_request':
        this.handleCapabilityRequest(message);
        break;
      case 'error':
        logger.warn('Server error', { payload: message.payload });
        break;
    }
  }

  private handlePairAccepted(message: BridgeMessage): void {
    const payload = message.payload as { deviceId: string };
    this.deviceId = payload.deviceId;
    this.state = 'paired';
    this.startHeartbeat();
    logger.info('Paired successfully', { deviceId: this.deviceId });
  }

  private handlePairRejected(message: BridgeMessage): void {
    const payload = message.payload as { reason?: string };
    this.state = 'error';
    logger.warn('Pairing rejected', { reason: payload?.reason });
  }

  private async handleCapabilityRequest(message: BridgeMessage): Promise<void> {
    const payload = message.payload as CapabilityRequestPayload;
    let response: CapabilityResponsePayload;

    try {
      const data = await this.executeCapability(payload.capability, payload.action, payload.params);
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

  private async executeCapability(
    capability: DeviceCapability,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    switch (capability) {
      case 'camera':
        if (!this.cameraProvider) throw new Error('Camera not available');
        if (action === 'capture') return this.cameraProvider.capturePhoto(params as any);
        if (action === 'check') return this.cameraProvider.isAvailable();
        throw new Error(`Unknown camera action: ${action}`);

      case 'screen':
        if (!this.screenProvider) throw new Error('Screen capture not available');
        if (action === 'capture') return this.screenProvider.captureScreen();
        if (action === 'check') return this.screenProvider.isAvailable();
        throw new Error(`Unknown screen action: ${action}`);

      case 'location':
        if (!this.locationProvider) throw new Error('Location not available');
        if (action === 'current') return this.locationProvider.getCurrentLocation();
        if (action === 'check') return this.locationProvider.isAvailable();
        throw new Error(`Unknown location action: ${action}`);

      case 'notifications':
        if (!this.notificationProvider) throw new Error('Notifications not available');
        if (action === 'show') return this.notificationProvider.show(params as any);
        if (action === 'permission') return this.notificationProvider.requestPermission();
        if (action === 'check') return this.notificationProvider.isAvailable();
        throw new Error(`Unknown notification action: ${action}`);

      default:
        throw new Error(`Unsupported capability: ${capability}`);
    }
  }

  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    logger.info('Connection closed', { code, reason });

    if (this.state === 'paired' && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.state = 'disconnected';
    }
  }

  private handleError(error: Error): void {
    logger.error('Connection error', { error });
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

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * this.reconnectAttempts;
    logger.info('Scheduling reconnect', { attempt: this.reconnectAttempts, delayMs: delay });
    setTimeout(() => this.connect(), delay);
  }

  private send(message: BridgeMessage): void {
    if (this.transport.isConnected()) {
      this.transport.send(JSON.stringify(message));
    }
  }
}
