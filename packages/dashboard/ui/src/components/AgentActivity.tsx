import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface AgentActivityItem {
  id: string;
  type: string;
  description: string;
  channelType?: string;
  startedAt: string;
}

const CHANNEL_BADGES: Record<string, string> = {
  discord: 'Discord',
  telegram: 'Telegram',
  slack: 'Slack',
  webchat: 'Web',
};

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function AgentActivity() {
  const [agents, setAgents] = useState<AgentActivityItem[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);

  // Hydrate from REST on mount
  useEffect(() => {
    api.getActiveAgents().then((res) => {
      if (res.data) setAgents(res.data);
    }).catch(() => {});
  }, []);

  // Subscribe to WebSocket agent_start / agent_end events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:18800' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'agent_start' && msg.payload) {
          setAgents((prev) => [...prev, msg.payload]);
        } else if (msg.type === 'agent_end' && msg.payload) {
          setAgents((prev) => prev.filter((a) => a.id !== msg.payload.id));
        }
      } catch { /* ignore non-JSON */ }
    };

    return () => { ws.close(); };
  }, []);

  // Tick every second to update elapsed times
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  return (
    <div className="agent-activity">
      <h3 className="mc-section-title">Active Now</h3>
      {agents.length === 0 ? (
        <div className="agent-activity-quiet">All quiet</div>
      ) : (
        <div className="agent-activity-list">
          {agents.map((a) => (
            <div key={a.id} className="agent-activity-card">
              <span className="agent-pulse" />
              <div className="agent-activity-info">
                <span className="agent-activity-desc">{a.description}</span>
                <span className="agent-activity-meta">
                  {a.channelType && (
                    <span className="agent-channel-badge">
                      {CHANNEL_BADGES[a.channelType] ?? a.channelType}
                    </span>
                  )}
                  <span className="agent-activity-type">{a.type}</span>
                  <span className="agent-activity-elapsed">{elapsed(a.startedAt)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
