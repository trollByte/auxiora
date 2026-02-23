import { useState, useEffect } from 'react';
import { api } from '../api.js';

interface ProviderInfo {
  name: string;
  displayName: string;
  models: Record<string, { maxContextTokens: number; costPer1kInput: number; costPer1kOutput: number; isLocal: boolean }>;
}

interface CostSummary {
  today: number;
  thisMonth: number;
  budgetRemaining?: number;
  isOverBudget: boolean;
  warningThresholdReached: boolean;
}

interface Routing {
  enabled: boolean;
  primary: string;
  fallback?: string;
}

export function ProviderHealth() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [health, setHealth] = useState<string>('unknown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getModels(), api.getHealthState()])
      .then(([models, healthRes]) => {
        setProviders(models.providers);
        setRouting(models.routing);
        setCost(models.cost);
        const providerSub = healthRes.data?.subsystems?.find(
          (s: { name: string }) => s.name === 'providers',
        );
        setHealth(providerSub?.status ?? healthRes.data?.overall ?? 'unknown');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="provider-health"><p>Loading...</p></div>;

  const statusDot = health === 'healthy' ? 'status-dot-green'
    : health === 'degraded' ? 'status-dot-yellow'
    : 'status-dot-red';

  return (
    <div className="provider-health">
      <div className="provider-health-header">
        <h3>Providers</h3>
        <span className={statusDot} /> <span className="provider-health-status">{health}</span>
      </div>

      <div className="provider-health-grid">
        {providers.map((p) => (
          <div key={p.name} className="provider-health-card glass-mid">
            <div className="provider-health-card-header">
              <strong>{p.displayName}</strong>
              {routing?.primary === p.name && <span className="badge badge-green">Primary</span>}
              {routing?.fallback === p.name && <span className="badge badge-yellow">Fallback</span>}
            </div>
            <div className="provider-health-card-models">
              {Object.keys(p.models).length} model{Object.keys(p.models).length !== 1 ? 's' : ''}
              {Object.values(p.models).some(m => m.isLocal) && <span className="badge badge-gray">Local</span>}
            </div>
          </div>
        ))}
      </div>

      {cost && (
        <div className="provider-health-cost">
          <div className="provider-health-cost-item">
            <span className="provider-health-cost-label">Today</span>
            <span className={`provider-health-cost-value ${cost.isOverBudget ? 'cost-over' : ''}`}>${cost.today.toFixed(2)}</span>
          </div>
          <div className="provider-health-cost-item">
            <span className="provider-health-cost-label">This month</span>
            <span className="provider-health-cost-value">${cost.thisMonth.toFixed(2)}</span>
          </div>
          {cost.budgetRemaining != null && (
            <div className="provider-health-cost-item">
              <span className="provider-health-cost-label">Budget left</span>
              <span className={`provider-health-cost-value ${cost.warningThresholdReached ? 'cost-warning' : ''}`}>${cost.budgetRemaining.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
