import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

interface DarwinStatus {
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  archiveOccupancy: number;
  totalVariants: number;
  running: boolean;
}

interface ArchiveEntry {
  niche: { domain: string; complexity: string };
  variantId: string;
  benchmarkScore: number;
  lastEvaluated: number;
  staleness: number;
}

interface GovernorStatus {
  tokensUsedThisHour: number;
  variantsCreatedToday: number;
}

interface PendingApproval {
  variantId: string;
  queuedAt: number;
}

function scoreColor(score: number): string {
  if (score > 0.8) return 'dw-score-green';
  if (score > 0.6) return 'dw-score-yellow';
  if (score > 0.4) return 'dw-score-red';
  return 'dw-score-grey';
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Evolution() {
  const [status, setStatus] = useState<DarwinStatus | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [governor, setGovernor] = useState<GovernorStatus | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [s, a, g, p] = await Promise.all([
        api.getDarwinStatus(),
        api.getDarwinArchive(),
        api.getDarwinGovernor(),
        api.getDarwinApprovals(),
      ]);
      setStatus(s);
      setArchive(a);
      setGovernor(g);
      setApprovals(p);
      setError(null);
    } catch {
      setError('Failed to load Darwin data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handlePauseResume = async () => {
    if (!status) return;
    setActionPending('pause-resume');
    try {
      if (status.running) {
        await api.pauseDarwin();
      } else {
        await api.resumeDarwin();
      }
      await fetchAll();
    } catch {
      setError('Failed to toggle Darwin');
    }
    setActionPending(null);
  };

  const handleApprove = async (id: string) => {
    setActionPending(id);
    try {
      await api.approveDarwinVariant(id);
      await fetchAll();
    } catch {
      setError(`Failed to approve ${id}`);
    }
    setActionPending(null);
  };

  const handleReject = async (id: string) => {
    setActionPending(id);
    try {
      await api.rejectDarwinVariant(id);
      await fetchAll();
    } catch {
      setError(`Failed to reject ${id}`);
    }
    setActionPending(null);
  };

  if (loading) return <div className="dw-page"><p>Loading...</p></div>;
  if (error && !status) return <div className="dw-page"><p className="dw-error">{error}</p></div>;

  const successRate = status && status.totalCycles > 0
    ? ((status.successfulCycles / status.totalCycles) * 100).toFixed(1)
    : '0.0';

  // Build archive grid: unique domains as rows, complexities as columns
  const domains = [...new Set(archive.map(e => e.niche.domain))].sort();
  const complexities = [...new Set(archive.map(e => e.niche.complexity))].sort();
  const archiveMap = new Map<string, ArchiveEntry>();
  for (const entry of archive) {
    archiveMap.set(`${entry.niche.domain}|${entry.niche.complexity}`, entry);
  }

  return (
    <div className="dw-page">
      {/* Header */}
      <div className="dw-header">
        <div className="dw-header-left">
          <h2 className="dw-title">Evolution</h2>
          {status && (
            <span className={`dw-badge ${status.running ? 'dw-badge-running' : 'dw-badge-paused'}`}>
              {status.running ? 'Running' : 'Paused'}
            </span>
          )}
        </div>
        <button
          className="dw-btn dw-btn-toggle"
          disabled={actionPending === 'pause-resume'}
          onClick={handlePauseResume}
        >
          {status?.running ? 'Pause' : 'Resume'}
        </button>
      </div>

      {error && <p className="dw-error">{error}</p>}

      {/* Stats cards */}
      {status && governor && (
        <div className="dw-stats">
          <div className="dw-stat-card">
            <span className="dw-stat-value">{status.totalCycles}</span>
            <span className="dw-stat-label">Total Cycles</span>
          </div>
          <div className="dw-stat-card">
            <span className="dw-stat-value">{successRate}%</span>
            <span className="dw-stat-label">Success Rate</span>
          </div>
          <div className="dw-stat-card">
            <span className="dw-stat-value">{status.archiveOccupancy}</span>
            <span className="dw-stat-label">Archive Occupancy</span>
          </div>
          <div className="dw-stat-card">
            <span className="dw-stat-value">{governor.tokensUsedThisHour.toLocaleString()}</span>
            <span className="dw-stat-label">Tokens / Hour</span>
          </div>
          <div className="dw-stat-card">
            <span className="dw-stat-value">{governor.variantsCreatedToday}</span>
            <span className="dw-stat-label">Variants / Day</span>
          </div>
        </div>
      )}

      {/* Archive grid */}
      {archive.length > 0 && (
        <div className="dw-section">
          <h3 className="dw-section-title">Archive</h3>
          <div className="dw-table-wrap">
            <table className="dw-archive-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  {complexities.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {domains.map(domain => (
                  <tr key={domain}>
                    <td className="dw-domain-cell">{domain}</td>
                    {complexities.map(complexity => {
                      const entry = archiveMap.get(`${domain}|${complexity}`);
                      return (
                        <td key={complexity} className="dw-score-cell">
                          {entry ? (
                            <span className={`dw-score-badge ${scoreColor(entry.benchmarkScore)}`} title={`Variant: ${entry.variantId}\nScore: ${entry.benchmarkScore.toFixed(3)}\nStaleness: ${entry.staleness}`}>
                              {entry.benchmarkScore.toFixed(2)}
                            </span>
                          ) : (
                            <span className="dw-score-badge dw-score-grey">--</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending approvals */}
      <div className="dw-section">
        <h3 className="dw-section-title">Pending Approvals ({approvals.length})</h3>
        {approvals.length === 0 ? (
          <p className="dw-empty">No pending approvals.</p>
        ) : (
          <div className="dw-approval-list">
            {approvals.map(a => (
              <div key={a.variantId} className="dw-approval-item">
                <div className="dw-approval-info">
                  <span className="dw-approval-id">{a.variantId}</span>
                  <span className="dw-approval-time">{formatTimeAgo(a.queuedAt)}</span>
                </div>
                <div className="dw-approval-actions">
                  <button
                    className="dw-btn dw-btn-approve"
                    disabled={actionPending === a.variantId}
                    onClick={() => handleApprove(a.variantId)}
                  >
                    Approve
                  </button>
                  <button
                    className="dw-btn dw-btn-reject"
                    disabled={actionPending === a.variantId}
                    onClick={() => handleReject(a.variantId)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
