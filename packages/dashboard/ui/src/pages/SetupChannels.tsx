import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SetupProgress } from '../components/SetupProgress';

interface ChannelDef {
  type: string;
  name: string;
  description: string;
  fields: Array<{ key: string; label: string; type: string }>;
}

const CHANNELS: ChannelDef[] = [
  { type: 'webchat', name: 'Webchat', description: 'Built-in, no setup needed', fields: [] },
  { type: 'discord', name: 'Discord', description: 'Connect a Discord bot', fields: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
  ]},
  { type: 'telegram', name: 'Telegram', description: 'Connect a Telegram bot', fields: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
  ]},
  { type: 'slack', name: 'Slack', description: 'Connect to a Slack workspace', fields: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
    { key: 'appToken', label: 'App Token', type: 'password' },
  ]},
  { type: 'matrix', name: 'Matrix', description: 'Connect to a Matrix homeserver', fields: [
    { key: 'homeserverUrl', label: 'Homeserver URL', type: 'text' },
    { key: 'userId', label: 'User ID', type: 'text' },
    { key: 'accessToken', label: 'Access Token', type: 'password' },
  ]},
  { type: 'signal', name: 'Signal', description: 'Connect via Signal CLI', fields: [
    { key: 'cliEndpoint', label: 'CLI Endpoint', type: 'text' },
    { key: 'phoneNumber', label: 'Phone Number', type: 'text' },
  ]},
  { type: 'teams', name: 'Teams', description: 'Connect to Microsoft Teams', fields: [
    { key: 'appId', label: 'App ID', type: 'text' },
    { key: 'appPassword', label: 'App Password', type: 'password' },
  ]},
  { type: 'whatsapp', name: 'WhatsApp', description: 'Connect via WhatsApp Business API', fields: [
    { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text' },
    { key: 'accessToken', label: 'Access Token', type: 'password' },
    { key: 'verifyToken', label: 'Verify Token', type: 'text' },
  ]},
  { type: 'twilio', name: 'Twilio', description: 'Connect via Twilio SMS', fields: [
    { key: 'accountSid', label: 'Account SID', type: 'text' },
    { key: 'authToken', label: 'Auth Token', type: 'password' },
    { key: 'phoneNumber', label: 'Phone Number', type: 'text' },
  ]},
  { type: 'email', name: 'Email', description: 'Connect via IMAP/SMTP', fields: [
    { key: 'imapHost', label: 'IMAP Host', type: 'text' },
    { key: 'imapPort', label: 'IMAP Port', type: 'text' },
    { key: 'smtpHost', label: 'SMTP Host', type: 'text' },
    { key: 'smtpPort', label: 'SMTP Port', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
  ]},
];

export function SetupChannels() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ webchat: true });
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toggleChannel = (type: string) => {
    if (type === 'webchat') return;
    setEnabled((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const setField = (type: string, key: string, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: value },
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const channels = CHANNELS
        .filter((ch) => enabled[ch.type])
        .map((ch) => ({
          type: ch.type,
          enabled: true,
          credentials: credentials[ch.type],
        }));
      await api.setupChannels(channels);
      navigate('/setup/connections');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save channels');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <SetupProgress currentStep={6} />
      <div className="setup-card" style={{ maxWidth: 720 }}>
        <h1>Channels</h1>
        <p className="subtitle">Enable the messaging channels you want to connect.</p>
        <div className="channel-grid">
          {CHANNELS.map((ch) => (
            <div key={ch.type} className="channel-card">
              <div className="channel-card-header">
                <h3>{ch.name}</h3>
                {ch.type === 'webchat' ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Always on</span>
                ) : (
                  <div
                    className={`toggle${enabled[ch.type] ? ' active' : ''}`}
                    onClick={() => toggleChannel(ch.type)}
                  />
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{ch.description}</p>
              {enabled[ch.type] && ch.fields.length > 0 && (
                <div className="channel-card-fields">
                  {ch.fields.map((f) => (
                    <div key={f.key}>
                      <label>{f.label}</label>
                      <input
                        type={f.type}
                        value={credentials[ch.type]?.[f.key] || ''}
                        onChange={(e) => setField(ch.type, f.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="setup-btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save & Continue'}
        </button>
        {error && <p className="error">{error}</p>}
        <span className="skip-link" onClick={() => navigate('/setup/connections')}>Skip for now</span>
      </div>
    </div>
  );
}
