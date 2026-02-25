import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';

interface ProviderEntry {
  name: string;
  label: string;
  keyPlaceholder: string;
  keyLabel: string;
  isLocal?: boolean;
}

const PROVIDERS: ProviderEntry[] = [
  { name: 'anthropic', label: 'Anthropic (Claude)', keyPlaceholder: 'sk-ant-...', keyLabel: 'API Key' },
  { name: 'openai', label: 'OpenAI (GPT)', keyPlaceholder: 'sk-...', keyLabel: 'API Key' },
  { name: 'google', label: 'Google (Gemini)', keyPlaceholder: 'AI...', keyLabel: 'API Key' },
  { name: 'groq', label: 'Groq', keyPlaceholder: 'gsk_...', keyLabel: 'API Key' },
  { name: 'deepseek', label: 'DeepSeek', keyPlaceholder: 'sk-...', keyLabel: 'API Key' },
  { name: 'xai', label: 'xAI (Grok)', keyPlaceholder: 'xai-...', keyLabel: 'API Key' },
  { name: 'cohere', label: 'Cohere', keyPlaceholder: '...', keyLabel: 'API Key' },
  { name: 'replicate', label: 'Replicate', keyPlaceholder: 'r8_...', keyLabel: 'API Token' },
  { name: 'ollama', label: 'Ollama (Local)', keyPlaceholder: '', keyLabel: '', isLocal: true },
];

export function SetupProvider() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const setKey = (name: string, value: string) => {
    setKeys(prev => ({ ...prev, [name]: value }));
  };

  const hasAnyProvider = Object.values(keys).some(v => v.trim()) || keys.ollama !== undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const providers: Array<{ name: string; apiKey?: string; endpoint?: string }> = [];

    for (const p of PROVIDERS) {
      if (p.isLocal) {
        if (keys.ollama !== undefined) {
          providers.push({ name: 'ollama', endpoint: ollamaEndpoint });
        }
        continue;
      }
      const key = keys[p.name]?.trim();
      if (key) {
        providers.push({ name: p.name, apiKey: key });
      }
    }

    if (providers.length === 0) {
      setError('Add at least one provider API key to continue');
      setLoading(false);
      return;
    }

    try {
      await api.setupProviders(providers);
      navigate('/setup/channels');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to configure providers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={6} />
      <div className="setup-card">
        <h1>AI Providers</h1>
        <p className="subtitle">
          Add API keys for the providers you want to use. The first one with a key becomes the default.
          You can add more later in Settings.
        </p>
        <form onSubmit={handleSubmit}>
          {PROVIDERS.map(p => (
            <div key={p.name} className="setup-provider-row">
              <label className="setup-provider-label">{p.label}</label>
              {p.isLocal ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={keys.ollama !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setKey('ollama', 'enabled');
                      } else {
                        setKeys(prev => {
                          const next = { ...prev };
                          delete next.ollama;
                          return next;
                        });
                      }
                    }}
                  />
                  <input
                    type="text"
                    value={ollamaEndpoint}
                    onChange={(e) => setOllamaEndpoint(e.target.value)}
                    placeholder="http://localhost:11434"
                    disabled={keys.ollama === undefined}
                    style={{ flex: 1 }}
                  />
                </div>
              ) : (
                <input
                  type="password"
                  value={keys[p.name] || ''}
                  onChange={(e) => setKey(p.name, e.target.value)}
                  placeholder={p.keyPlaceholder}
                />
              )}
            </div>
          ))}
          <button type="submit" className="setup-btn-primary" disabled={loading || !hasAnyProvider}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
