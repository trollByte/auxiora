import { useState, useEffect } from 'react';
import { getFeatureStatus, type FeatureStatus } from '../api.js';
import { ProviderHealth } from '../components/ProviderHealth.js';

export function SystemStatus() {
  const [features, setFeatures] = useState<FeatureStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFeatureStatus()
      .then(data => setFeatures(data.features))
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="system-status"><p>Loading...</p></div>;
  if (error) return <div className="system-status"><p>Error: {error}</p></div>;

  const active = features.filter(f => f.enabled && f.configured && f.active);
  const ready = features.filter(f => f.enabled && !f.configured);
  const available = features.filter(f => !f.enabled);

  return (
    <div className="system-status">
      <h2>System Status</h2>
      <ProviderHealth />

      <section className="status-section-active">
        <h3>Active ({active.length})</h3>
        <div className="status-grid">
          {active.map(f => (
            <div key={f.id} className="status-card">
              <span className="status-dot-green" />
              <div className="status-card-info">
                <strong>{f.name}</strong>
                <span className="status-card-category">{f.category}</span>
              </div>
            </div>
          ))}
          {active.length === 0 && <p className="status-empty">No active features</p>}
        </div>
      </section>

      <section className="status-section-ready">
        <h3>Ready ({ready.length})</h3>
        <div className="status-grid">
          {ready.map(f => (
            <div key={f.id} className="status-card">
              <span className="status-dot-yellow" />
              <div className="status-card-info">
                <strong>{f.name}</strong>
                <span className="status-card-category">{f.category}</span>
              </div>
              <button className="status-configure-btn">Configure</button>
            </div>
          ))}
          {ready.length === 0 && <p className="status-empty">No features awaiting configuration</p>}
        </div>
      </section>

      <section className="status-section-available">
        <h3>Available ({available.length})</h3>
        <div className="status-grid">
          {available.map(f => (
            <div key={f.id} className="status-card">
              <span className="status-dot-gray" />
              <div className="status-card-info">
                <strong>{f.name}</strong>
                <span className="status-card-category">{f.category}</span>
              </div>
            </div>
          ))}
          {available.length === 0 && <p className="status-empty">All features are enabled</p>}
        </div>
      </section>
    </div>
  );
}
