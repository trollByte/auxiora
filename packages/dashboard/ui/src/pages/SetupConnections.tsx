import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';

export function SetupConnections() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleConnect = async () => {
    if (!clientId || !clientSecret) {
      setError('Both Client ID and Client Secret are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.saveConnectorCredentials('google-workspace', clientId, clientSecret);
      if (result.oauthUrl) {
        window.location.href = result.oauthUrl;
      } else {
        navigate('/setup/complete');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={8} />
      <div className="setup-card">
        <h1>Connections</h1>
        <p className="subtitle">Connect external services for calendar, email, and task intelligence.</p>
        <div className="settings-section">
          <h3>Google Workspace</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Connect your Google account to enable calendar awareness, email summaries, and task sync.
          </p>
          <label>Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="your-client-id.apps.googleusercontent.com"
          />
          <label>Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="GOCSPX-..."
          />
          <button
            type="button"
            className="setup-btn-primary"
            onClick={handleConnect}
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Connect Google Account'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
        <button
          type="button"
          className="setup-btn-secondary"
          onClick={() => navigate('/setup/complete')}
        >
          Continue without connecting
        </button>
        <span className="skip-link" onClick={() => navigate('/setup/complete')}>Skip for now</span>
      </div>
    </div>
  );
}
