import type { TrustLevel, TrustDomain } from '@auxiora/autonomy';

/** Supported authentication methods for connectors. */
export type AuthType = 'oauth2' | 'api_key' | 'token';

/** OAuth2 configuration for connectors that use OAuth2 auth. */
export interface OAuth2Config {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId?: string;
  clientSecret?: string;
}

/** Authentication configuration for a connector. */
export interface AuthConfig {
  type: AuthType;
  oauth2?: OAuth2Config;
  /** Human-readable instructions for obtaining credentials. */
  instructions?: string;
}

/** Defines a single action that a connector can perform. */
export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  /** Minimum trust level required to execute this action. */
  trustMinimum: TrustLevel;
  /** Trust domain this action operates in. */
  trustDomain: TrustDomain;
  /** Whether this action can be reversed/undone. */
  reversible: boolean;
  /** Whether this action has external side effects. */
  sideEffects: boolean;
  /** Parameter schema (JSON Schema-like). */
  params: Record<string, ParamDefinition>;
}

/** Parameter definition for an action. */
export interface ParamDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

/** Defines a trigger that a connector can listen for. */
export interface TriggerDefinition {
  id: string;
  name: string;
  description: string;
  /** How this trigger is detected. */
  type: 'poll' | 'webhook';
  /** Polling interval in ms (for poll triggers). */
  pollIntervalMs?: number;
}

/** Defines an entity type that a connector exposes. */
export interface EntityDefinition {
  id: string;
  name: string;
  description: string;
  /** Fields exposed by this entity. */
  fields: Record<string, string>;
}

/** Full connector definition. */
export interface Connector {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  icon?: string;
  auth: AuthConfig;
  actions: ActionDefinition[];
  triggers: TriggerDefinition[];
  entities: EntityDefinition[];
  /** Action handler called to execute actions. */
  executeAction: (actionId: string, params: Record<string, unknown>, token: string) => Promise<unknown>;
  /** Trigger poll handler. */
  pollTrigger?: (triggerId: string, token: string, lastPollAt?: number) => Promise<TriggerEvent[]>;
}

/** Event emitted by a trigger. */
export interface TriggerEvent {
  triggerId: string;
  connectorId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/** Stored token data for a connector instance. */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scopes?: string[];
}

/** A configured instance of a connector with auth credentials. */
export interface ConnectorInstance {
  id: string;
  connectorId: string;
  label: string;
  createdAt: number;
  /** Whether auth is configured and valid. */
  authenticated: boolean;
}
