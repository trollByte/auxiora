import type { DeviceCapability, DevicePlatform, BridgeMessage } from '@auxiora/bridge';

/** Configuration for a mobile node connection. */
export interface MobileNodeConfig {
  /** Bridge server URL (WebSocket). */
  serverUrl: string;
  /** Device display name. */
  deviceName: string;
  /** Platform (ios or android). */
  platform: 'ios' | 'android';
  /** Capabilities this device provides. */
  capabilities: DeviceCapability[];
  /** Heartbeat interval in milliseconds. */
  heartbeatIntervalMs: number;
  /** Reconnect delay after disconnect in milliseconds. */
  reconnectDelayMs: number;
  /** Maximum reconnect attempts. */
  maxReconnectAttempts: number;
}

export const DEFAULT_MOBILE_CONFIG: MobileNodeConfig = {
  serverUrl: 'ws://localhost:3000/bridge',
  deviceName: 'Mobile Device',
  platform: 'ios',
  capabilities: [],
  heartbeatIntervalMs: 30_000,
  reconnectDelayMs: 5_000,
  maxReconnectAttempts: 10,
};

/** Connection state of the mobile node. */
export type MobileNodeState = 'disconnected' | 'connecting' | 'pairing' | 'paired' | 'error';

/** Camera capture options. */
export interface CameraCaptureOptions {
  /** Camera to use. */
  camera?: 'front' | 'back';
  /** Image quality (0-1). */
  quality?: number;
  /** Maximum width in pixels. */
  maxWidth?: number;
  /** Maximum height in pixels. */
  maxHeight?: number;
}

/** Camera capture result. */
export interface CameraCaptureResult {
  /** Base64-encoded image data. */
  imageData: string;
  /** Image MIME type. */
  mimeType: string;
  /** Image dimensions. */
  width: number;
  height: number;
}

/** Screen capture result. */
export interface ScreenCaptureResult {
  /** Base64-encoded image data. */
  imageData: string;
  mimeType: string;
  width: number;
  height: number;
}

/** Location data. */
export interface LocationData {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

/** Notification options for the mobile device. */
export interface MobileNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  sound?: string;
  data?: Record<string, unknown>;
}

/** Interface that native camera implementations must provide. */
export interface CameraProvider {
  capturePhoto(options?: CameraCaptureOptions): Promise<CameraCaptureResult>;
  isAvailable(): Promise<boolean>;
}

/** Interface that native screen capture implementations must provide. */
export interface ScreenProvider {
  captureScreen(): Promise<ScreenCaptureResult>;
  isAvailable(): Promise<boolean>;
}

/** Interface that native location implementations must provide. */
export interface LocationProvider {
  getCurrentLocation(): Promise<LocationData>;
  watchPosition(callback: (location: LocationData) => void): () => void;
  isAvailable(): Promise<boolean>;
}

/** Interface that native notification implementations must provide. */
export interface NotificationProvider {
  show(options: MobileNotificationOptions): Promise<void>;
  requestPermission(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
}

/** Transport interface for WebSocket connections (injectable for testing). */
export interface MobileTransport {
  connect(url: string): void;
  send(data: string): void;
  close(): void;
  onOpen(handler: () => void): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
  isConnected(): boolean;
}
