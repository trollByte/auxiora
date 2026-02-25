import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface Behavior {
  id: string;
  type: 'scheduled' | 'monitor' | 'one-shot';
  status: 'active' | 'paused' | 'deleted' | 'missed';
  action: string;
  runCount: number;
  failCount: number;
  maxFailures: number;
  lastRun?: string;
  lastResult?: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getHealthColor(b: Behavior): string {
  if (b.status === 'paused' && b.failCount >= b.maxFailures) return 'var(--danger)';
  if (b.status === 'paused') return 'var(--text-secondary)';
  if (b.failCount > 0) return 'var(--warning)';
  return 'var(--success)';
}

function getHealthLabel(b: Behavior): string {
  if (b.status === 'paused' && b.failCount >= b.maxFailures) return 'Auto-paused';
  if (b.status === 'paused') return 'Paused';
  if (b.failCount > 0) return `${b.failCount} failures`;
  return 'Healthy';
}

const TYPE_LABELS: Record<string, string> = {
  scheduled: 'Sched',
  monitor: 'Monitor',
  'one-shot': 'Once',
};

export function BehaviorHealth() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    api.getBehaviors().then((res) => {
      if (res.data) {
        setBehaviors(res.data.filter((b: any) => b.status !== 'deleted'));
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
        if (msg.type === 'activity' && msg.payload?.event?.startsWith('behavior.')) {
          api.getBehaviors().then((res) => {
            if (res.data) {
              setBehaviors(res.data.filter((b: any) => b.status !== 'deleted'));
            }
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    };

    return () => { ws.close(); };
  }, []);

  return (
    <div className="behavior-health">
      <h3 className="mc-section-title">Behavior Health</h3>
      {behaviors.length === 0 && (
        <div className="bh-empty">No behaviors configured</div>
      )}
      <div className="bh-list">
        {behaviors.map((b) => (
          <div key={b.id} className="bh-card">
            <div className="bh-card-header">
              <span className="bh-dot" style={{ background: getHealthColor(b) }} />
              <span className="bh-action">{b.action.length > 60 ? b.action.slice(0, 57) + '...' : b.action}</span>
              <span className="bh-type-badge">{TYPE_LABELS[b.type] ?? b.type}</span>
            </div>
            <div className="bh-card-meta">
              <span className="bh-health-label" style={{ color: getHealthColor(b) }}>{getHealthLabel(b)}</span>
              <span className="bh-stat">{b.runCount} runs</span>
              {b.lastRun && <span className="bh-stat">{timeAgo(b.lastRun)}</span>}
            </div>
            {b.lastResult && (
              <div className="bh-result">{b.lastResult.length > 120 ? b.lastResult.slice(0, 117) + '...' : b.lastResult}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
