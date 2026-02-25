import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';

const CATEGORIES = ['Calendar', 'Email', 'Tasks', 'Patterns'] as const;

interface AmbientConfig {
  morningBriefing: {
    enabled: boolean;
    time: string;
    categories: string[];
  };
  eveningSummary: {
    enabled: boolean;
    time: string;
  };
  deliveryChannel: string;
}

const DEFAULT_CONFIG: AmbientConfig = {
  morningBriefing: {
    enabled: true,
    time: '08:00',
    categories: ['Calendar', 'Email'],
  },
  eveningSummary: {
    enabled: false,
    time: '18:00',
  },
  deliveryChannel: 'all',
};

export function SettingsAmbient() {
  const { data, loading: fetching } = useApi(() => api.getAmbientConfig(), []);
  const [config, setConfig] = useState<AmbientConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (data?.data) {
      setConfig({
        morningBriefing: {
          enabled: data.data.morningBriefing?.enabled ?? DEFAULT_CONFIG.morningBriefing.enabled,
          time: data.data.morningBriefing?.time ?? DEFAULT_CONFIG.morningBriefing.time,
          categories: data.data.morningBriefing?.categories ?? DEFAULT_CONFIG.morningBriefing.categories,
        },
        eveningSummary: {
          enabled: data.data.eveningSummary?.enabled ?? DEFAULT_CONFIG.eveningSummary.enabled,
          time: data.data.eveningSummary?.time ?? DEFAULT_CONFIG.eveningSummary.time,
        },
        deliveryChannel: data.data.deliveryChannel ?? DEFAULT_CONFIG.deliveryChannel,
      });
    }
  }, [data]);

  const toggleCategory = (category: string) => {
    setConfig(prev => {
      const cats = prev.morningBriefing.categories;
      const next = cats.includes(category)
        ? cats.filter(c => c !== category)
        : [...cats, category];
      return {
        ...prev,
        morningBriefing: { ...prev.morningBriefing, categories: next },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateAmbientConfig(config);
      setSuccess('Ambient settings saved successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (fetching) return null;

  return (
    <div className="page">
      <h2>Ambient Intelligence</h2>
      <div className="settings-form">
        <div className="settings-section">
          <h3>Morning Briefing</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              className={`toggle${config.morningBriefing.enabled ? ' active' : ''}`}
              onClick={() => setConfig(prev => ({
                ...prev,
                morningBriefing: { ...prev.morningBriefing, enabled: !prev.morningBriefing.enabled },
              }))}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {config.morningBriefing.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {config.morningBriefing.enabled && (
            <>
              <label>Delivery Time</label>
              <input
                type="time"
                value={config.morningBriefing.time}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  morningBriefing: { ...prev.morningBriefing, time: e.target.value },
                }))}
              />
              <label>Categories</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {CATEGORIES.map(cat => (
                  <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={config.morningBriefing.categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      style={{ width: 'auto', marginBottom: 0 }}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <h3>Evening Summary</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              className={`toggle${config.eveningSummary.enabled ? ' active' : ''}`}
              onClick={() => setConfig(prev => ({
                ...prev,
                eveningSummary: { ...prev.eveningSummary, enabled: !prev.eveningSummary.enabled },
              }))}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {config.eveningSummary.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {config.eveningSummary.enabled && (
            <>
              <label>Delivery Time</label>
              <input
                type="time"
                value={config.eveningSummary.time}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  eveningSummary: { ...prev.eveningSummary, time: e.target.value },
                }))}
              />
            </>
          )}
        </div>

        <div className="settings-section">
          <label>Delivery Channel</label>
          <select
            value={config.deliveryChannel}
            onChange={(e) => setConfig(prev => ({ ...prev, deliveryChannel: e.target.value }))}
          >
            <option value="all">All connected channels</option>
            <option value="webchat">Webchat only</option>
            <option value="discord">Discord</option>
            <option value="telegram">Telegram</option>
            <option value="slack">Slack</option>
            <option value="email">Email</option>
          </select>
        </div>

        <button className="settings-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {success && <div className="settings-success">{success}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
