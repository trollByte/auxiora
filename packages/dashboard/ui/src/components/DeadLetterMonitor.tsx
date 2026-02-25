import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

interface JobStats {
  pending: number;
  running: number;
  completed24h: number;
  failed24h: number;
  dead: number;
}

interface JobEntry {
  id: string;
  type: string;
  status: string;
  payload: unknown;
  result: unknown;
  attempt: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
}

export function DeadLetterMonitor() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [deadJobs, setDeadJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [statsRes, listRes] = await Promise.all([
        api.getJobStats(),
        api.getJobList({ status: 'dead', limit: 50 }),
      ]);
      setStats(statsRes);
      setDeadJobs(listRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRetry = async (id: string) => {
    try {
      await api.retryJob(id);
      refresh();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="dlq-monitor"><p>Loading...</p></div>;

  return (
    <div className="dlq-monitor">
      <div className="dlq-header">
        <h3>Job Queue</h3>
        <button className="dlq-refresh" onClick={refresh}>Refresh</button>
      </div>

      {stats && (
        <div className="dlq-stats">
          <span className="dlq-stat">{stats.pending} pending</span>
          <span className="dlq-stat">{stats.running} running</span>
          <span className="dlq-stat">{stats.completed24h} completed (24h)</span>
          <span className="dlq-stat dlq-stat-warn">{stats.failed24h} failed (24h)</span>
          <span className={`dlq-stat ${stats.dead > 0 ? 'dlq-stat-danger' : ''}`}>{stats.dead} dead</span>
        </div>
      )}

      {deadJobs.length > 0 && (
        <div className="dlq-list">
          <h4>Dead Jobs</h4>
          <table className="dlq-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Error</th>
                <th>Attempts</th>
                <th>Age</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deadJobs.map(job => (
                <tr key={job.id}>
                  <td>{job.type}</td>
                  <td className="dlq-error">{String(job.result ?? 'unknown')}</td>
                  <td>{job.attempt}/{job.maxAttempts}</td>
                  <td>{formatAge(job.createdAt)}</td>
                  <td><button className="dlq-retry-btn" onClick={() => handleRetry(job.id)}>Retry</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deadJobs.length === 0 && stats && stats.dead === 0 && (
        <p className="dlq-empty">No dead jobs. All clear.</p>
      )}
    </div>
  );
}

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '<1m';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}
