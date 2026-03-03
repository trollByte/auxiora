import { useState, useEffect, useCallback } from 'react';
import { getResourceStatus, getBreakerStatus } from '../api.js';
import type { ResourceSnapshot, MachineProfile, BreakerStatus } from '../api.js';

function gaugeColor(percent: number): string {
  if (percent > 85) return '#ef4444';
  if (percent > 70) return '#eab308';
  return '#22c55e';
}

function breakerActionColor(action: string): { bg: string; fg: string } {
  switch (action) {
    case 'ok': return { bg: 'rgba(34, 197, 94, 0.2)', fg: '#22c55e' };
    case 'throttle': return { bg: 'rgba(234, 179, 8, 0.2)', fg: '#eab308' };
    case 'pause': return { bg: 'rgba(249, 115, 22, 0.2)', fg: '#f97316' };
    case 'kill': return { bg: 'rgba(239, 68, 68, 0.2)', fg: '#ef4444' };
    default: return { bg: 'rgba(148, 163, 184, 0.2)', fg: '#94a3b8' };
  }
}

function GaugeBar({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = gaugeColor(clamped);
  return (
    <div className="ro-gauge">
      <div className="ro-gauge-header">
        <span className="ro-gauge-label">{label}</span>
        <span className="ro-gauge-value" style={{ color }}>{clamped.toFixed(1)}%</span>
      </div>
      <div className="ro-gauge-track">
        <div
          className="ro-gauge-fill"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function Orchestration() {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [profile, setProfile] = useState<MachineProfile | null>(null);
  const [breaker, setBreaker] = useState<BreakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [resources, breakerStatus] = await Promise.all([
        getResourceStatus(),
        getBreakerStatus(),
      ]);
      setSnapshot(resources.snapshot);
      setProfile(resources.profile);
      setBreaker(breakerStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resource data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <div className="ro-page"><p>Loading...</p></div>;
  if (error && !snapshot) return <div className="ro-page"><p className="ro-error">{error}</p></div>;

  const actionColors = breaker ? breakerActionColor(breaker.action) : null;

  return (
    <div className="ro-page">
      {/* Header */}
      <div className="ro-header">
        <h2 className="ro-title">Resource Orchestration</h2>
      </div>

      {error && <p className="ro-error">{error}</p>}

      {/* Machine Profile Card */}
      {profile && snapshot && (
        <div className="ro-section">
          <h3 className="ro-section-title">Machine Profile</h3>
          <div className="ro-stats">
            <div className="ro-stat-card">
              <span className="ro-stat-value">{profile.machineClass}</span>
              <span className="ro-stat-label">Class</span>
            </div>
            <div className="ro-stat-card">
              <span className="ro-stat-value">{snapshot.cpu.cores}</span>
              <span className="ro-stat-label">CPU Cores</span>
            </div>
            <div className="ro-stat-card">
              <span className="ro-stat-value">{(snapshot.memory.totalMB / 1024).toFixed(1)} GB</span>
              <span className="ro-stat-label">Total RAM</span>
            </div>
            <div className="ro-stat-card">
              <span className="ro-stat-value">{profile.hasGpu ? 'Yes' : 'No'}</span>
              <span className="ro-stat-label">GPU</span>
            </div>
            <div className="ro-stat-card">
              <span className="ro-stat-value">{profile.recommendedMaxAgents}</span>
              <span className="ro-stat-label">Max Agents</span>
            </div>
          </div>
        </div>
      )}

      {/* Resource Gauges */}
      {snapshot && (
        <div className="ro-section">
          <h3 className="ro-section-title">Resource Usage</h3>
          <div className="ro-gauges">
            <GaugeBar label="CPU Utilization" percent={snapshot.cpu.utilization} />
            <GaugeBar label="RAM Usage" percent={snapshot.memory.usedPercent} />
            <GaugeBar label="Swap Usage" percent={snapshot.swap.usedPercent} />
          </div>
          <div className="ro-gauge-extra">
            <span>Load Average (1m): {snapshot.cpu.loadAvg1m.toFixed(2)}</span>
            <span>Available RAM: {(snapshot.memory.availableMB / 1024).toFixed(1)} GB</span>
          </div>
        </div>
      )}

      {/* Breaker Status */}
      {breaker && (
        <div className="ro-section">
          <h3 className="ro-section-title">Circuit Breaker</h3>
          <div className="ro-breaker-card">
            <div className="ro-breaker-header">
              <span className="ro-breaker-label">Current Action:</span>
              {actionColors && (
                <span
                  className="ro-breaker-badge"
                  style={{ backgroundColor: actionColors.bg, color: actionColors.fg }}
                >
                  {breaker.action.toUpperCase()}
                </span>
              )}
            </div>
            {breaker.reasons.length > 0 && (
              <ul className="ro-breaker-reasons">
                {breaker.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            {breaker.reasons.length === 0 && (
              <p className="ro-empty">All resources within normal limits.</p>
            )}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="ro-section">
        <div className="ro-info">
          Resource-aware scheduling monitors CPU, memory, and swap usage to prevent overload.
          When thresholds are exceeded, the circuit breaker throttles, pauses, or kills agent
          workloads to maintain system stability. Data refreshes every 5 seconds.
        </div>
      </div>
    </div>
  );
}
