import { useState, useEffect } from 'react';
import { api } from '../api';

interface ConnectorState {
  hasCredentials: boolean;
  connected: boolean;
  expiresAt?: number;
  loading: boolean;
}

const CONNECTORS = [
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Gmail, Google Calendar, and Google Drive',
    scopes: 'Email summaries, calendar awareness, drive file access',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    instructions: [
      'Go to Google Cloud Console > APIs & Services > Credentials',
      'Create an OAuth 2.0 Client ID (Web application type)',
      'Add authorized redirect URI: {callbackUrl}',
      'Enable Gmail API, Google Calendar API, and Google Drive API',
    ],
  },
];

export function SettingsConnections() {
  const [states, setStates] = useState<Record<string, ConnectorState>>({});
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSetup, setShowSetup] = useState<string | null>(null);

  const callbackUrl = `${window.location.origin}/api/v1/dashboard/connectors/google-workspace/callback`;

  useEffect(() => {
    void loadStatuses();
  }, []);

  async function loadStatuses() {
    for (const connector of CONNECTORS) {
      setStates(prev => ({ ...prev, [connector.id]: { ...prev[connector.id]!, loading: true, hasCredentials: false, connected: false } }));
      try {
        const result = await api.getConnectorStatus(connector.id);
        setStates(prev => ({
          ...prev,
          [connector.id]: {
            hasCredentials: result.data.hasCredentials,
            connected: result.data.connected,
            expiresAt: result.data.expiresAt,
            loading: false,
          },
        }));
      } catch {
        setStates(prev => ({ ...prev, [connector.id]: { hasCredentials: false, connected: false, loading: false } }));
      }
    }
  }

  async function handleSaveCredentials(connectorId: string) {
    if (!clientId || !clientSecret) {
      setError('Both Client ID and Client Secret are required');
      return;
    }
    setError('');
    try {
      await api.saveConnectorCredentials(connectorId, clientId, clientSecret);
      setSuccess('Credentials saved. Click "Connect" to authorize.');
      setClientId('');
      setClientSecret('');
      setShowSetup(null);
      void loadStatuses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    }
  }

  function handleStartOAuth(connectorId: string) {
    window.location.href = `/api/v1/dashboard/connectors/${connectorId}/auth`;
  }

  async function handleDisconnect(connectorId: string) {
    try {
      await api.disconnectConnector(connectorId);
      setSuccess('Disconnected successfully');
      void loadStatuses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  return (
    <div className="settings-page">
      <h1>Connections</h1>
      <p className="subtitle">Connect external services for email, calendar, and file intelligence.</p>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner" onClick={() => setSuccess('')}>{success}</div>}

      {CONNECTORS.map(connector => {
        const state = states[connector.id];
        const isConnected = state?.connected;
        const hasCredentials = state?.hasCredentials;

        return (
          <div key={connector.id} className="settings-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>{connector.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0' }}>
                  {connector.description}
                </p>
              </div>
              <span style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: isConnected ? 'var(--success-bg, #dcfce7)' : 'var(--muted-bg, #f3f4f6)',
                color: isConnected ? 'var(--success-text, #166534)' : 'var(--text-secondary)',
              }}>
                {state?.loading ? 'Checking...' : isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #9ca3af)', margin: '0.5rem 0' }}>
              Enables: {connector.scopes}
            </p>

            {isConnected ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                {state?.expiresAt && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    Token expires: {new Date(state.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <button type="button" className="btn-secondary" onClick={() => handleStartOAuth(connector.id)}>
                  Reconnect
                </button>
                <button type="button" className="btn-danger" onClick={() => handleDisconnect(connector.id)}>
                  Disconnect
                </button>
              </div>
            ) : hasCredentials ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn-primary" onClick={() => handleStartOAuth(connector.id)}>
                  Connect
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowSetup(connector.id)}>
                  Update Credentials
                </button>
              </div>
            ) : (
              <div style={{ marginTop: '1rem' }}>
                {showSetup !== connector.id ? (
                  <button type="button" className="btn-primary" onClick={() => setShowSetup(connector.id)}>
                    Set Up
                  </button>
                ) : null}
              </div>
            )}

            {showSetup === connector.id && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-bg, #f9fafb)', borderRadius: '0.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem' }}>Setup Instructions</h4>
                <ol style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', margin: '0 0 1rem' }}>
                  {connector.instructions.map((step, i) => (
                    <li key={i} style={{ marginBottom: '0.35rem' }}>
                      {step.replace('{callbackUrl}', callbackUrl)}
                    </li>
                  ))}
                </ol>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary, #9ca3af)', marginBottom: '1rem', wordBreak: 'break-all' }}>
                  Redirect URI: <code style={{ background: 'var(--code-bg, #e5e7eb)', padding: '0.15rem 0.35rem', borderRadius: '0.25rem' }}>{callbackUrl}</code>
                </div>

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
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn-primary" onClick={() => handleSaveCredentials(connector.id)}>
                    Save & Connect
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setShowSetup(null); setError(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
