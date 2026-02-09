/** Capabilities a device node can provide. */
export type DeviceCapability =
  | 'camera'
  | 'screen'
  | 'microphone'
  | 'location'
  | 'notifications'
  | 'clipboard'
  | 'sensors';

/** Platform of the device. */
export type DevicePlatform = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web';

/** Connection state for a device. */
export type DeviceConnectionState = 'connecting' | 'paired' | 'online' | 'offline';

/** Information about a paired device. */
export interface DeviceInfo {
  /** Unique device identifier. */
  id: string;
  /** User-facing device name. */
  name: string;
  /** Device platform. */
  platform: DevicePlatform;
  /** Capabilities this device supports. */
  capabilities: DeviceCapability[];
  /** Current connection state. */
  state: DeviceConnectionState;
  /** When the device was first paired. */
  pairedAt: number;
  /** When the device was last seen online. */
  lastSeen: number;
}

/** Pairing code issued by the server. */
export interface PairingCode {
  /** The short code the user enters on the device. */
  code: string;
  /** When the code expires (unix ms). */
  expiresAt: number;
  /** Whether the code has been used. */
  used: boolean;
}

/** Configuration for the Bridge server. */
export interface BridgeConfig {
  /** Maximum number of paired devices. */
  maxDevices: number;
  /** Pairing code length (digits). */
  codeLength: number;
  /** Pairing code expiry in seconds. */
  codeExpirySeconds: number;
  /** Heartbeat interval in milliseconds. */
  heartbeatIntervalMs: number;
  /** Consider device offline after this many missed heartbeats. */
  offlineAfterMissedHeartbeats: number;
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  maxDevices: 10,
  codeLength: 6,
  codeExpirySeconds: 300,
  heartbeatIntervalMs: 30_000,
  offlineAfterMissedHeartbeats: 3,
};

/** Messages sent between Bridge server and device nodes. */
export type BridgeMessageType =
  | 'pair_request'
  | 'pair_accepted'
  | 'pair_rejected'
  | 'heartbeat'
  | 'heartbeat_ack'
  | 'capability_request'
  | 'capability_response'
  | 'device_info'
  | 'disconnect'
  | 'error';

/** A message in the Bridge protocol. */
export interface BridgeMessage {
  type: BridgeMessageType;
  /** Correlation ID for request/response matching. */
  id?: string;
  /** The sending device ID (set by server for forwarded messages). */
  deviceId?: string;
  /** Message-specific payload. */
  payload?: unknown;
  /** Timestamp (unix ms). */
  timestamp: number;
}

/** Payload for pair_request. */
export interface PairRequestPayload {
  code: string;
  deviceName: string;
  platform: DevicePlatform;
  capabilities: DeviceCapability[];
}

/** Payload for capability_request. */
export interface CapabilityRequestPayload {
  capability: DeviceCapability;
  action: string;
  params?: Record<string, unknown>;
}

/** Payload for capability_response. */
export interface CapabilityResponsePayload {
  capability: DeviceCapability;
  action: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
