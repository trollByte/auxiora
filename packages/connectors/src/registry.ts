import type { Connector, ActionDefinition, TriggerDefinition } from './types.js';

export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    if (this.connectors.has(connector.id)) {
      throw new Error(`Connector "${connector.id}" is already registered`);
    }
    this.connectors.set(connector.id, connector);
  }

  get(id: string): Connector | undefined {
    return this.connectors.get(id);
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }

  listByCategory(category: string): Connector[] {
    return [...this.connectors.values()].filter((c) => c.category === category);
  }

  getActions(connectorId: string): ActionDefinition[] {
    const connector = this.connectors.get(connectorId);
    return connector ? connector.actions : [];
  }

  getTriggers(connectorId: string): TriggerDefinition[] {
    const connector = this.connectors.get(connectorId);
    return connector ? connector.triggers : [];
  }

  has(id: string): boolean {
    return this.connectors.has(id);
  }

  unregister(id: string): boolean {
    return this.connectors.delete(id);
  }
}
