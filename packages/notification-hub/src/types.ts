export type NotificationPriority = 'urgent' | 'important' | 'low' | 'muted';
export type NotificationSource = 'email' | 'calendar' | 'channel' | 'social' | 'system' | 'behavior';
export type DeliveryChannel = 'desktop' | 'mobile' | 'webchat' | 'email-digest' | 'channel';

export interface Notification {
  id: string;
  source: NotificationSource;
  priority: NotificationPriority;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  actioned: boolean;
  metadata?: Record<string, unknown>;
  groupId?: string;
}

export interface NotificationInput {
  source: NotificationSource;
  priority?: NotificationPriority;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  groupId?: string;
}

export interface NotificationConfig {
  batchIntervalMs?: number;  // default 1800000 (30 min)
  maxBatchSize?: number;     // default 50
  defaultPriority?: NotificationPriority;  // default 'low'
  routingRules?: RoutingRule[];
  dndSchedule?: DndSchedule;
}

export interface RoutingRule {
  source?: NotificationSource;
  priority?: NotificationPriority;
  deliverVia: DeliveryChannel[];
}

export interface DndSchedule {
  enabled: boolean;
  startHour: number;    // 0-23
  endHour: number;      // 0-23
  days: number[];       // 0=Sun, 1=Mon, ..., 6=Sat
  allowUrgent: boolean; // urgent notifications pass through DND
}
