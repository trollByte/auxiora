import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface ActivityEvent {
  timestamp: string;
  sequence: number;
  event: string;
  details: Record<string, unknown>;
}

const EVENT_LABELS: Record<string, (d: Record<string, unknown>) => string> = {
  'behavior.executed': (d) => d.success ? `Behavior ran successfully` : `Behavior failed: ${d.error ?? 'unknown'}`,
  'behavior.created': () => 'Behavior created',
  'behavior.updated': () => 'Behavior updated',
  'behavior.deleted': () => 'Behavior deleted',
  'behavior.paused': () => 'Behavior paused',
  'behavior.failed': (d) => `Behavior failed: ${d.error ?? 'unknown'}`,
  'message.received': (d) => `Message received on ${d.channelType ?? 'unknown'}`,
  'message.sent': (d) => `Message sent to ${d.channelType ?? 'unknown'}`,
  'message.filtered': () => 'Message filtered',
  'channel.connected': (d) => `${d.channelType ?? 'Channel'} connected`,
  'channel.disconnected': (d) => `${d.channelType ?? 'Channel'} disconnected`,
  'channel.error': (d) => `${d.channelType ?? 'Channel'} error`,
  'webhook.triggered': (d) => `Webhook triggered: ${d.path ?? ''}`,
  'webhook.received': () => 'Webhook received',
  'webhook.created': () => 'Webhook created',
  'webhook.deleted': () => 'Webhook deleted',
  'webhook.error': (d) => `Webhook error: ${d.error ?? 'unknown'}`,
  'system.startup': () => 'System started',
  'system.shutdown': () => 'System shut down',
  'system.error': (d) => `System error: ${d.error ?? 'unknown'}`,
  'auth.login': () => 'Login',
  'auth.logout': () => 'Logout',
};

const CATEGORY_COLORS: Record<string, string> = {
  behavior: 'var(--accent)',
  message: '#3b82f6',
  channel: 'var(--success)',
  webhook: '#f97316',
  system: 'var(--text-secondary)',
  auth: 'var(--danger)',
};

function getCategory(event: string): string {
  return event.split('.')[0];
}

function getLabel(event: string, details: Record<string, unknown>): string {
  const fn = EVENT_LABELS[event];
  if (fn) return fn(details);
  return event.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const MAX_EVENTS = 100;

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    api.getAudit({ limit: 50 }).then((res) => {
      if (res.data) {
        const PREFIXES = ['behavior.', 'message.', 'channel.', 'webhook.', 'system.', 'auth.login', 'auth.logout'];
        const filtered = res.data
          .filter((e: any) => PREFIXES.some((p) => e.event.startsWith(p)))
          .reverse();
        setEvents(filtered);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:18800' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'activity' && msg.payload) {
          setEvents((prev) => {
            const next = [msg.payload, ...prev];
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
          });
        }
      } catch { /* ignore non-JSON */ }
    };

    return () => { ws.close(); };
  }, []);

  return (
    <div className="activity-feed">
      <h3 className="mc-section-title">Live Activity</h3>
      <div className="activity-feed-list">
        {events.length === 0 && (
          <div className="activity-empty">No recent activity</div>
        )}
        {events.map((e, i) => {
          const cat = getCategory(e.event);
          const color = CATEGORY_COLORS[cat] ?? 'var(--text-secondary)';
          return (
            <div key={`${e.sequence}-${i}`} className="activity-item">
              <span className="activity-dot" style={{ background: color }} />
              <span className="activity-label">{getLabel(e.event, e.details)}</span>
              <span className="activity-time">{timeAgo(e.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
