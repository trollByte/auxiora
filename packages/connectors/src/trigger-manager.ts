import type { ConnectorRegistry } from './registry.js';
import type { AuthManager } from './auth-manager.js';
import type { TriggerEvent } from './types.js';

export type TriggerHandler = (events: TriggerEvent[]) => void | Promise<void>;

interface Subscription {
  connectorId: string;
  triggerId: string;
  instanceId: string;
  handler: TriggerHandler;
  lastPollAt: number;
}

export class TriggerManager {
  private registry: ConnectorRegistry;
  private authManager: AuthManager;
  private subscriptions = new Map<string, Subscription>();

  constructor(registry: ConnectorRegistry, authManager: AuthManager) {
    this.registry = registry;
    this.authManager = authManager;
  }

  /** Subscribe to a trigger on a connector instance. Returns a subscription ID. */
  subscribe(
    connectorId: string,
    triggerId: string,
    instanceId: string,
    handler: TriggerHandler,
  ): string {
    const connector = this.registry.get(connectorId);
    if (!connector) {
      throw new Error(`Connector "${connectorId}" not found`);
    }

    const trigger = connector.triggers.find((t) => t.id === triggerId);
    if (!trigger) {
      throw new Error(`Trigger "${triggerId}" not found in connector "${connectorId}"`);
    }

    const subId = `${connectorId}:${triggerId}:${instanceId}`;
    this.subscriptions.set(subId, {
      connectorId,
      triggerId,
      instanceId,
      handler,
      lastPollAt: Date.now(),
    });

    return subId;
  }

  /** Unsubscribe from a trigger. */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /** Poll all subscriptions and invoke handlers for new events. */
  async pollAll(): Promise<TriggerEvent[]> {
    const allEvents: TriggerEvent[] = [];

    for (const [subId, sub] of this.subscriptions) {
      const connector = this.registry.get(sub.connectorId);
      if (!connector?.pollTrigger) continue;

      const token = this.authManager.getToken(sub.instanceId);
      if (!token) continue;

      try {
        const events = await connector.pollTrigger(
          sub.triggerId,
          token.accessToken,
          sub.lastPollAt,
        );

        if (events.length > 0) {
          await sub.handler(events);
          allEvents.push(...events);
        }

        sub.lastPollAt = Date.now();
      } catch {
        // Poll errors are silently ignored to avoid breaking other subscriptions
      }
    }

    return allEvents;
  }

  /** Get all active subscription IDs. */
  getSubscriptions(): string[] {
    return [...this.subscriptions.keys()];
  }
}
