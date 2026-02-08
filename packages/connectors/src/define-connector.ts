import type { Connector, ActionDefinition, TriggerDefinition, EntityDefinition, AuthConfig, TriggerEvent } from './types.js';

/** Options for defining a connector via the SDK helper. */
export interface DefineConnectorOptions {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  icon?: string;
  auth: AuthConfig;
  actions: ActionDefinition[];
  triggers?: TriggerDefinition[];
  entities?: EntityDefinition[];
  executeAction: (actionId: string, params: Record<string, unknown>, token: string) => Promise<unknown>;
  pollTrigger?: (triggerId: string, token: string, lastPollAt?: number) => Promise<TriggerEvent[]>;
}

/** SDK helper to define a connector with validated structure. */
export function defineConnector(options: DefineConnectorOptions): Connector {
  if (!options.id || !options.name) {
    throw new Error('Connector id and name are required');
  }
  if (!options.auth) {
    throw new Error('Connector auth config is required');
  }
  if (!options.actions || options.actions.length === 0) {
    throw new Error('Connector must define at least one action');
  }

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    version: options.version,
    category: options.category,
    icon: options.icon,
    auth: options.auth,
    actions: options.actions,
    triggers: options.triggers ?? [],
    entities: options.entities ?? [],
    executeAction: options.executeAction,
    pollTrigger: options.pollTrigger,
  };
}
