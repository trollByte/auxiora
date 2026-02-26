import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

interface ProviderInfo {
  name: string;
  displayName: string;
  available: boolean;
  models: Record<string, unknown>;
  credentialSource?: string;
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

const KNOWN_PROVIDERS: Array<{
  id: string;
  label: string;
  needsKey: boolean;
  needsEndpoint?: boolean;
  needsOAuth?: boolean;
}> = [
  { id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true },
  { id: 'claudeOAuth', label: 'Claude (OAuth)', needsKey: false, needsOAuth: true },
  { id: 'openai', label: 'OpenAI', needsKey: true },
  { id: 'google', label: 'Google (Gemini)', needsKey: true },
  { id: 'ollama', label: 'Ollama (Local)', needsKey: false, needsEndpoint: true },
  { id: 'groq', label: 'Groq', needsKey: true },
  { id: 'deepseek', label: 'DeepSeek', needsKey: true },
  { id: 'cohere', label: 'Cohere', needsKey: true },
  { id: 'xai', label: 'xAI (Grok)', needsKey: true },
  { id: 'openaiCompatible', label: 'OpenAI-Compatible', needsKey: true, needsEndpoint: true },
  { id: 'openrouter', label: 'OpenRouter', needsKey: true },
  { id: 'huggingface', label: 'HuggingFace', needsKey: true },
];

/** Turn a raw model ID into a friendly display name */
function friendlyModelName(id: string): string {
  // Anthropic — order matters: more specific prefixes first
  if (id.startsWith('claude-opus-4-6'))      return 'Claude Opus 4.6';
  if (id.startsWith('claude-sonnet-4-5'))    return 'Claude Sonnet 4.5';
  if (id.startsWith('claude-haiku-4-5'))     return 'Claude Haiku 4.5';
  if (id.startsWith('claude-opus-4'))        return 'Claude Opus 4';
  if (id.startsWith('claude-sonnet-4'))      return 'Claude Sonnet 4';
  if (id.startsWith('claude-3-5-haiku'))     return 'Claude Haiku 3.5';
  if (id.startsWith('claude-3-5-sonnet'))    return 'Claude Sonnet 3.5';
  if (id.startsWith('claude-3-opus'))        return 'Claude Opus 3';
  // OpenAI
  if (id === 'gpt-4o')        return 'GPT-4o';
  if (id === 'gpt-4o-mini')   return 'GPT-4o Mini';
  if (id === 'gpt-4-turbo')   return 'GPT-4 Turbo';
  if (id.startsWith('o1'))    return id.toUpperCase();
  if (id.startsWith('o3'))    return id.toUpperCase();
  // Google
  if (id.startsWith('gemini-'))return id.replace('gemini-', 'Gemini ');
  // Fallback: just show the ID
  return id;
}

export function SettingsProvider() {
  const { data, refresh } = useApi(() => api.getModels(), []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Claude OAuth flow state
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthWaitingForCode, setOauthWaitingForCode] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);

  // Routing state
  const [primary, setPrimary] = useState('');
  const [fallback, setFallback] = useState('');
  const [routingSaving, setRoutingSaving] = useState(false);

  // Per-card form state
  const [cardApiKey, setCardApiKey] = useState('');
  const [cardEndpoint, setCardEndpoint] = useState('');
  const [cardModel, setCardModel] = useState('');

  // Active model change state
  const [activeModelSaving, setActiveModelSaving] = useState(false);

  const providers: ProviderInfo[] = data?.providers ?? [];
  const routing: RoutingInfo = data?.routing ?? { enabled: false, primary: '', fallback: '' };
  const cost: CostInfo = data?.cost ?? { today: 0, thisMonth: 0, isOverBudget: false, warningThresholdReached: false };

  // Sync routing state when data loads
  useEffect(() => {
    if (routing.primary) setPrimary(routing.primary);
    if (routing.fallback) setFallback(routing.fallback);
  }, [routing.primary, routing.fallback]);

  // Check Claude OAuth status on load
  useEffect(() => {
    api.getClaudeOAuthStatus()
      .then(s => setOauthConnected(s.connected))
      .catch(err => console.error('Failed to check OAuth status:', err));
  }, []);

  const configuredNames = new Set(providers.filter(p => p.available).map(p => p.name));

  const getProviderModels = (name: string): string[] => {
    const p = providers.find(pr => pr.name === name);
    if (!p?.models) return [];
    return Object.keys(p.models);
  };

  // Build a flat list of all available models across all providers
  const allModels: Array<{ provider: string; providerLabel: string; model: string }> = [];
  for (const p of providers) {
    if (!p.available || !p.models) continue;
    const spec = KNOWN_PROVIDERS.find(k => k.id === p.name);
    for (const modelId of Object.keys(p.models)) {
      allModels.push({
        provider: p.name,
        providerLabel: spec?.label ?? p.displayName ?? p.name,
        model: modelId,
      });
    }
  }

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

  const handleStartOAuth = async () => {
    setOauthConnecting(true);
    setError('');
    setSuccess('');
    try {
      const { authUrl } = await api.startClaudeOAuth();
      window.open(authUrl, '_blank');
      setOauthWaitingForCode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth');
    } finally {
      setOauthConnecting(false);
    }
  };

  const handleCompleteOAuth = async () => {
    if (!oauthCode.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.completeClaudeOAuth(oauthCode.trim());
      setSuccess('Claude OAuth connected successfully');
      setOauthWaitingForCode(false);
      setOauthCode('');
      setOauthConnected(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete OAuth');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectOAuth = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.disconnectClaudeOAuth();
      setSuccess('Claude OAuth disconnected');
      setOauthConnected(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect OAuth');
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

  const handleActiveModelChange = async (value: string) => {
    if (!value) return;
    const [provider, ...rest] = value.split('/');
    const model = rest.join('/');
    setActiveModelSaving(true);
    setError('');
    setSuccess('');
    try {
      // Set this as the default model for the provider
      await api.setProviderModel(provider, model);
      // If a different provider is selected, also make it primary
      if (provider !== routing.primary) {
        await api.updateRouting(provider, routing.primary || undefined);
      }
      setSuccess(`Switched to ${friendlyModelName(model)}`);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActiveModelSaving(false);
    }
  };

  const configuredProviderOptions = providers.filter(p => p.available);

  return (
    <div className="page">
      <h2>Providers</h2>

      {/* Active Model Selector — the main thing people want */}
      {allModels.length > 0 && (
        <div className="settings-section">
          <h3>Active Model</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Choose which AI model to use. This changes the default for all new messages.
          </p>
          <div className="routing-config">
            <div className="routing-field" style={{ flex: 2 }}>
              <label>Model</label>
              <select
                onChange={e => handleActiveModelChange(e.target.value)}
                disabled={activeModelSaving}
                defaultValue=""
              >
                <option value="" disabled>Select a model...</option>
                {configuredProviderOptions.map(p => {
                  const models = getProviderModels(p.name);
                  if (models.length === 0) return null;
                  const spec = KNOWN_PROVIDERS.find(k => k.id === p.name);
                  return (
                    <optgroup key={p.name} label={spec?.label ?? p.displayName ?? p.name}>
                      {models.map(m => (
                        <option key={`${p.name}/${m}`} value={`${p.name}/${m}`}>
                          {friendlyModelName(m)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>
          {success && <div className="settings-success">{success}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {/* Routing Configuration */}
      {configuredProviderOptions.length > 1 && (
        <div className="settings-section">
          <h3>Provider Routing</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Set primary and fallback providers. Fallback is used when the primary is unavailable.
          </p>
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
      )}

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
        <h3>Manage Providers</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Click a card to configure API keys and endpoints.
        </p>
        <div className="provider-grid">
          {KNOWN_PROVIDERS.map(spec => {
            const providerData = providers.find(p => p.name === spec.id);
            const isConfigured = configuredNames.has(spec.id);
            const isOAuthCard = spec.id === 'claudeOAuth';
            const isActive = isOAuthCard ? oauthConnected : isConfigured;
            const isPrimary = routing.primary === spec.id;
            const isFallback = routing.fallback === spec.id;
            const isExpanded = expanded === spec.id;
            const models = getProviderModels(spec.id);

            return (
              <div
                key={spec.id}
                className={`provider-card${isActive ? ' configured' : ''}${isExpanded ? ' expanded' : ''}`}
                onClick={() => handleExpand(spec.id)}
              >
                <div className="provider-card-header">
                  <h3>
                    <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
                    {isActive && providerData?.displayName ? providerData.displayName : spec.label}
                  </h3>
                  <div className="provider-badges">
                    {isPrimary && <span className="badge-pill badge-primary">Primary</span>}
                    {isFallback && <span className="badge-pill badge-fallback">Fallback</span>}
                  </div>
                </div>
                <div className="provider-model">
                  {isActive
                    ? (models.length > 0
                      ? models.map(m => friendlyModelName(m)).join(', ')
                      : 'Active')
                    : 'Not configured'}
                  {providerData?.credentialSource === 'claude-cli' && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--accent)' }}>(Claude Code CLI)</span>
                  )}
                  {providerData?.credentialSource === 'oauth' && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--accent)' }}>(OAuth)</span>
                  )}
                </div>

                {isExpanded && (
                  <div className="provider-expand" onClick={e => e.stopPropagation()}>
                    {spec.needsOAuth ? (
                      // Claude OAuth flow
                      <>
                        {oauthConnected ? (
                          <>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                              Connected via Claude OAuth. Your Claude Pro/Max subscription is being used.
                            </p>
                            {models.length > 0 && (
                              <>
                                <label>Default Model</label>
                                <select value={cardModel} onChange={e => setCardModel(e.target.value)}>
                                  <option value="">Keep current</option>
                                  {models.map(m => (
                                    <option key={m} value={m}>{friendlyModelName(m)}</option>
                                  ))}
                                </select>
                              </>
                            )}
                            <div className="provider-actions">
                              <button
                                className="btn-save"
                                onClick={handleDisconnectOAuth}
                                disabled={saving}
                                style={{ background: 'var(--error, #e74c3c)' }}
                              >
                                {saving ? 'Disconnecting...' : 'Disconnect'}
                              </button>
                            </div>
                          </>
                        ) : oauthWaitingForCode ? (
                          <>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                              Authorize in the browser tab that opened, then paste the code below.
                            </p>
                            <label>Authorization Code</label>
                            <input
                              type="text"
                              value={oauthCode}
                              onChange={e => setOauthCode(e.target.value)}
                              placeholder="Paste the code from claude.ai"
                              autoFocus
                            />
                            <div className="provider-actions">
                              <button
                                className="btn-save"
                                onClick={handleCompleteOAuth}
                                disabled={saving || !oauthCode.trim()}
                              >
                                {saving ? 'Connecting...' : 'Complete Connection'}
                              </button>
                              <button
                                onClick={() => { setOauthWaitingForCode(false); setOauthCode(''); }}
                                style={{ marginLeft: '0.5rem' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                              Connect your Claude Pro or Max subscription. No API key needed.
                            </p>
                            <div className="provider-actions">
                              <button
                                className="btn-save"
                                onClick={handleStartOAuth}
                                disabled={oauthConnecting}
                              >
                                {oauthConnecting ? 'Opening...' : 'Connect with Claude'}
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      // Original API key / endpoint form
                      <>
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
                                <option key={m} value={m}>{friendlyModelName(m)}</option>
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
                      </>
                    )}
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
