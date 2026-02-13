import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';

export function SetupProvider() {
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('http://localhost:11434');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.setupProvider(
        provider,
        provider !== 'ollama' ? apiKey : undefined,
        provider === 'ollama' ? endpoint : undefined,
      );
      navigate('/setup/channels');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to configure provider');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={6} />
      <div className="setup-card">
        <h1>AI Provider</h1>
        <p className="subtitle">Choose which AI model provider to use.</p>
        <form onSubmit={handleSubmit}>
          <label>Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (Local)</option>
          </select>
          {provider !== 'ollama' && (
            <>
              <label>API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </>
          )}
          {provider === 'ollama' && (
            <>
              <label>Endpoint URL</label>
              <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            </>
          )}
          <button type="submit" className="setup-btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
