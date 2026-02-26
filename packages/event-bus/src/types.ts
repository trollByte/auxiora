export interface BusEvent {
  topic: string;
  agentId: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

export interface StoredEvent extends BusEvent {
  timestamp: number;
}

export type EventHandler = (event: StoredEvent) => void;

export interface EventBusConfig {
  maxHistory?: number;
}

export interface HistoryFilter {
  agentId?: string;
  topic?: string;
}
