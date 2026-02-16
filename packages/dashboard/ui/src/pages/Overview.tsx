import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { ActivityFeed } from '../components/ActivityFeed';
import { AgentActivity } from '../components/AgentActivity';
import { BehaviorHealth } from '../components/BehaviorHealth';

export function Overview() {
  const { data: status, refresh } = useApi(() => api.getStatus(), []);
  const { data: models, refresh: refreshModels } = useApi(() => api.getModels(), []);
  usePolling(() => { refresh(); refreshModels(); });

  const s = status?.data;
  const primaryProvider = models?.providers?.find((p: any) => p.available)?.displayName ?? 'None';

  return (
    <div className="page">
      <h2>Mission Control</h2>

      {/* Quick status strip */}
      <div className="status-grid">
        <div className="status-card">
          <h3>Connections</h3>
          <div className="value">{s?.connections ?? 0}</div>
          <div className="sub">Active sessions</div>
        </div>
        <div className="status-card">
          <h3>Provider</h3>
          <div className="value">{primaryProvider}</div>
          <div className="sub">{s?.activeModel?.model ?? 'unknown'}</div>
        </div>
        <div className="status-card">
          <h3>Uptime</h3>
          <div className="value">{s ? formatUptime(s.uptime) : '-'}</div>
          <div className="sub">Since last restart</div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="mc-columns">
        <div className="mc-left">
          <AgentActivity />
          <BehaviorHealth />
        </div>
        <div className="mc-right">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
