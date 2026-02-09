import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

interface ProviderInfo {
  name: string;
  displayName: string;
  available: boolean;
  models: Record<string, unknown>;
}

interface RoutingInfo {
  enabled: boolean;
  primary: string;
  fallback?: string;
}

interface CostInfo {
  today: number;
  thisMonth: number;
  isOverBudget: boolean;
  warningThresholdReached: boolean;
}

const KNOWN_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true },
  { id: 'openai', label: 'OpenAI', needsKey: true },
  { id: 'google', label: 'Google (Gemini)', needsKey: true },
  { id: 'ollama', label: 'Ollama (Local)', needsKey: false, needsEndpoint: true },
  { id: 'groq', label: 'Groq', needsKey: true },
  { id: 'deepseek', label: 'DeepSeek', needsKey: true },
  { id: 'cohere', label: 'Cohere', needsKey: true },
  { id: 'xai', label: 'xAI (Grok)', needsKey: true },
  { id: 'openaiCompatible', label: 'OpenAI-Compatible', needsKey: true, needsEndpoint: true },
];

export function SettingsProvider() {
  const { data, refresh } = useApi(() => api.getModels(), []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Routing state
  const [primary, setPrimary] = useState('');
  const [fallback, setFallback] = useState('');
  const [routingSaving, setRoutingSaving] = useState(false);

  // Per-card form state
  const [cardApiKey, setCardApiKey] = useState('');
  const [cardEndpoint, setCardEndpoint] = useState('');
  const [cardModel, setCardModel] = useState('');

  const providers: ProviderInfo[] = data?.providers ?? [];
  const routing: RoutingInfo = data?.routing ?? { enabled: false, primary: '', fallback: '' };
  const cost: CostInfo = data?.cost ?? { today: 0, thisMonth: 0, isOverBudget: false, warningThresholdReached: false };

  // Sync routing state when data loads
  useEffect(() => {
    if (routing.primary) setPrimary(routing.primary);
    if (routing.fallback) setFallback(routing.fallback);
  }, [routing.primary, routing.fallback]);

  const configuredNames = new Set(providers.filter(p => p.available).map(p => p.name));

  const getProviderModels = (name: string): string[] => {
    const p = providers.find(pr => pr.name === name);
    if (!p?.models) return [];
    return Object.keys(p.models);
  };

  const handleExpand = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      setCardApiKey('');
      setCardEndpoint('');
      setCardModel('');
      setError('');
      setSuccess('');
    }
  };

  const handleSaveProvider = async (providerId: string) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const spec = KNOWN_PROVIDERS.find(p => p.id === providerId);
      await api.configureProvider(
        providerId,
        spec?.needsKey ? cardApiKey || undefined : undefined,
        spec?.needsEndpoint ? cardEndpoint || undefined : undefined,
      );
      if (cardModel) {
        await api.setProviderModel(providerId, cardModel);
      }
      setSuccess(`${spec?.label ?? providerId} configured successfully`);
      setCardApiKey('');
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRouting = async () => {
    setRoutingSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateRouting(primary, fallback || undefined);
      setSuccess('Routing updated');
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRoutingSaving(false);
    }
  };

  const configuredProviderOptions = providers.filter(p => p.available);

  return (
    <div className="page">
      <h2>Providers</h2>

      {/* Routing Configuration */}
      <div className="settings-section">
        <h3>Routing</h3>
        <div className="routing-config">
          <div className="routing-field">
            <label>Primary Provider</label>
            <select value={primary} onChange={e => setPrimary(e.target.value)}>
              <option value="">Select...</option>
              {configuredProviderOptions.map(p => (
                <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
              ))}
            </select>
          </div>
          <div className="routing-field">
            <label>Fallback Provider</label>
            <select value={fallback} onChange={e => setFallback(e.target.value)}>
              <option value="">None</option>
              {configuredProviderOptions.filter(p => p.name !== primary).map(p => (
                <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleSaveRouting} disabled={routingSaving || !primary}>
            {routingSaving ? 'Saving...' : 'Save Routing'}
          </button>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="settings-section">
        <h3>Usage</h3>
        <div className="cost-summary">
          <div className={`cost-box${cost.isOverBudget ? ' over-budget' : ''}`}>
            <h4>Today</h4>
            <div className="cost-value">${cost.today.toFixed(2)}</div>
          </div>
          <div className={`cost-box${cost.isOverBudget ? ' over-budget' : ''}`}>
            <h4>This Month</h4>
            <div className="cost-value">${cost.thisMonth.toFixed(2)}</div>
          </div>
          <div className="cost-box">
            <h4>Budget Status</h4>
            <div className="cost-value" style={{ fontSize: '0.95rem' }}>
              {cost.isOverBudget ? 'Over Budget' : cost.warningThresholdReached ? 'Warning' : 'OK'}
            </div>
          </div>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="settings-section">
        <h3>Configured Providers</h3>
        <div className="provider-grid">
          {KNOWN_PROVIDERS.map(spec => {
            const isConfigured = configuredNames.has(spec.id);
            const isPrimary = routing.primary === spec.id;
            const isFallback = routing.fallback === spec.id;
            const isExpanded = expanded === spec.id;
            const models = getProviderModels(spec.id);

            return (
              <div
                key={spec.id}
                className={`provider-card${isConfigured ? ' configured' : ''}${isExpanded ? ' expanded' : ''}`}
                onClick={() => handleExpand(spec.id)}
              >
                <div className="provider-card-header">
                  <h3>
                    <span className={`status-dot ${isConfigured ? 'active' : 'inactive'}`} />
                    {spec.label}
                  </h3>
                  <div className="provider-badges">
                    {isPrimary && <span className="badge-pill badge-primary">Primary</span>}
                    {isFallback && <span className="badge-pill badge-fallback">Fallback</span>}
                  </div>
                </div>
                <div className="provider-model">
                  {isConfigured ? (models.length > 0 ? `${models.length} model(s) available` : 'Active') : 'Not configured'}
                </div>

                {isExpanded && (
                  <div className="provider-expand" onClick={e => e.stopPropagation()}>
                    {spec.needsKey && (
                      <>
                        <label>API Key</label>
                        <input
                          type="password"
                          value={cardApiKey}
                          onChange={e => setCardApiKey(e.target.value)}
                          placeholder={isConfigured ? '••••••••  (leave blank to keep)' : 'Enter API key'}
                        />
                      </>
                    )}
                    {spec.needsEndpoint && (
                      <>
                        <label>Endpoint URL</label>
                        <input
                          type="text"
                          value={cardEndpoint}
                          onChange={e => setCardEndpoint(e.target.value)}
                          placeholder={spec.id === 'ollama' ? 'http://localhost:11434' : 'https://...'}
                        />
                      </>
                    )}
                    {models.length > 0 && (
                      <>
                        <label>Default Model</label>
                        <select value={cardModel} onChange={e => setCardModel(e.target.value)}>
                          <option value="">Keep current</option>
                          {models.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </>
                    )}
                    <div className="provider-actions">
                      <button
                        className="btn-save"
                        onClick={() => handleSaveProvider(spec.id)}
                        disabled={saving || (!cardApiKey && spec.needsKey && !isConfigured && !spec.needsEndpoint)}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {success && <div className="settings-success" style={{ marginTop: '0.5rem' }}>{success}</div>}
                    {error && <div className="error" style={{ marginTop: '0.5rem' }}>{error}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
