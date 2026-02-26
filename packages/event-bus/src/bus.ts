import type { BusEvent, StoredEvent, EventHandler, EventBusConfig, HistoryFilter } from './types.js';

interface Subscription {
  pattern: string;
  handler: EventHandler;
}

export class EventBus {
  private readonly subscriptions: Subscription[] = [];
  private readonly history: StoredEvent[] = [];
  private readonly agentData = new Map<string, Map<string, unknown>>();
  private readonly maxHistory: number;

  constructor(config?: EventBusConfig) {
    this.maxHistory = config?.maxHistory ?? 1000;
  }

  subscribe(topicPattern: string, handler: EventHandler): () => void {
    const sub: Subscription = { pattern: topicPattern, handler };
    this.subscriptions.push(sub);
    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) this.subscriptions.splice(idx, 1);
    };
  }

  publish(event: BusEvent): void {
    const stored: StoredEvent = { ...event, timestamp: event.timestamp ?? Date.now() };

    this.history.push(stored);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    for (const sub of this.subscriptions) {
      if (this.matches(sub.pattern, stored.topic)) {
        sub.handler(stored);
      }
    }
  }

  setAgentData(agentId: string, key: string, value: unknown): void {
    let data = this.agentData.get(agentId);
    if (!data) {
      data = new Map();
      this.agentData.set(agentId, data);
    }
    data.set(key, value);
  }

  getAgentData(agentId: string, key: string): unknown {
    return this.agentData.get(agentId)?.get(key);
  }

  getAllAgentData(agentId: string): Record<string, unknown> {
    const data = this.agentData.get(agentId);
    if (!data) return {};
    return Object.fromEntries(data);
  }

  clearAgentData(agentId: string): void {
    this.agentData.delete(agentId);
  }

  getHistory(filter?: HistoryFilter): StoredEvent[] {
    let result = [...this.history];
    if (filter?.agentId) {
      result = result.filter((e) => e.agentId === filter.agentId);
    }
    if (filter?.topic) {
      result = result.filter((e) => e.topic === filter.topic);
    }
    return result;
  }

  private matches(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return topic.startsWith(prefix + '.');
    }
    if (pattern === '*') return true;
    return false;
  }
}
