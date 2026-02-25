import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../api.js';

interface NotificationPreferences {
  dnd: {
    enabled: boolean;
    schedule: { start: string; end: string };
  };
  urgencyKeywords: string[];
  sources: {
    email: boolean;
    calendar: boolean;
    github: boolean;
  };
  soundEnabled: boolean;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  source: string;
  timestamp: number;
}

const DEFAULT_PREFS: NotificationPreferences = {
  dnd: {
    enabled: false,
    schedule: { start: '22:00', end: '08:00' },
  },
  urgencyKeywords: [],
  sources: {
    email: true,
    calendar: true,
    github: true,
  },
  soundEnabled: true,
};

export function SettingsNotifications() {
  const { data: prefsData, loading: fetchingPrefs } = useApi(() => api.getNotificationPreferences(), []);
  const { data: notifsData, loading: fetchingNotifs } = useApi(() => api.getNotifications(), []);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [keywordsText, setKeywordsText] = useState('');

  useEffect(() => {
    if (prefsData?.data && Object.keys(prefsData.data).length > 0) {
      const d = prefsData.data;
      const merged: NotificationPreferences = {
        dnd: {
          enabled: d.dnd?.enabled ?? DEFAULT_PREFS.dnd.enabled,
          schedule: {
            start: d.dnd?.schedule?.start ?? DEFAULT_PREFS.dnd.schedule.start,
            end: d.dnd?.schedule?.end ?? DEFAULT_PREFS.dnd.schedule.end,
          },
        },
        urgencyKeywords: d.urgencyKeywords ?? DEFAULT_PREFS.urgencyKeywords,
        sources: {
          email: d.sources?.email ?? DEFAULT_PREFS.sources.email,
          calendar: d.sources?.calendar ?? DEFAULT_PREFS.sources.calendar,
          github: d.sources?.github ?? DEFAULT_PREFS.sources.github,
        },
        soundEnabled: d.soundEnabled ?? DEFAULT_PREFS.soundEnabled,
      };
      setPrefs(merged);
      setKeywordsText((merged.urgencyKeywords || []).join(', '));
    }
  }, [prefsData]);

  useEffect(() => {
    if (notifsData?.data) {
      setNotifications(notifsData.data);
    }
  }, [notifsData]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const keywords = keywordsText
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
      await api.updateNotificationPreferences({ ...prefs, urgencyKeywords: keywords });
      setSuccess('Notification settings saved successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.dismissNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      // ignore
    }
  };

  if (fetchingPrefs || fetchingNotifs) return null;

  return (
    <div className="page">
      <h2>Notification Settings</h2>
      <div className="settings-form">
        <div className="settings-section">
          <h3>Do Not Disturb</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              className={`toggle${prefs.dnd.enabled ? ' active' : ''}`}
              onClick={() => setPrefs(prev => ({
                ...prev,
                dnd: { ...prev.dnd, enabled: !prev.dnd.enabled },
              }))}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {prefs.dnd.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {prefs.dnd.enabled && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <label>Start</label>
                <input
                  type="time"
                  value={prefs.dnd.schedule.start}
                  onChange={(e) => setPrefs(prev => ({
                    ...prev,
                    dnd: { ...prev.dnd, schedule: { ...prev.dnd.schedule, start: e.target.value } },
                  }))}
                />
              </div>
              <div>
                <label>End</label>
                <input
                  type="time"
                  value={prefs.dnd.schedule.end}
                  onChange={(e) => setPrefs(prev => ({
                    ...prev,
                    dnd: { ...prev.dnd, schedule: { ...prev.dnd.schedule, end: e.target.value } },
                  }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Urgency Keywords</h3>
          <label>Comma-separated keywords that mark a notification as urgent</label>
          <textarea
            rows={3}
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder="urgent, critical, deadline, asap"
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div className="settings-section">
          <h3>Sources</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['email', 'calendar', 'github'] as const).map(source => (
              <label key={source} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={prefs.sources[source]}
                  onChange={() => setPrefs(prev => ({
                    ...prev,
                    sources: { ...prev.sources, [source]: !prev.sources[source] },
                  }))}
                  style={{ width: 'auto', marginBottom: 0 }}
                />
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Sound</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              className={`toggle${prefs.soundEnabled ? ' active' : ''}`}
              onClick={() => setPrefs(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {prefs.soundEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        <button className="settings-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {success && <div className="settings-success">{success}</div>}
        {error && <div className="error">{error}</div>}

        {notifications.length > 0 && (
          <div className="settings-section" style={{ marginTop: '2rem' }}>
            <h3>Recent Notifications</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {notifications.map(n => (
                <div key={n.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary, #1a1a2e)',
                  borderRadius: '6px',
                }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{n.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {n.source} &middot; {new Date(n.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="settings-btn"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={() => handleDismiss(n.id)}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
