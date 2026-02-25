import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

export function SettingsPersonality() {
  const { data, loading } = useApi(() => api.getTemplates(), []);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const templates = data?.data ?? [];

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updatePersonality(selected);
      setSuccess('Personality template applied');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Personality</h2>
      {loading && <p>Loading templates...</p>}
      <div className="template-grid">
        {templates.map((t: any) => (
          <div
            key={t.id}
            className={`template-card${selected === t.id ? ' selected' : ''}`}
            onClick={() => setSelected(t.id)}
          >
            <h3>{t.name}</h3>
            <p>{t.description}</p>
          </div>
        ))}
      </div>
      {templates.length > 0 && (
        <button className="settings-btn" onClick={handleSave} disabled={saving || !selected}>
          {saving ? 'Applying...' : 'Apply Template'}
        </button>
      )}
      {success && <div className="settings-success">{success}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
