import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

export function SettingsProvider() {
  const { data } = useApi(() => api.getModels(), []);
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const providers = data?.providers ?? [];
  const activeProvider = providers.find((p: any) => p.available);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateProvider(
        provider,
        provider !== 'ollama' ? apiKey : undefined,
        provider === 'ollama' ? endpoint : undefined,
      );
      setSuccess('Provider updated successfully');
      setApiKey('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Provider</h2>
      {activeProvider && (
        <div className="settings-section">
          <h3>Current Provider</h3>
          <p>{activeProvider.displayName ?? activeProvider.name}</p>
          <div className="masked-key">
            {activeProvider.available ? 'Configured and active' : 'Not configured'}
          </div>
        </div>
      )}
      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-section">
          <h3>Update Provider</h3>
          <label>Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (Local)</option>
          </select>

          {provider !== 'ollama' ? (
            <>
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter new API key"
              />
            </>
          ) : (
            <>
              <label>Endpoint URL</label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </>
          )}

          <button className="settings-btn" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {success && <div className="settings-success">{success}</div>}
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
