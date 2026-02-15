import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

const AVAILABLE_CHANNELS = [
  { type: 'discord', label: 'Discord', fields: [{ key: 'botToken', label: 'Bot Token', secret: true }] },
  { type: 'telegram', label: 'Telegram', fields: [{ key: 'botToken', label: 'Bot Token', secret: true }] },
  { type: 'slack', label: 'Slack', fields: [{ key: 'botToken', label: 'Bot Token', secret: true }, { key: 'appToken', label: 'App Token', secret: true }] },
  { type: 'twilio', label: 'Twilio', fields: [{ key: 'accountSid', label: 'Account SID', secret: false }, { key: 'authToken', label: 'Auth Token', secret: true }] },
  { type: 'matrix', label: 'Matrix', fields: [{ key: 'accessToken', label: 'Access Token', secret: true }] },
  {
    type: 'email',
    label: 'Email',
    fields: [
      { key: 'imapHost', label: 'IMAP Host', secret: false },
      { key: 'imapPort', label: 'IMAP Port', secret: false },
      { key: 'smtpHost', label: 'SMTP Host', secret: false },
      { key: 'smtpPort', label: 'SMTP Port', secret: false },
      { key: 'email', label: 'Email Address', secret: false },
      { key: 'password', label: 'Password (App Password for Gmail)', secret: true },
    ],
  },
];

interface ChannelState {
  enabled: boolean;
  credentials: Record<string, string>;
}

export function SettingsChannels() {
  const { data } = useApi(() => api.getChannels(), []);
  const connected = data?.data?.connected ?? [];
  const configured = data?.data?.configured ?? [];

  const [channelStates, setChannelStates] = useState<Record<string, ChannelState>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const getState = (type: string): ChannelState => {
    if (channelStates[type]) return channelStates[type];
    const conf = configured.find(c => c.type === type);
    return { enabled: conf?.enabled ?? false, credentials: {} };
  };

  const toggleChannel = (type: string) => {
    const current = getState(type);
    setChannelStates(prev => ({
      ...prev,
      [type]: { ...current, enabled: !current.enabled },
    }));
  };

  const updateCredential = (type: string, key: string, value: string) => {
    const current = getState(type);
    setChannelStates(prev => ({
      ...prev,
      [type]: { ...current, credentials: { ...current.credentials, [key]: value } },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const channels = AVAILABLE_CHANNELS
        .filter(ch => getState(ch.type).enabled || Object.values(getState(ch.type).credentials).some(v => v))
        .map(ch => {
          const state = getState(ch.type);
          const creds: Record<string, string> = {};
          for (const [k, v] of Object.entries(state.credentials)) {
            if (v) creds[k] = v;
          }
          return {
            type: ch.type,
            enabled: state.enabled,
            ...(Object.keys(creds).length > 0 ? { credentials: creds } : {}),
          };
        });
      await api.updateChannels(channels);
      setSuccess('Channels updated successfully');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Channels</h2>
      <div className="channel-grid">
        {AVAILABLE_CHANNELS.map(ch => {
          const state = getState(ch.type);
          const isConnected = connected.includes(ch.type);
          return (
            <div key={ch.type} className="channel-card">
              <div className="channel-card-header">
                <h3>{ch.label}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isConnected
                    ? <span className="badge badge-green">Connected</span>
                    : state.enabled && <span className="badge badge-yellow">Configured</span>
                  }
                  <div
                    className={`toggle${state.enabled ? ' active' : ''}`}
                    onClick={() => toggleChannel(ch.type)}
                  />
                </div>
              </div>
              {state.enabled && (
                <div className="channel-card-fields">
                  {ch.fields.map(f => (
                    <div key={f.key}>
                      <label>{f.label}</label>
                      <input
                        type={f.secret ? 'password' : 'text'}
                        value={state.credentials[f.key] ?? ''}
                        onChange={(e) => updateCredential(ch.type, f.key, e.target.value)}
                        placeholder={isConnected ? '(configured)' : `Enter ${f.label.toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="settings-btn" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
      {success && <div className="settings-success">{success}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
