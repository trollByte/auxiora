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
    <div className="page">
      <h2>Connections</h2>
      <div className="settings-form">
        {success && <div className="settings-success" onClick={() => setSuccess('')}>{success}</div>}
        {error && <div className="error">{error}</div>}

        {CONNECTORS.map(connector => {
          const state = states[connector.id];
          const isConnected = state?.connected;
          const hasCredentials = state?.hasCredentials;

          return (
            <div key={connector.id} className="settings-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3>{connector.name}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {connector.description}
                  </span>
                </div>
                <span className={isConnected ? 'badge badge-green' : 'badge badge-gray'}>
                  {state?.loading ? 'Checking...' : isConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
                Enables: {connector.scopes}
              </p>

              {isConnected ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
                  {state?.expiresAt && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Token expires: {new Date(state.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                  <button type="button" className="btn-sm" onClick={() => handleStartOAuth(connector.id)}>
                    Reconnect
                  </button>
                  <button type="button" className="btn-sm btn-danger" onClick={() => handleDisconnect(connector.id)}>
                    Disconnect
                  </button>
                </div>
              ) : hasCredentials ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="button" className="settings-btn" onClick={() => handleStartOAuth(connector.id)}>
                    Connect
                  </button>
                  <button type="button" className="btn-sm" onClick={() => setShowSetup(connector.id)}>
                    Update Credentials
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '1rem' }}>
                  {showSetup !== connector.id ? (
                    <button type="button" className="settings-btn" onClick={() => setShowSetup(connector.id)}>
                      Set Up
                    </button>
                  ) : null}
                </div>
              )}

              {showSetup === connector.id && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 0.75rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Setup Instructions</h4>
                  <ol style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', margin: '0 0 1rem' }}>
                    {connector.instructions.map((step, i) => (
                      <li key={i} style={{ marginBottom: '0.35rem' }}>
                        {step.replace('{callbackUrl}', callbackUrl)}
                      </li>
                    ))}
                  </ol>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', wordBreak: 'break-all' }}>
                    Redirect URI: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.82em' }}>{callbackUrl}</code>
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
                    <button type="button" className="settings-btn" onClick={() => handleSaveCredentials(connector.id)}>
                      Save & Connect
                    </button>
                    <button type="button" className="btn-sm" onClick={() => { setShowSetup(null); setError(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
